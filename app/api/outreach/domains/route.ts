import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { encryptSecret } from "@/lib/crypto";
import { requireOrgContext } from "@/lib/auth/multi-tenant";
import {
  checkRateLimit,
  RATE_LIMITS,
  rateLimitHeaders,
} from "@/lib/rate-limit";
import {
  domainCreateSchema,
  domainRecheckSchema,
  formatZodError,
} from "@/lib/validation";

type DnsStatus = "valid" | "warning" | "missing" | "checking";

type DomainProvider =
  | "google"
  | "microsoft"
  | "smtp"
  | "zoho"
  | "godaddy"
  | "hostinger"
  | "other";

function getDnsRecords(
  domain: string,
  provider: string,
  spf: string,
  dkim: string,
  dmarc: string
) {
  const records = [];

  const spfIncludes: Record<string, string> = {
    google: "include:_spf.google.com",
    microsoft: "include:spf.protection.outlook.com",
    zoho: "include:zoho.com",
    godaddy: "include:secureserver.net",
    hostinger: "include:_spf.mail.hostinger.com",
    smtp: "include:_spf.yourprovider.com",
    other: "include:_spf.yourprovider.com",
  };
  const spfInclude = spfIncludes[provider] || spfIncludes.other;

  records.push({
    name: "SPF",
    status: spf,
    host: domain,
    type: "TXT",
    value: `v=spf1 ${spfInclude} ~all`,
    instruction:
      spf === "valid"
        ? "SPF record is properly configured."
        : `Add a TXT record to your DNS with the value below. This authorizes ${
            provider === "google"
              ? "Google"
              : provider === "microsoft"
                ? "Microsoft"
                : provider === "zoho"
                  ? "Zoho"
                  : provider === "godaddy"
                    ? "GoDaddy"
                    : provider === "hostinger"
                      ? "Hostinger"
                      : "your email provider"
          } to send email on behalf of ${domain}.`,
    priority: spf === "missing" ? "critical" : spf === "warning" ? "recommended" : "ok",
  });

  const dkimConfig: Record<
    string,
    { selector: string; instruction: string; value: string }
  > = {
    google: {
      selector: "google",
      instruction:
        "Generate your DKIM key in Google Admin Console → Apps → Google Workspace → Gmail → Authenticate Email.",
      value: "v=DKIM1; k=rsa; p=<generated-key>",
    },
    microsoft: {
      selector: "selector1",
      instruction:
        "Generate your DKIM key in Microsoft 365 Defender → Email & collaboration → Policies → DKIM.",
      value: "v=DKIM1; k=rsa; p=<generated-key>",
    },
    zoho: {
      selector: "zmail",
      instruction:
        "Find your DKIM key in Zoho Mail Admin → Email Authentication → DKIM.",
      value: "v=DKIM1; k=rsa; p=<generated-key>",
    },
    godaddy: {
      selector: "default",
      instruction:
        "If using GoDaddy email, verify DKIM configuration in GoDaddy Email Settings.",
      value: "v=DKIM1; k=rsa; p=<generated-key>",
    },
    hostinger: {
      selector: "default",
      instruction:
        "Check Hostinger hPanel → Emails → DNS Records for DKIM setup.",
      value: "v=DKIM1; k=rsa; p=<generated-key>",
    },
    smtp: {
      selector: "default",
      instruction:
        "Generate a DKIM key pair with your email provider and add the public key TXT record.",
      value: "v=DKIM1; k=rsa; p=<your-dkim-public-key>",
    },
    other: {
      selector: "default",
      instruction: "Check your email provider's DKIM setup instructions.",
      value: "v=DKIM1; k=rsa; p=<your-dkim-public-key>",
    },
  };

  const dkimDetails = dkimConfig[provider] || dkimConfig.other;

  records.push({
    name: "DKIM",
    status: dkim,
    host: `${dkimDetails.selector}._domainkey.${domain}`,
    type: "TXT",
    value: dkimDetails.value,
    instruction:
      dkim === "valid"
        ? "DKIM signing is properly configured."
        : dkimDetails.instruction,
    priority: dkim === "missing" ? "critical" : dkim === "warning" ? "recommended" : "ok",
  });

  records.push({
    name: "DMARC",
    status: dmarc,
    host: `_dmarc.${domain}`,
    type: "TXT",
    value: `v=DMARC1; p=quarantine; rua=mailto:dmarc-reports@${domain}; pct=100`,
    instruction:
      dmarc === "valid"
        ? "DMARC policy is properly configured."
        : `Add a TXT record at _dmarc.${domain} in your DNS manager.`,
    priority: dmarc === "missing" ? "critical" : dmarc === "warning" ? "recommended" : "ok",
  });

  return records;
}

