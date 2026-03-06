# LeadBase — System Architecture

## Overview

LeadBase is a B2B outreach SaaS built on Next.js 16 with PostgreSQL. The system manages email domains, inboxes, campaigns, and automated sending at scale.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16, React 19, Tailwind CSS 4 |
| API | Next.js API Routes (App Router) |
| Database | PostgreSQL (DigitalOcean Managed) |
| Auth | JWT via `jose` |
| AI | Groq API (llama-3.3-70b-versatile) |
| Email | nodemailer (SMTP) |
| UI Components | Radix UI, Lucide Icons |

---

## Directory Structure

```
app/
  api/
    auth/              # Authentication routes
    outreach/
      domains/         # Domain CRUD + DNS verification
      inboxes/         # Inbox CRUD
      campaigns/       # Campaign CRUD
    email/
      generate/        # AI email generation
    track/
      open/[id]/       # Open tracking pixel
      click/[id]/      # Click tracking redirect
    unsubscribe/[id]/  # Unsubscribe handler
    cron/
      process-queue/   # Queue worker trigger
      check-replies/   # Reply detection trigger
    insights/          # Lead insights generation
    icp/               # ICP builder
  outreach/            # Outreach dashboard pages
  login/               # Auth pages

lib/
  db.ts                # PostgreSQL pool
  crypto.ts            # Credential encryption (AES-256-GCM)
  validation.ts        # Zod input schemas
  rate-limit.ts        # API rate limiting
  scoring.ts           # Lead scoring engine
  outreach-types.ts    # TypeScript interfaces
  outreach-engine.ts   # Health scoring utilities
  auth/
    multi-tenant.ts    # Organization-scoped auth
  email/
    smtp-client.ts     # SMTP transporter management
    composer.ts        # Email composition + tracking
    scheduler.ts       # Send time calculation
    campaign-engine.ts # Campaign lifecycle management
    queue-worker.ts    # Queue processing logic
    reply-detector.ts  # IMAP reply matching
    bounce-handler.ts  # Bounce classification + suppression

scripts/
  migrate-outreach.ts  # Outreach schema migration
  migrate-auth.ts      # Auth schema migration
```

---

## Request Flow

### Campaign Send Flow

```
User activates campaign
        |
        v
Campaign Engine
  - validates config
  - fetches leads
  - filters suppressed
  - assigns inboxes
  - generates queue items
  - calculates scheduled_at
        |
        v
outreach_send_queue (DB)
        |
        v
Cron trigger (every 60s)
        |
        v
Queue Worker
  - claims pending items (WHERE status='pending' AND scheduled_at <= NOW())
  - atomic status update (pending -> sending) to prevent duplicates
  - loads inbox config + decrypts SMTP creds
  - checks suppression list
  - composes email (tracking pixel, link wrapping, unsubscribe header)
  - sends via SMTP
  - updates status (sending -> sent | failed)
  - records email event
  - updates campaign + inbox stats
```

### Tracking Flow

```
Recipient opens email
  -> loads tracking pixel (GET /api/track/open/[tracking_id])
  -> server records 'opened' event
  -> returns 1x1 transparent GIF

Recipient clicks link
  -> hits redirect (GET /api/track/click/[tracking_id]?url=encoded_url)
  -> server records 'clicked' event
  -> 302 redirect to original URL

Recipient unsubscribes
  -> hits unsubscribe page (GET /api/unsubscribe/[tracking_id])
  -> server adds to suppression list
  -> cancels all pending queue items for that email
  -> records 'unsubscribed' event
```

### Reply Detection Flow

```
Cron trigger (every 5 min)
        |
        v
Reply Detector
  - connects to IMAP for each active inbox
  - fetches new emails since last check
  - matches to campaigns via In-Reply-To / References headers
  - records 'replied' event
  - stops campaign sequence for that lead
  - updates campaign stats
```

---

## Multi-Tenancy Model

```
Organization
  |-- Users (owner, admin, member, viewer)
  |-- Domains
  |     |-- Inboxes
  |-- Campaigns
  |     |-- Steps
  |     |-- Queue Items
  |-- Suppression List
  |-- Email Events
```

All data is scoped by `org_id`. No cross-organization data access.

---

## Security Layers

1. **Auth**: JWT tokens with organization context
2. **Encryption**: AES-256-GCM for stored credentials
3. **Validation**: Zod schemas on all API inputs
4. **Rate limiting**: Per-IP and per-user limits
5. **Suppression**: Global + per-org suppression enforcement
6. **Idempotency**: Atomic queue claiming prevents duplicate sends
