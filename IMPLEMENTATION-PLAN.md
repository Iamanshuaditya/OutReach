# LeadBase Outreach — Practical MVP Execution Plan

> Goal: Turn the existing skeleton into a **real outreach SaaS MVP** that can safely send campaigns, track engagement, and manage replies.

The objective is **not to build every outreach feature immediately**.

The real goal is:

> A user can connect an inbox, create a campaign, send emails safely, track opens/clicks, stop sequences on reply/unsubscribe, and see campaign results.

Everything else can come later.

---

# 1. Build Now vs Later

## Must Build (MVP Core)

These systems convert the project from **UI skeleton → real product**.

1. Real authentication + organization model
2. Credential encryption
3. Input validation
4. Rate limiting
5. SMTP sending
6. Queue processing
7. Campaign activation
8. Open tracking
9. Click tracking
10. Unsubscribe & suppression
11. Basic reply detection
12. Basic campaign analytics
13. Operational error logging

---

## Build Later (Post-MVP)

These are useful but not required for a working product.

* Inbox warmup engine
* Gmail/Microsoft OAuth
* Redis + BullMQ scale architecture
* Stripe billing
* A/B testing
* Lead enrichment
* Advanced deliverability monitoring
* Send-time optimization
* Webhooks
* Advanced reporting
* CRM integrations

---

# 2. Phase 0 — Security Cleanup (2–3 days)

This happens **before any new development**.

## Tasks

* Rotate all credentials
* Remove `.env.local` from git history
* Verify `.gitignore`
* Replace `changeme` authentication
* Add environment variable validation
* Freeze production deploys until finished

## Deliverable

A repository that **does not expose credentials**.

## Definition of Done

* All secrets rotated
* `.env.local` removed from history
* App fails fast if required env variables are missing

---

# 3. Phase 1 — Foundation (Week 1)

Do this **before building email features** to avoid massive refactors later.

---

## 3.1 Real Auth + Organization Model

### Tables

```sql
organizations
users
user_organizations
```

### Relationships

* Users can belong to multiple organizations
* Roles: owner, admin, member, viewer

### Add `org_id` to existing tables

* outreach_domains
* outreach_inboxes
* outreach_campaigns
* outreach_send_queue
* outreach_email_events
* outreach_suppression

### Deliverable

Every query and API route operates **inside an organization boundary**.

---

## 3.2 Credential Encryption

Create:

```
lib/crypto.ts
```

Use:

* AES-256-GCM
* Random IV
* Auth tag
* Versioned encrypted payloads

Encrypt:

* SMTP passwords
* IMAP passwords
* OAuth refresh tokens (future)

### Deliverable

Sensitive credentials are **encrypted at rest**.

---

## 3.3 Validation & Rate Limiting

Create:

```
lib/validation.ts
lib/rate-limit.ts
```

Use **Zod** schemas for:

* Domain creation
* Inbox creation
* Campaign creation
* Campaign activation
* AI email generation

### Rate Limits

| Endpoint            | Limit               |
| ------------------- | -------------------- |
| Auth                | 5/min per IP         |
| API                 | 60-100/min per user  |
| AI generation       | 20/min               |
| Campaign activation | stricter             |

### Deliverable

All APIs enforce **schema validation and abuse protection**.

---

# 4. Phase 2 — Email Sending Engine (Week 2)

This milestone makes the system capable of sending real emails.

---

## 4.1 SMTP Client

Create:

```
lib/email/smtp-client.ts
```

Dependency:

```
nodemailer
```

### Features

* Transporter pooling
* Connection verification
* TLS / STARTTLS
* Error classification
* Transport caching per inbox

### Interface

```ts
interface SMTPClient {
  testConnection(config: SMTPConfig): Promise<TestResult>
  sendEmail(inbox: Inbox, to: string, subject: string, body: string): Promise<SendResult>
  getTransporter(inboxId: string): nodemailer.Transporter
}
```

### Deliverable

System can **send a real email from a connected inbox**.

---

## 4.2 Email Composer

Create:

```
lib/email/composer.ts
```

Responsibilities:

* HTML + text email creation
* Variable substitution
* Tracking pixel injection
* Link wrapping
* Unsubscribe header
* Message-ID generation

### Supported variables

```
{{first_name}}
{{last_name}}
{{company}}
{{email}}
```

### Deliverable

A service that outputs **fully composed email messages** ready to send.

---

# 5. Phase 3 — Campaign Engine & Queue (Week 3)

This is the **heart of the product**.

---

## 5.1 Campaign Activation Engine

Create:

```
lib/email/campaign-engine.ts
```

### When campaign becomes active

1. Validate campaign configuration
2. Fetch leads
3. Remove suppressed emails
4. Assign inboxes
5. Generate send queue
6. Schedule send times
7. Activate campaign

### MVP Simplification

Only support:

* linear sequences
* email steps
* wait steps

### Deliverable

Activating a campaign generates **real send queue items**.

---

## 5.2 Scheduler

Create:

```
lib/email/scheduler.ts
```

Inputs:

* number of leads
* inboxes
* sending window
* daily limits
* timezone

Outputs:

* scheduled_at timestamps
* inbox assignment

### MVP rules

* evenly distribute sends
* random jitter
* respect daily caps
* optional weekend skipping

---