function sanitizeInbox(row: Record<string, unknown>) {
  const { smtp_pass, smtp_pass_encrypted, ...safeRow } = row;
  void smtp_pass;
  void smtp_pass_encrypted;

  return {
    ...safeRow,
    health:
      typeof row.health_score === "number"
        ? row.health_score >= 90
          ? "excellent"
          : row.health_score >= 70
            ? "good"
            : row.health_score >= 50
              ? "fair"
              : "poor"
        : "fair",
    bounce_rate: Number(row.bounce_rate ?? 0),
    reply_rate: Number(row.reply_rate ?? 0),
    open_rate: Number(row.open_rate ?? 0),
  };
}

function sanitizeDomain(row: Record<string, unknown>) {
  const {
    smtp_pass,
    smtp_pass_encrypted,
    imap_pass,
    imap_pass_encrypted,
    ...safeRow
  } = row;

  void smtp_pass;
  void smtp_pass_encrypted;
  void imap_pass;
  void imap_pass_encrypted;

  return {
    ...safeRow,
    dns: {
      spf: row.spf_status,
      dkim: row.dkim_status,
      dmarc: row.dmarc_status,
      dmarc_policy: row.dmarc_policy,
    },
    dns_records: getDnsRecords(
      String(row.domain),
      String(row.provider),
      String(row.spf_status),
      String(row.dkim_status),
      String(row.dmarc_status)
    ),
    health:
      typeof row.health_score === "number"
        ? row.health_score >= 90
          ? "excellent"
          : row.health_score >= 70
            ? "good"
            : row.health_score >= 50
              ? "fair"
              : "poor"
        : "fair",
  };
}

async function resolveDnsStatus(domain: string): Promise<{
  spf_status: DnsStatus;
  dkim_status: DnsStatus;
  dmarc_status: DnsStatus;
  dmarc_policy: string | null;
}> {
  let spf_status: DnsStatus = "checking";
  let dkim_status: DnsStatus = "checking";
  let dmarc_status: DnsStatus = "checking";
  let dmarc_policy: string | null = null;

  try {
    const dns = await import("dns").then((mod) => mod.promises);

    try {
      const txtRecords = await dns.resolveTxt(domain);
      const spfRecord = txtRecords.flat().find((value) => value.startsWith("v=spf1"));
      spf_status = spfRecord ? "valid" : "missing";
    } catch {
      spf_status = "missing";
    }

    try {
      const dmarcRecords = await dns.resolveTxt(`_dmarc.${domain}`);
      const dmarcRecord = dmarcRecords
        .flat()
        .find((value) => value.startsWith("v=DMARC1"));

      if (dmarcRecord) {
        dmarc_status = "valid";
        const policyMatch = dmarcRecord.match(/p=(\w+)/);
        dmarc_policy = policyMatch ? policyMatch[1] : null;
      } else {
        dmarc_status = "missing";
      }
    } catch {
      dmarc_status = "missing";
    }

    try {
      const selectors = [
        "google",
        "default",
        "selector1",
        "selector2",
        "k1",
        "dkim",
        "zmail",
        "s1",
        "s2",
        "hostinger",
        "mail",
        "hstgr",
      ];

      let dkimFound = false;
      for (const selector of selectors) {
        try {
          const records = await dns.resolveTxt(`${selector}._domainkey.${domain}`);
          if (records.length > 0) {
            dkimFound = true;
            break;
          }
        } catch {
          continue;
        }
      }

      dkim_status = dkimFound ? "valid" : "warning";
    } catch {
      dkim_status = "warning";
    }
  } catch {
    spf_status = "warning";
    dkim_status = "warning";
    dmarc_status = "warning";
  }

  return { spf_status, dkim_status, dmarc_status, dmarc_policy };
}

