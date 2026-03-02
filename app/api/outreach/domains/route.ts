import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";

// Generate recommended DNS records for a domain
function getDnsRecords(domain: string, provider: string, spf: string, dkim: string, dmarc: string) {
    const records = [];

    // SPF record — provider-specific include
    const spfIncludes: Record<string, string> = {
        google: 'include:_spf.google.com',
        microsoft: 'include:spf.protection.outlook.com',
        zoho: 'include:zoho.com',
        godaddy: 'include:secureserver.net',
        smtp: 'include:_spf.yourprovider.com',
        other: 'include:_spf.yourprovider.com',
    };
    const spfInclude = spfIncludes[provider] || spfIncludes.other;

    records.push({
        name: 'SPF',
        status: spf,
        host: domain,
        type: 'TXT',
        value: `v=spf1 ${spfInclude} ~all`,
        instruction: spf === 'valid'
            ? 'SPF record is properly configured.'
            : `Add a TXT record to your DNS with the value below. This authorizes ${provider === 'google' ? 'Google' : provider === 'microsoft' ? 'Microsoft' :
                provider === 'zoho' ? 'Zoho' : provider === 'godaddy' ? 'GoDaddy' : 'your email provider'
            } to send email on behalf of ${domain}. Go to your DNS manager (GoDaddy, Namecheap, Cloudflare, etc.) and add this TXT record.`,
        priority: spf === 'missing' ? 'critical' : spf === 'warning' ? 'recommended' : 'ok',
    });

    // DKIM record — provider-specific selector & instructions
    const dkimConfig: Record<string, { selector: string; instruction: string; value: string }> = {
        google: {
            selector: 'google',
            instruction: 'Generate your DKIM key in Google Admin Console → Apps → Google Workspace → Gmail → Authenticate Email. Then add the TXT record to your DNS.',
            value: `v=DKIM1; k=rsa; p=<generated-key> — Generate in Google Admin Console → Gmail → Authenticate Email`,
        },
        microsoft: {
            selector: 'selector1',
            instruction: 'Generate your DKIM key in Microsoft 365 Defender → Email & collaboration → Policies → DKIM. Then add the CNAME records to your DNS.',
            value: `v=DKIM1; k=rsa; p=<generated-key> — Generate in Microsoft 365 Admin → Settings → Domains → ${domain}`,
        },
        zoho: {
            selector: 'zmail',
            instruction: 'Find your DKIM key in Zoho Mail Admin → Email Authentication → DKIM. Copy the TXT record value and add it to your DNS.',
            value: `v=DKIM1; k=rsa; p=<generated-key> — Find in Zoho Mail Admin → Email Authentication → DKIM`,
        },
        godaddy: {
            selector: 'default',
            instruction: 'If using GoDaddy Workspace Email, DKIM may be auto-configured. If not, go to GoDaddy Email Settings to find the DKIM key, then add it as a TXT record in your DNS.',
            value: `v=DKIM1; k=rsa; p=<generated-key> — Check GoDaddy Email Settings or your email provider's admin panel`,
        },
        smtp: {
            selector: 'default',
            instruction: 'Generate a DKIM key pair with your email provider and add the public key as a TXT record in your DNS.',
            value: `v=DKIM1; k=rsa; p=<your-dkim-public-key>`,
        },
        other: {
            selector: 'default',
            instruction: 'Check your email provider\'s documentation for DKIM setup instructions. You\'ll need to add a TXT record with your DKIM public key to your DNS.',
            value: `v=DKIM1; k=rsa; p=<your-dkim-public-key> — Check your email provider's admin panel for the key`,
        },
    };
    const dk = dkimConfig[provider] || dkimConfig.other;

    records.push({
        name: 'DKIM',
        status: dkim,
        host: `${dk.selector}._domainkey.${domain}`,
        type: 'TXT',
        value: dk.value,
        instruction: dkim === 'valid' ? 'DKIM signing is properly configured.' : dk.instruction,
        priority: dkim === 'missing' ? 'critical' : dkim === 'warning' ? 'recommended' : 'ok',
    });

    // DMARC record — same for all providers
    records.push({
        name: 'DMARC',
        status: dmarc,
        host: `_dmarc.${domain}`,
        type: 'TXT',
        value: `v=DMARC1; p=quarantine; rua=mailto:dmarc-reports@${domain}; ruf=mailto:dmarc-forensic@${domain}; pct=100`,
        instruction: dmarc === 'valid'
            ? 'DMARC policy is properly configured.'
            : `Add a TXT record at _dmarc.${domain} in your DNS manager. Start with p=none for monitoring, then upgrade to p=quarantine or p=reject. This protects your domain from spoofing and improves inbox placement.`,
        priority: dmarc === 'missing' ? 'critical' : dmarc === 'warning' ? 'recommended' : 'ok',
    });

    return records;
}