## 5.3 Queue Worker

Create:

```
lib/email/queue-worker.ts
app/api/cron/process-queue/route.ts
```

Initial implementation uses **cron**.

### Worker Loop

1. Fetch pending queue items
2. Claim items safely
3. Load campaign + inbox
4. Check suppression
5. Compose email
6. Send email
7. Update queue item
8. Record event
9. Update stats

### Critical Requirement

Worker must be **idempotent** to avoid duplicate sends.

---

# 6. Phase 4 — Tracking & Compliance (Week 4)

Make the system usable in real outreach environments.

---

## 6.1 Open Tracking

Create:

```
app/api/track/open/[id]/route.ts
```

Returns a **1x1 transparent GIF**.

Records:

* first open
* repeat opens
* timestamp
* user agent

Note: opens are approximate due to Apple privacy protection.

---

## 6.2 Click Tracking

Create:

```
app/api/track/click/[id]/route.ts
```

Behavior:

1. Decode original link
2. Record click event
3. Redirect via 302

---

## 6.3 Unsubscribe Handling

Create:

```
app/api/unsubscribe/[id]/route.ts
```

Steps:

1. Add email to suppression list
2. Cancel pending queue items
3. Stop future campaign sends
4. Record unsubscribe event

Suppression must be checked:

* during campaign activation
* before sending each email

---

# 7. Phase 5 — Reply Detection & Safety (Week 5)

Without reply detection campaigns become spam.

---

## 7.1 Reply Detector

Create:

```
lib/email/reply-detector.ts
app/api/cron/check-replies/route.ts
```

Process:

1. Poll IMAP inboxes
2. Parse new emails
3. Match replies via:

   * In-Reply-To
   * References
   * subject fallback
4. Record reply event
5. Stop campaign sequence for that lead

---

## 7.2 Bounce Handling

Create:

```
lib/email/bounce-handler.ts
```

MVP behavior:

* parse bounce emails
* detect hard bounces
* add to suppression list
* update bounce counters
* auto pause campaigns with high bounce rates

---

## 7.3 Operational Logging

Create internal logging for:

* queue failures
* SMTP errors
* inbox send limits
* campaign pauses
* bounce spikes

### Deliverable

Production issues can be diagnosed quickly.

---

# 8. Phase 6 — Basic Analytics (Week 6)

Keep analytics simple initially.

Metrics per campaign:

* Sent
* Opened
* Clicked
* Replied
* Bounced
* Unsubscribed
* Failed

Also show:

* inbox send counts
* event timeline
* failure logs

---

# 9. Features Deliberately Delayed

Do **not build these before MVP**:

* Advanced warmup networks
* Stripe billing
* BullMQ infrastructure
* Gmail / Microsoft OAuth
* A/B testing
* Lead enrichment
* Smart send-time optimization
* Advanced deliverability scoring
* PDF reports
* CRM integrations

---

# 10. MVP Milestones

## Milestone 1 — Secure Foundation

* secret rotation
* auth system
* org model
* encrypted credentials
* validation
* rate limits

---

## Milestone 2 — Send One Email

* SMTP client
* email composer
* inbox connection testing

---

## Milestone 3 — Run a Campaign

* campaign activation
* scheduler
* queue worker
* automated sending

---

## Milestone 4 — Track Engagement

* open tracking
* click tracking
* unsubscribe handling
* suppression enforcement

---

## Milestone 5 — Production Safety

* reply detection
* bounce handling
* failure visibility
* analytics dashboard

---

# 11. File Creation Order

## Wave 1

```
lib/crypto.ts
lib/validation.ts
lib/rate-limit.ts
lib/auth/multi-tenant.ts
```

---

## Wave 2

```
lib/email/smtp-client.ts
lib/email/composer.ts
```

---

## Wave 3

```
lib/email/scheduler.ts
lib/email/campaign-engine.ts
lib/email/queue-worker.ts
app/api/cron/process-queue/route.ts
```

---

## Wave 4

```
app/api/track/open/[id]/route.ts
app/api/track/click/[id]/route.ts
app/api/unsubscribe/[id]/route.ts
```

---

## Wave 5

```
lib/email/reply-detector.ts
app/api/cron/check-replies/route.ts
lib/email/bounce-handler.ts
```

---

## Wave 6

```
analytics dashboard
queue failure logs
database index migrations
```

---

# 12. Success Criteria After 6 Weeks

The system should support:

* multi-tenant architecture
* inbox connection
* automated campaign sending
* engagement tracking
* unsubscribe compliance
* reply detection
* bounce suppression
* campaign analytics
* operational monitoring

At that point you have a **real outreach SaaS MVP**.

---

# 13. Biggest Risks

## Product Risk

Building infrastructure before validating campaign success.

---

## Engineering Risk

Delaying multi-tenant architecture and needing massive refactors later.

---

## Deliverability Risk

Sending too aggressively before suppression and bounce protection exist.

---

## Operational Risk

Duplicate sends caused by non-idempotent workers.

Prevent this at all costs.

---

# Final Advice

Build in this order:

```
Auth & Orgs
    |
Encryption & Validation
    |
SMTP Sending
    |
Queue Worker
    |
Campaign Activation
    |
Tracking & Unsubscribe
    |
Reply Detection
    |
Analytics
```

Everything else can come later.