function computeDomainHealth(input: {
  provider: DomainProvider;
  spf_status: DnsStatus;
  dkim_status: DnsStatus;
  dmarc_status: DnsStatus;
  dmarc_policy: string | null;
}) {
  const dnsScore = [input.spf_status, input.dkim_status, input.dmarc_status].filter(
    (status) => status === "valid"
  ).length;

  const managedProviders = ["google", "microsoft", "zoho", "godaddy", "hostinger"];

  let healthScore =
    Math.round((dnsScore / 3) * 60) +
    (input.dmarc_policy === "reject" ? 20 : input.dmarc_policy === "quarantine" ? 15 : 5) +
    (managedProviders.includes(input.provider) ? 15 : 0);

  healthScore = Math.min(100, healthScore);

  let blockReason: string | null = null;
  if (input.spf_status === "missing") {
    blockReason = "SPF record missing. Add an SPF TXT record to your DNS.";
  } else if (input.dmarc_status === "missing") {
    blockReason = "DMARC record missing. Add a DMARC TXT record to enable sending.";
  }

  const canSend = !blockReason;
  const dailyLimit = canSend
    ? input.provider === "google"
      ? 200
      : input.provider === "microsoft"
        ? 150
        : input.provider === "zoho"
          ? 150
          : input.provider === "godaddy"
            ? 100
            : input.provider === "hostinger"
              ? 100
              : 80
    : 0;

  return {
    healthScore,
    canSend,
    blockReason,
    dailyLimit,
  };
}

// GET — list all domains with their inboxes (org scoped)
export async function GET(request: NextRequest) {
  const auth = await requireOrgContext(request);
  if (!auth.ok) {
    return auth.response;
  }

  const apiRate = checkRateLimit(`api:${auth.context.userId}`, RATE_LIMITS.apiUser);
  if (!apiRate.allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: rateLimitHeaders(apiRate) }
    );
  }

  try {
    const domainsResult = await pool.query(
      `SELECT * FROM outreach_domains
       WHERE org_id = $1
       ORDER BY connected_at DESC`,
      [auth.context.orgId]
    );

    const domains = [];

    for (const domainRow of domainsResult.rows) {
      const inboxesResult = await pool.query(
        `SELECT * FROM outreach_inboxes
         WHERE org_id = $1 AND domain_id = $2
         ORDER BY created_at ASC`,
        [auth.context.orgId, domainRow.id]
      );

      domains.push({
        ...sanitizeDomain(domainRow),
        inboxes: inboxesResult.rows.map(sanitizeInbox),
      });
    }

    return NextResponse.json(
      { domains },
      { headers: rateLimitHeaders(apiRate) }
    );
  } catch (error) {
    console.error("Error fetching domains:", error);
    return NextResponse.json(
      { error: "Failed to fetch domains" },
      { status: 500, headers: rateLimitHeaders(apiRate) }
    );
  }
}

// POST — connect a new domain
export async function POST(request: NextRequest) {
  const auth = await requireOrgContext(request);
  if (!auth.ok) {
    return auth.response;
  }

  const apiRate = checkRateLimit(`api:${auth.context.userId}`, RATE_LIMITS.apiUser);
  if (!apiRate.allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: rateLimitHeaders(apiRate) }
    );
  }

  try {
    const rawBody = await request.json();
    const parsed = domainCreateSchema.safeParse(rawBody);

    if (!parsed.success) {
      return NextResponse.json(
        { error: formatZodError(parsed.error) },
        { status: 400, headers: rateLimitHeaders(apiRate) }
      );
    }

    const {
      domain,
      provider,
      smtp_host,
      smtp_port,
      smtp_user,
      smtp_pass,
      imap_host,
      imap_port,
      imap_pass,
    } = parsed.data;

    const existing = await pool.query(
      `SELECT id
       FROM outreach_domains
       WHERE org_id = $1 AND domain = $2`,
      [auth.context.orgId, domain]
    );

    if (existing.rows.length > 0) {
      return NextResponse.json(
        { error: "Domain already connected" },
        { status: 409, headers: rateLimitHeaders(apiRate) }
      );
    }

    const dnsStatus = await resolveDnsStatus(domain);
    const health = computeDomainHealth({
      provider,
      spf_status: dnsStatus.spf_status,
      dkim_status: dnsStatus.dkim_status,
      dmarc_status: dnsStatus.dmarc_status,
      dmarc_policy: dnsStatus.dmarc_policy,
    });

    const smtpEncrypted = smtp_pass ? encryptSecret(smtp_pass) : null;
    const imapEncrypted = imap_pass ? encryptSecret(imap_pass) : null;

    const result = await pool.query(
      `INSERT INTO outreach_domains
         (org_id, domain, provider, smtp_host, smtp_port, smtp_user, smtp_pass_encrypted,
          imap_host, imap_port, imap_pass_encrypted,
          spf_status, dkim_status, dmarc_status, dmarc_policy,
          health_score, can_send, block_reason, daily_limit)
       VALUES
         ($1, $2, $3, $4, $5, $6, $7,
          $8, $9, $10,
          $11, $12, $13, $14,
          $15, $16, $17, $18)
       RETURNING *`,
      [
        auth.context.orgId,
        domain,
        provider,
        smtp_host ?? null,
        smtp_port ?? 587,
        smtp_user ?? null,
        smtpEncrypted,
        imap_host ?? null,
        imap_port ?? 993,
        imapEncrypted,
        dnsStatus.spf_status,
        dnsStatus.dkim_status,
        dnsStatus.dmarc_status,
        dnsStatus.dmarc_policy,
        health.healthScore,
        health.canSend,
        health.blockReason,
        health.dailyLimit,
      ]
    );

    return NextResponse.json(
      { domain: sanitizeDomain(result.rows[0]) },
      { status: 201, headers: rateLimitHeaders(apiRate) }
    );
  } catch (error) {
    console.error("Error connecting domain:", error);
    return NextResponse.json(
      { error: "Failed to connect domain" },
      { status: 500, headers: rateLimitHeaders(apiRate) }
    );
  }
}