// GET — list all domains with their inboxes
export async function GET() {
    try {
        const domainsResult = await pool.query(`
      SELECT * FROM outreach_domains ORDER BY connected_at DESC
    `);

        const domains = [];
        for (const d of domainsResult.rows) {
            const inboxesResult = await pool.query(
                `SELECT * FROM outreach_inboxes WHERE domain_id = $1 ORDER BY created_at ASC`,
                [d.id]
            );

            const dnsRecords = getDnsRecords(d.domain, d.provider, d.spf_status, d.dkim_status, d.dmarc_status);

            domains.push({
                ...d,
                dns: {
                    spf: d.spf_status,
                    dkim: d.dkim_status,
                    dmarc: d.dmarc_status,
                    dmarc_policy: d.dmarc_policy,
                },
                dns_records: dnsRecords,
                health: d.health_score >= 90 ? 'excellent' : d.health_score >= 70 ? 'good' : d.health_score >= 50 ? 'fair' : 'poor',
                inboxes: inboxesResult.rows.map(i => ({
                    ...i,
                    health: i.health_score >= 90 ? 'excellent' : i.health_score >= 70 ? 'good' : i.health_score >= 50 ? 'fair' : 'poor',
                    bounce_rate: parseFloat(i.bounce_rate),
                    reply_rate: parseFloat(i.reply_rate),
                    open_rate: parseFloat(i.open_rate),
                })),
            });
        }

        return NextResponse.json({ domains });
    } catch (error) {
        console.error("Error fetching domains:", error);
        return NextResponse.json({ error: "Failed to fetch domains" }, { status: 500 });
    }
}

// POST — connect a new domain
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { domain, provider, smtp_host, smtp_port, smtp_user, smtp_pass, imap_host, imap_port } = body;

        if (!domain || !provider) {
            return NextResponse.json({ error: "Domain and provider are required" }, { status: 400 });
        }

        // Check if domain already exists
        const existing = await pool.query(
            `SELECT id FROM outreach_domains WHERE domain = $1`,
            [domain]
        );
        if (existing.rows.length > 0) {
            return NextResponse.json({ error: "Domain already connected" }, { status: 409 });
        }

        let spf_status = 'checking';
        let dkim_status = 'checking';
        let dmarc_status = 'checking';
        let dmarc_policy = null;
        let can_send = false;
        let block_reason: string | null = null;
        let health_score = 50;
        let daily_limit = 0;

        // Real DNS checks
        try {
            const dns = await import('dns').then(m => m.promises);

            // Check SPF
            try {
                const txtRecords = await dns.resolveTxt(domain);
                const spfRecord = txtRecords.flat().find(r => r.startsWith('v=spf1'));
                spf_status = spfRecord ? 'valid' : 'missing';
            } catch { spf_status = 'missing'; }

            // Check DMARC
            try {
                const dmarcRecords = await dns.resolveTxt(`_dmarc.${domain}`);
                const dmarcRecord = dmarcRecords.flat().find(r => r.startsWith('v=DMARC1'));
                if (dmarcRecord) {
                    dmarc_status = 'valid';
                    const policyMatch = dmarcRecord.match(/p=(\w+)/);
                    dmarc_policy = policyMatch ? policyMatch[1] : null;
                } else {
                    dmarc_status = 'missing';
                }
            } catch { dmarc_status = 'missing'; }

            // Check DKIM (common selectors)
            try {
                const selectors = ['google', 'default', 'selector1', 'selector2', 'k1', 'dkim', 'zmail', 's1', 's2'];
                let dkimFound = false;
                for (const sel of selectors) {
                    try {
                        const records = await dns.resolveTxt(`${sel}._domainkey.${domain}`);
                        if (records.length > 0) { dkimFound = true; break; }
                    } catch { /* try next */ }
                }
                dkim_status = dkimFound ? 'valid' : 'warning';
            } catch { dkim_status = 'warning'; }

        } catch {
            spf_status = 'warning';
            dkim_status = 'warning';
            dmarc_status = 'warning';
        }

        // Compute health and sending permission
        const dnsScore = [spf_status, dkim_status, dmarc_status].filter(s => s === 'valid').length;
        const managedProviders = ['google', 'microsoft', 'zoho', 'godaddy'];
        health_score = Math.round((dnsScore / 3) * 60) + (dmarc_policy === 'reject' ? 20 : dmarc_policy === 'quarantine' ? 15 : 5) + (managedProviders.includes(provider) ? 15 : 0);
        health_score = Math.min(100, health_score);

        if (spf_status === 'missing') {
            block_reason = 'SPF record missing. Add an SPF TXT record to your DNS.';
        } else if (dmarc_status === 'missing') {
            block_reason = 'DMARC record missing. Add a DMARC TXT record to enable sending.';
        }

        can_send = !block_reason;
        daily_limit = can_send ? (
            provider === 'google' ? 200 : provider === 'microsoft' ? 150 :
                provider === 'zoho' ? 150 : provider === 'godaddy' ? 100 : 80
        ) : 0;

        const result = await pool.query(
            `INSERT INTO outreach_domains
        (domain, provider, smtp_host, smtp_port, smtp_user, smtp_pass, imap_host, imap_port,
         spf_status, dkim_status, dmarc_status, dmarc_policy, health_score, can_send, block_reason, daily_limit)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
       RETURNING *`,
            [domain, provider, smtp_host || null, smtp_port || 587, smtp_user || null, smtp_pass || null,
                imap_host || null, imap_port || 993,
                spf_status, dkim_status, dmarc_status, dmarc_policy, health_score, can_send, block_reason, daily_limit]
        );

        return NextResponse.json({ domain: result.rows[0] }, { status: 201 });
    } catch (error) {
        console.error("Error connecting domain:", error);
        return NextResponse.json({ error: "Failed to connect domain" }, { status: 500 });
    }
}

