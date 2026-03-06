# LeadBase — Email Deliverability Guide

## Why Deliverability Matters

If emails land in spam, nothing else matters. Open rates, reply rates, campaign ROI — all depend on inbox placement. A system sending 100K emails with 20% inbox placement is worse than one sending 10K with 95% placement.

---

## DNS Authentication (Already Implemented)

The system already checks these on domain connection. All three are required before sending is enabled.

### SPF (Sender Policy Framework)

- Tells receiving servers which IPs can send email for your domain
- Without SPF: emails are likely marked as suspicious
- Current implementation: `app/api/outreach/domains/route.ts` checks via `dns.resolveTxt()`

### DKIM (DomainKeys Identified Mail)

- Cryptographic signature proving the email wasn't modified in transit
- Without DKIM: emails may be rejected or spam-filtered
- Current implementation: checks common selectors (google, default, selector1, etc.)

### DMARC (Domain-based Message Authentication)

- Policy telling receivers what to do with emails that fail SPF/DKIM
- Without DMARC: no control over how failures are handled
- `p=none` — monitor only (starting point)
- `p=quarantine` — send failures to spam
- `p=reject` — reject failures entirely (best for deliverability)

---

## Sending Practices

### Volume Ramp-Up

Never go from 0 to full volume. ISPs flag sudden spikes.

| Week | Daily Volume per Inbox | Notes |
|------|----------------------|-------|
| 1 | 5-10 | Internal warmup if possible |
| 2 | 10-20 | Small batches to engaged lists |
| 3 | 20-35 | Monitor bounce rate closely |
| 4 | 35-50 | Scale if bounce rate < 2% |
| 5+ | 50-100 | Approach provider limits gradually |

### Sending Windows

- Best days: Tuesday, Wednesday, Thursday
- Best hours: 9am-11am and 1pm-3pm (recipient's timezone)
- Avoid: Monday morning, Friday afternoon, weekends
- The system supports configurable sending windows per campaign

### Throttling

- Never send more than 1 email every 3 minutes from a single inbox
- Randomize intervals (don't send at exactly equal spacing)
- Rotate across multiple inboxes
- Current config: `min_interval_seconds: 180`, `max_interval_seconds: 420`

---

## Bounce Management

### Hard Bounces

- Permanent delivery failure (mailbox doesn't exist, domain invalid)
- **Must immediately suppress** — never send to this address again
- SMTP codes: 550, 551, 552, 553, 554

### Soft Bounces

- Temporary delivery failure (mailbox full, server down)
- Retry up to 3 times with increasing delay
- If still failing after 3 attempts, suppress
- SMTP codes: 450, 451, 452

### Bounce Rate Thresholds

| Rate | Action |
|------|--------|
| < 2% | Healthy — continue sending |
| 2-5% | Warning — review lead list quality |
| 5-8% | Danger — pause and clean list |
| > 8% | Critical — auto-pause campaign, investigate |

ISPs (especially Gmail, Outlook) will blacklist senders with consistently high bounce rates.

---

## Suppression List

The suppression list is checked **before every single send**. It contains:

| Reason | Source | Permanent? |
|--------|--------|------------|
| `bounced` | Hard bounce detected | Yes |
| `unsubscribed` | Recipient clicked unsubscribe | Yes |
| `complained` | Recipient marked as spam | Yes |
| `invalid` | Email verification failed | Yes |
| `manual` | Added manually by user | Reversible |

### Suppression enforcement points

1. **Campaign activation** — filter out suppressed leads before generating queue
2. **Pre-send check** — verify again right before sending (lead may have been suppressed after queue generation)
3. **Cross-campaign** — suppression applies to ALL campaigns, not just the one that caused it

---

## Unsubscribe Compliance

### CAN-SPAM Requirements (US)

- Every email must include a visible unsubscribe mechanism
- Unsubscribe must be processed within 10 business days
- Cannot require login to unsubscribe
- Must include sender's physical mailing address

### RFC 8058 (List-Unsubscribe-Post)

Modern email clients (Gmail, Apple Mail) show a native "Unsubscribe" button if these headers are present:

```
List-Unsubscribe: <https://app.leadbase.io/api/unsubscribe/TRACKING_ID>
List-Unsubscribe-Post: List-Unsubscribe=One-Click
```

The system must include these headers on every outbound email.

---

## Content Best Practices

### What triggers spam filters

- ALL CAPS in subject line
- Excessive exclamation marks!!!
- Spam trigger words: free, limited time, act now, urgent, guaranteed
- Too many links (keep to 1-2 max)
- Large images with little text
- No text version (HTML-only emails)
- URL shorteners (bit.ly, etc.)
- Mismatched From name and domain

### What improves inbox placement

- Plain text or minimal HTML
- Short emails (under 150 words)
- Personalized opening line
- One clear CTA
- Matching From domain and sending domain
- Consistent sending patterns
- High reply rate (strongest positive signal)

### Current AI safeguards

The email generation API (`api/email/generate/route.ts`) already:
- Instructs the AI to avoid spammy language
- Caps emails at 120 words
- Computes a spam risk score
- Rejects emails with spam_risk_score > 60

---

## Provider-Specific Limits

| Provider | Daily Limit (SMTP) | API Limit | Notes |
|----------|-------------------|-----------|-------|
| Google Workspace | 2,000/day | 2,000/day (Gmail API) | Stricter for new accounts |
| Microsoft 365 | 10,000/day | 10,000/day (Graph API) | Per-mailbox, not per-domain |
| Zoho Mail | 500/day (free), more on paid | N/A | |
| GoDaddy | 500/day | N/A | Low limits |
| Hostinger | 500/day | N/A | Low limits |
| Custom SMTP | Varies | N/A | Depends on provider |

**Note:** The current hardcoded limits (Google=200, Microsoft=150) are conservative defaults, well under provider limits. This is intentional for deliverability safety.

---

## Monitoring Deliverability (Post-MVP)

### Google Postmaster Tools

- Shows domain reputation (high, medium, low, bad)
- Shows spam rate
- Shows authentication success rate
- Free, requires DNS verification

### Blacklist Monitoring

Check against major blacklists:
- Spamhaus (most impactful)
- Barracuda
- SORBS
- SpamCop

If listed on any:
1. Stop sending immediately
2. Identify cause (usually bounce rate or complaints)
3. Request delisting
4. Resume only after cleanup

---

## Scaling Safely

To send 10K-100K emails/day:

1. **Multiple domains** — don't send all volume from one domain
   - Rule of thumb: max 200-500 emails/day per domain
   - 100K/day = 200-500 domains

2. **Multiple inboxes per domain** — distribute within domains
   - 3-5 inboxes per domain
   - Each inbox has its own reputation

3. **Dedicated sending domains** — don't use your main business domain
   - Use subdomains: `outreach.company.com`, `mail.company.com`
   - Protects main domain reputation

4. **IP rotation** — at very high volume, use multiple sending IPs
   - Only relevant for self-hosted SMTP
   - Cloud providers (Google, Microsoft) handle this automatically

5. **Gradual scale-up** — increase volume 20-30% per week, not 10x overnight