// PUT — re-check DNS for an existing domain
export async function PUT(request: NextRequest) {
  const auth = await requireOrgContext(request);
  if (!auth.ok) {
    return auth.response;
  }

  const apiRate = checkRateLimit(`api:${auth.context.userId}`, RATE_LIMITS.apiUser);
  if (!apiRate.allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: rateLimitHeaders(apiRate) }
    );
  }

  try {
    const rawBody = await request.json();
    const parsed = domainRecheckSchema.safeParse(rawBody);

    if (!parsed.success) {
      return NextResponse.json(
        { error: formatZodError(parsed.error) },
        { status: 400, headers: rateLimitHeaders(apiRate) }
      );
    }

    const domainResult = await pool.query(
      `SELECT *
       FROM outreach_domains
       WHERE id = $1 AND org_id = $2`,
      [parsed.data.id, auth.context.orgId]
    );

    if (domainResult.rows.length === 0) {
      return NextResponse.json(
        { error: "Domain not found" },
        { status: 404, headers: rateLimitHeaders(apiRate) }
      );
    }

    const domainRow = domainResult.rows[0] as {
      provider: DomainProvider;
      domain: string;
    };

    const dnsStatus = await resolveDnsStatus(domainRow.domain);
    const health = computeDomainHealth({
      provider: domainRow.provider,
      spf_status: dnsStatus.spf_status,
      dkim_status: dnsStatus.dkim_status,
      dmarc_status: dnsStatus.dmarc_status,
      dmarc_policy: dnsStatus.dmarc_policy,
    });

    const result = await pool.query(
      `UPDATE outreach_domains
       SET spf_status = $1,
           dkim_status = $2,
           dmarc_status = $3,
           dmarc_policy = $4,
           health_score = $5,
           can_send = $6,
           block_reason = $7,
           daily_limit = $8,
           updated_at = NOW()
       WHERE id = $9 AND org_id = $10
       RETURNING *`,
      [
        dnsStatus.spf_status,
        dnsStatus.dkim_status,
        dnsStatus.dmarc_status,
        dnsStatus.dmarc_policy,
        health.healthScore,
        health.canSend,
        health.blockReason,
        health.dailyLimit,
        parsed.data.id,
        auth.context.orgId,
      ]
    );

    return NextResponse.json(
      { domain: sanitizeDomain(result.rows[0]) },
      { headers: rateLimitHeaders(apiRate) }
    );
  } catch (error) {
    console.error("Error re-checking domain:", error);
    return NextResponse.json(
      { error: "Failed to re-check" },
      { status: 500, headers: rateLimitHeaders(apiRate) }
    );
  }
}

// DELETE — disconnect a domain
export async function DELETE(request: NextRequest) {
  const auth = await requireOrgContext(request);
  if (!auth.ok) {
    return auth.response;
  }

  const apiRate = checkRateLimit(`api:${auth.context.userId}`, RATE_LIMITS.apiUser);
  if (!apiRate.allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: rateLimitHeaders(apiRate) }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "Domain ID required" },
        { status: 400, headers: rateLimitHeaders(apiRate) }
      );
    }

    await pool.query(
      `DELETE FROM outreach_domains
       WHERE id = $1 AND org_id = $2`,
      [id, auth.context.orgId]
    );

    return NextResponse.json(
      { success: true },
      { headers: rateLimitHeaders(apiRate) }
    );
  } catch (error) {
    console.error("Error deleting domain:", error);
    return NextResponse.json(
      { error: "Failed to delete domain" },
      { status: 500, headers: rateLimitHeaders(apiRate) }
    );
  }
}