// PUT — re-check DNS for an existing domain
export async function PUT(request: NextRequest) {
    try {
        const body = await request.json();
        const { id } = body;
        if (!id) return NextResponse.json({ error: "Domain ID required" }, { status: 400 });

        const domainResult = await pool.query(`SELECT * FROM outreach_domains WHERE id = $1`, [id]);
        if (domainResult.rows.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

        const d = domainResult.rows[0];
        let spf_status = 'warning', dkim_status = 'warning', dmarc_status = 'warning';
        let dmarc_policy = null;

        try {
            const dns = await import('dns').then(m => m.promises);
            try {
                const txt = await dns.resolveTxt(d.domain);
                spf_status = txt.flat().find(r => r.startsWith('v=spf1')) ? 'valid' : 'missing';
            } catch { spf_status = 'missing'; }

            try {
                const dmarc = await dns.resolveTxt(`_dmarc.${d.domain}`);
                const rec = dmarc.flat().find(r => r.startsWith('v=DMARC1'));
                if (rec) { dmarc_status = 'valid'; const m = rec.match(/p=(\w+)/); dmarc_policy = m ? m[1] : null; }
                else dmarc_status = 'missing';
            } catch { dmarc_status = 'missing'; }

            try {
                const sels = ['google', 'default', 'selector1', 'selector2', 'k1', 'dkim'];
                let found = false;
                for (const s of sels) { try { const r = await dns.resolveTxt(`${s}._domainkey.${d.domain}`); if (r.length) { found = true; break; } } catch { } }
                dkim_status = found ? 'valid' : 'warning';
            } catch { dkim_status = 'warning'; }
        } catch { }

        const dnsScore = [spf_status, dkim_status, dmarc_status].filter(s => s === 'valid').length;
        let health_score = Math.round((dnsScore / 3) * 60) + (dmarc_policy === 'reject' ? 20 : dmarc_policy === 'quarantine' ? 15 : 5) + (d.provider !== 'smtp' ? 15 : 0);
        health_score = Math.min(100, health_score);
        let block_reason: string | null = null;
        if (spf_status === 'missing') block_reason = 'SPF record missing.';
        else if (dmarc_status === 'missing') block_reason = 'DMARC record missing.';
        const can_send = !block_reason;
        const daily_limit = can_send ? (d.provider === 'google' ? 200 : d.provider === 'microsoft' ? 150 : 100) : 0;

        const result = await pool.query(
            `UPDATE outreach_domains SET spf_status=$1, dkim_status=$2, dmarc_status=$3, dmarc_policy=$4,
       health_score=$5, can_send=$6, block_reason=$7, daily_limit=$8, updated_at=NOW()
       WHERE id=$9 RETURNING *`,
            [spf_status, dkim_status, dmarc_status, dmarc_policy, health_score, can_send, block_reason, daily_limit, id]
        );
        return NextResponse.json({ domain: result.rows[0] });
    } catch (error) {
        console.error("Error re-checking domain:", error);
        return NextResponse.json({ error: "Failed to re-check" }, { status: 500 });
    }
}

// DELETE — disconnect a domain
export async function DELETE(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');
        if (!id) return NextResponse.json({ error: "Domain ID required" }, { status: 400 });

        await pool.query(`DELETE FROM outreach_domains WHERE id = $1`, [id]);
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Error deleting domain:", error);
        return NextResponse.json({ error: "Failed to delete domain" }, { status: 500 });
    }
}
