# LeadBase — Queue & Sending System

## Overview

The queue system is the core execution engine. It takes scheduled queue items and converts them into sent emails while respecting rate limits, suppression rules, and inbox health.

---

## Queue Architecture (MVP)

### MVP: Cron-based worker

The MVP uses a **cron-triggered API route** instead of a persistent worker process.

```
Vercel Cron (every 60 seconds)
        |
        v
GET /api/cron/process-queue
        |
        v
Queue Worker Logic
  - fetch batch of pending items
  - claim atomically
  - send emails
  - update state
```

**Why cron first:**
- No additional infrastructure (no Redis, no separate process)
- Works on Vercel Pro (60s execution limit)
- Sufficient for up to ~1,000 emails/day
- Easy to replace later with BullMQ when scale demands it

### Post-MVP: BullMQ + Redis

When sending volume exceeds 1,000/day, migrate to:

```
BullMQ Queue (Redis-backed)
        |
        v
Worker Process (standalone Node.js)
  - concurrent job processing
  - per-inbox rate limiting built-in
  - exponential backoff retries
  - dead letter queue
  - job priority
```

---

## Queue Item Lifecycle

```
                  ┌──────────┐
                  │ pending   │
                  └─────┬────┘
                        │
              ┌─────────▼──────────┐
              │  Worker claims it   │
              │  (atomic UPDATE     │
              │   with row lock)    │
              └─────────┬──────────┘
                        │
                  ┌─────▼────┐
                  │ sending   │
                  └─────┬────┘
                        │
               ┌────────┴────────┐
               │                 │
         ┌─────▼────┐     ┌─────▼────┐
         │  sent     │     │  failed   │
         └──────────┘     └─────┬────┘
                                │
                    ┌───────────┴──────────┐
                    │ attempts < max?       │
                    │                      │
              ┌─────▼────┐          ┌─────▼─────────┐
              │ pending   │          │ failed         │
              │ (retry)   │          │ (permanent)    │
              └──────────┘          └───────────────┘


Separately:
  pending -> cancelled  (unsubscribe, campaign pause, manual cancel)
```

---

## Claiming Logic (Preventing Duplicate Sends)

This is the most critical part. Duplicate sends destroy deliverability and user trust.

### Atomic claim query

```sql
UPDATE outreach_send_queue
SET status = 'sending',
    attempts = attempts + 1
WHERE id IN (
  SELECT id FROM outreach_send_queue
  WHERE status = 'pending'
    AND scheduled_at <= NOW()
    AND attempts < max_attempts
  ORDER BY scheduled_at ASC
  LIMIT $batch_size
  FOR UPDATE SKIP LOCKED
)
RETURNING *;
```

**Key elements:**
- `FOR UPDATE SKIP LOCKED` — prevents two workers from claiming the same item
- `LIMIT` — controls batch size per tick
- `attempts < max_attempts` — stops retrying permanently failed items
- Atomic `UPDATE ... RETURNING` — claim and fetch in one query

---

## Pre-Send Checks

Before sending each email, the worker runs these checks:

1. **Suppression check** — is the recipient in the suppression list?
2. **Inbox daily limit** — has the inbox hit its daily cap?
3. **Domain daily limit** — has the domain hit its daily cap?
4. **Campaign status** — is the campaign still active (not paused/aborted)?
5. **Inbox health** — is the inbox still active and not paused?

If any check fails, the queue item is either:
- **Cancelled** (suppression, campaign aborted)
- **Rescheduled** (daily limit hit — try next day)
- **Failed** (inbox deactivated)

---

## Rate Limiting

### Per-inbox limits

```
daily_limit: max emails per inbox per day
max_per_hour_per_inbox: max emails per inbox per hour
min_interval_seconds: minimum gap between sends from same inbox
max_interval_seconds: maximum gap (for randomization)
```

### Throttle implementation

The scheduler pre-computes `scheduled_at` timestamps that respect these limits.

The worker additionally checks at send time:

```sql
-- Count sends from this inbox in the last hour
SELECT COUNT(*) FROM outreach_send_queue
WHERE inbox_id = $1
  AND status = 'sent'
  AND sent_at >= NOW() - INTERVAL '1 hour';
```

If the count exceeds `max_per_hour_per_inbox`, skip this item (it will be picked up in the next tick).

---

## Error Handling

### Transient errors (retry)

- SMTP connection timeout
- Network errors
- Temporary rejection (4xx SMTP codes)
- Rate limit responses

Retry with exponential backoff:
```
attempt 1: immediate
attempt 2: after 5 minutes
attempt 3: after 30 minutes
```

### Permanent errors (fail)

- Authentication failure (wrong SMTP creds)
- Recipient rejected (5xx SMTP codes)
- Malformed email address
- Inbox deactivated

Mark as `failed`, log error, do not retry.

### Critical errors (pause campaign)

- Bounce rate exceeds 8% for the campaign
- All assigned inboxes deactivated
- SMTP credentials expired for all inboxes

Auto-pause the campaign and log an alert.

---

## Stats Updates

After each send, update:

```sql
-- Queue item
UPDATE outreach_send_queue
SET status = 'sent', sent_at = NOW(), message_id = $message_id
WHERE id = $queue_item_id;

-- Email event
INSERT INTO outreach_email_events
  (org_id, campaign_id, queue_item_id, lead_id, inbox_id, step_number, event_type)
VALUES ($org_id, $campaign_id, $queue_item_id, $lead_id, $inbox_id, $step_number, 'sent');

-- Campaign stats
UPDATE outreach_campaigns
SET total_sent = total_sent + 1
WHERE id = $campaign_id;

-- Campaign step stats
UPDATE outreach_campaign_steps
SET sent = sent + 1
WHERE campaign_id = $campaign_id AND step_number = $step_number;

-- Inbox daily counter
UPDATE outreach_inboxes
SET daily_sent = daily_sent + 1, last_sent_at = NOW()
WHERE id = $inbox_id;

-- Domain daily counter
UPDATE outreach_domains
SET daily_sent = daily_sent + 1
WHERE id = $domain_id;
```

---

## Campaign Step Progression

When all leads in a step are processed (sent, failed, or cancelled):

1. Check next step type
2. If **wait step**: calculate `scheduled_at` = now + wait_days for next email step
3. If **condition step**: filter leads based on condition
   - `no_reply`: leads who haven't replied
   - `opened`: leads who opened the email
   - `replied`: leads who replied
4. Generate queue items for the next email step with only qualifying leads

---

## Monitoring

### Key metrics to track

- Queue depth (pending items)
- Send rate (emails/minute)
- Failure rate (failed/total)
- Bounce rate per inbox
- Average send latency (scheduled_at vs sent_at)
- Worker execution time per tick

### Alerts

- Queue depth growing faster than processing rate
- Failure rate > 5%
- Bounce rate > 5% on any inbox
- Worker not executing (cron failures)
- Campaign stuck (no sends for 30+ minutes during sending window)
