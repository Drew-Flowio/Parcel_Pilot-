# Deployment runbook — Skywalk → Supabase → AppFolio

This document covers the production hardening of the Skywalk ingestion +
AppFolio push pipeline on Vercel. It is **prescriptive**: follow it top-to-bottom
on a fresh project and the pipeline will be safe, quota-efficient, and
recoverable.

---

## 1. Architecture in one diagram

```
                                                                           
   Skywalk API                                       Supabase Postgres     
   ────────────                                      ───────────────────   
        │                                                                  
        │  cron pull (5m / 30m / 6h)                                       
        ├──────────────► /api/skywalk/sync/[resource]      messages        
        │                  ├─ adapter.fetchPage() → upsert  contacts       
        │                  └─ cursor advance                properties     
        │                                                                  
        │  real-time push (HMAC SHA-256)                                   
        └──────────────► /api/skywalk/webhook              + cursors       
                           └─ adapter.toRow() → upsert     + manual_fetch  
                                                                            
                              ┌────────────────┐                            
                              │  rollup cron   │   skywalk_thread_day_      
                              │  (every 5m,    │ ─►  rollups               
                              │  30m lookback) │                            
                              └────────────────┘                            
                                       │                                    
                                       ▼                                    
                             ┌────────────────────┐                         
                             │  AppFolio push     │   AppFolio              
                             │  cron (5m)         │ ─►  ───────             
                             │  policy-gated      │     /v1/notes          
                             └────────────────────┘                         
                                       │                                    
                                       ▼                                    
                              appfolio_push_log                             
```

The pipeline is **strictly incremental**:

* Sync uses `skywalk_sync_cursors` checkpoints — never a full pull unless the
  operator explicitly POSTs to `/api/skywalk/sync/full/[resource]` with a
  double-confirm header.
* Rollup uses `skywalk_messages.ingested_at > p_since` — only re-aggregates
  conversations touched within the last `lookback_minutes`.
* Push uses `synced_to_appfolio_at IS NULL` — only sends rollups whose content
  has materially changed (conditional invalidation in
  `skywalk_rollup_thread_days()`).

---

## 2. Environment variables

Use `GET /api/admin/preflight` (auth: `Authorization: Bearer $CRON_SECRET`) to
audit the current configuration. The endpoint returns which envs are set vs
missing without leaking values.

### Required

| Var | Purpose |
| --- | ------- |
| `NEXT_PUBLIC_SUPABASE_URL`     | Supabase project URL. |
| `SUPABASE_SERVICE_ROLE_KEY`    | Service-role key. Only used server-side; RLS bypasses it. |
| `SKYWALK_BASE_URL`             | Skywalk API base, e.g. `https://api.skywalk.example.com`. |
| `SKYWALK_API_KEY`              | Bearer token for Skywalk. |
| `SKYWALK_SYNC_SECRET`          | Shared secret for manual `/api/skywalk/*` ops. |
| `APPFOLIO_BASE_URL`            | AppFolio API base — direct, Zapier webhook, or shim. |
| `APPFOLIO_API_KEY`             | Auth token for AppFolio (or webhook secret). |
| `APPFOLIO_PUSH_SECRET`         | Shared secret for manual `/api/appfolio/*` ops. |

### Strongly recommended

| Var | Purpose |
| --- | ------- |
| `CRON_SECRET`                  | Vercel cron Bearer token. **Without this, none of the cron jobs can authenticate.** |
| `SKYWALK_WEBHOOK_SECRET`       | HMAC SHA-256 secret. Without this, `/api/skywalk/webhook` returns 500. |

### Optional (sane defaults — only set to override)

See `.env.example` for the full list. Common overrides:

* `APPFOLIO_DRY_RUN=1` — set on preview deploys. The AppFolio worker walks the
  full policy and writes `status=skipped, error_message='dry-run'` to
  `appfolio_push_log` instead of calling AppFolio. No risk of polluting prod.
* `APPFOLIO_NOTE_PATH=/something/custom` — point at Zapier webhook URL or a
  custom integration shim if you don't have direct AppFolio API access.

### How to set on Vercel

```bash
vercel env add CRON_SECRET production
vercel env add SKYWALK_API_KEY production
# … repeat for each var

# Regenerate the same secrets for preview if you want preview deploys to work
vercel env add CRON_SECRET preview
```

Pull them into local development:

```bash
vercel env pull .env.local
```

---

## 3. Cron schedule

The `vercel.json` at repo root defines six cron jobs. All are GET endpoints
authenticated by `Authorization: Bearer $CRON_SECRET` (Vercel sends this
automatically when `CRON_SECRET` is set).

| Schedule        | Path                                                        | Purpose |
| --------------- | ----------------------------------------------------------- | ------- |
| `*/5 * * * *`   | `/api/skywalk/sync/messages`                                | Highest-value pull — conversation body text. |
| `*/30 * * * *`  | `/api/skywalk/sync/contacts`                                | Slower-changing contact records. |
| `0 */6 * * *`   | `/api/skywalk/sync/properties`                              | Slowest-changing property records. |
| `*/5 * * * *`   | `/api/skywalk/rollup?target=all&lookback_minutes=30`        | Re-aggregate conversations touched in last 30m. |
| `*/10 * * * *`  | `/api/skywalk/manual-fetch`                                 | Drain retry queue (failed ingest events). |
| `*/5 * * * *`   | `/api/appfolio/push`                                        | Drain unsynced thread-day rollups. |

**Why these intervals**:

* Messages every 5 min = highest-value data, lowest acceptable lag.
* Contacts/properties less often = they change rarely, save quota.
* Rollup every 5 min with a 30-min lookback = 6× redundancy (any single tick
  failure is recovered by the next).
* Push every 5 min = matches rollup cadence so the worker never falls behind
  by more than one tick.
* Manual-fetch every 10 min = drains transient errors without competing with
  the main sync for quota.

**Hobby tier note**: Vercel hobby allows max 2 cron jobs with a daily minimum.
For hobby deployments, comment out everything except `messages` and `appfolio
push` and trigger the rest manually via POST.

---

## 4. Real-time webhook (optional but recommended)

`POST /api/skywalk/webhook` accepts inbound events from Skywalk and ingests
them immediately, complementing the 5-min cron pull.

### Setup

1. Generate a strong random secret: `openssl rand -hex 32`
2. Set it on Vercel: `vercel env add SKYWALK_WEBHOOK_SECRET production`
3. Configure the same secret on the Skywalk side. Skywalk sends
   `x-skywalk-webhook-signature: sha256=<hex>` where the hex is
   `HMAC_SHA256(secret, raw_body_bytes)`.
4. Point Skywalk's webhook URL at:
   `https://<your-domain>/api/skywalk/webhook`

### Supported events

`message.created`, `message.updated`, `contact.created`, `contact.updated`,
`property.created`, `property.updated`. Unknown events return 200 +
`{ skipped: 'unknown-event' }` so Skywalk doesn't retry forever.

### Idempotency

Each upstream record has a unique id (`skywalk_*_id`) which is the UNIQUE
constraint on the matching table → re-deliveries are no-ops.

### Real-time rollup

For `message.created` / `message.updated` events, the webhook synchronously
runs `skywalk_rollup_thread_days(p_conversation_id := <id>)` so the next
AppFolio push tick (≤ 5 min later) sees the freshly aggregated rollup. The
SQL function is conditional-invalidate, so duplicate kicks are harmless.

This adds ~50–200 ms to the webhook ack — well within Skywalk's typical
delivery deadline.

### Failure modes

| HTTP | Meaning | Action |
| ---- | ------- | ------ |
| 401  | Bad signature | Skywalk should retry with corrected signature. |
| 422  | Bad payload shape | Permanent — Skywalk should NOT retry. |
| 500  | Server config issue (missing `SKYWALK_WEBHOOK_SECRET`) | Operator must fix. |

---

## 4a. Parcel linking (Skywalk ↔ Hennepin parcels)

The pipeline carries operational data (Skywalk: messages, contacts,
properties) and intelligence data (Hennepin: 31k parcels, score_v2,
portfolio_groups, sos_intel) on separate tracks. The
`skywalk_parcel_linking` migration joins them via `parcel_id` columns on
`skywalk_properties` and `skywalk_contacts`.

### Auto-link triggers

`BEFORE INSERT/UPDATE` triggers run on every Skywalk row:

* `skywalk_properties` → `match_parcel_by_address(normalized_address)`
  (uppercase + alphanumeric exact match against `parcels_raw.property_address`)
* `skywalk_contacts` → `match_parcel_by_contact(phone, email)`
  (phone-digits exact, then lowercased-email exact, against
  `parcel_pilot_overrides`)

Auto-link is **exact match only** — no fuzzy/trigram. Bad joins are far
more damaging than missed joins, and the manual reconcile pass below is
cheap.

### Payload enrichment

When the AppFolio push worker pushes a thread-day rollup whose Skywalk
property/contact resolves to a parcel, it adds:

* `metadata.parcel` — the linked parcel's `score_v2`, `owner_name`,
  `vacancy_status`, `contact_status`, etc.
* Tags — `parcel:linked`, `parcel:score:high|mid|low`,
  `parcel:owner-type:entity|institutional|individual`,
  `parcel:contact-status:*`, `parcel:vacant`, `parcel:vacant-90+`.

The receiving side (AppFolio / Zapier / shim) uses these tags to lane
high-value leads without re-parsing the body. Enrichment is purely
additive — push never blocks on a missing link.

### Manual reconcile

When parcels are added or addresses normalized after Skywalk rows already
exist, run:

```bash
curl -X POST https://<domain>/api/skywalk/match \
  -H "x-skywalk-sync-secret: $SKYWALK_SYNC_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"scope":"all","limit":5000}'
```

Status check:

```bash
curl https://<domain>/api/skywalk/match \
  -H "x-skywalk-sync-secret: $SKYWALK_SYNC_SECRET"
# → { properties: { linked, unlinked, coverage_pct }, contacts: {…} }
```

---

## 5. Manual operations

All `/api/skywalk/*` and `/api/appfolio/*` POST endpoints accept the
domain-specific shared secret (separate from `CRON_SECRET`). Useful for triage,
backfills, and one-off debugging.

### Trigger a sync tick manually

```bash
curl -X POST https://<host>/api/skywalk/sync/messages \
  -H "x-skywalk-sync-secret: $SKYWALK_SYNC_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"maxRecords": 1000}'
```

### Force-push a single rollup (bypass policy)

```bash
curl -X POST https://<host>/api/appfolio/push/manual \
  -H "x-appfolio-push-secret: $APPFOLIO_PUSH_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"rollupId": "<uuid>"}'
```

### Push an owner record (manual, never auto)

```bash
curl -X POST https://<host>/api/appfolio/push/owner \
  -H "x-appfolio-push-secret: $APPFOLIO_PUSH_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"parcelId": "<uuid>"}'
```

---

## 6. Recovery procedures

### A cursor is stuck `running`

The lease is 5 minutes — a stuck `running` cursor older than that is
auto-stolen on the next claim. So the system self-heals. If you don't want to
wait:

```bash
curl -X POST https://<host>/api/skywalk/sync/reset/messages \
  -H "x-skywalk-sync-secret: $SKYWALK_SYNC_SECRET" \
  -H "x-skywalk-confirm-reset: yes"
```

This **only resets the cursor row** — no full pull is triggered. The next
incremental tick will start from a null watermark.

### The cursor token went bad (Skywalk rotated tokens)

Same as above — `/api/skywalk/sync/reset/[resource]`. The next tick will start
fresh.

### Need a full backfill (rare, e.g. after a major data correction)

```bash
curl -X POST https://<host>/api/skywalk/sync/full/messages \
  -H "x-skywalk-sync-secret: $SKYWALK_SYNC_SECRET" \
  -H "x-skywalk-confirm-full: yes"
```

The double-confirm header prevents accidental full pulls. Defaults: 60s wall
budget, 1000 requests, 50_000 records. Override via JSON body if needed.

### AppFolio is rejecting pushes

Check `/api/appfolio/health` for recent errors. Common causes:

| Error | Action |
| ----- | ------ |
| `401 unauthorized` | Rotate `APPFOLIO_API_KEY` on Vercel + restart cron. |
| Persistent 4xx for one rollup | Use `/api/appfolio/push/manual` to retry after fixing the receiving side. |
| Persistent 429 | Increase the cron interval; lower `batchSize` via POST body. |
| `dry-run` skips in prod | Unset `APPFOLIO_DRY_RUN` on Vercel. |

### A specific message/contact/property failed to ingest

It's already in `manual_fetch_queue`. The cron drains it every 10 min. To
trigger immediately:

```bash
curl -X POST https://<host>/api/skywalk/manual-fetch \
  -H "x-skywalk-sync-secret: $SKYWALK_SYNC_SECRET"
```

A row hits status `failed` after 5 attempts. Inspect `manual_fetch_queue.error`
in Supabase, fix the upstream issue, and update the row to `pending` to retry.

---

## 7. Observability

### Health endpoints

| URL | Auth | Returns |
| --- | ---- | ------- |
| `GET /api/admin/preflight`        | cron Bearer or sync secret  | Env config + cursor staleness + backlogs. Use for on-call status checks. |
| `GET /api/skywalk/health`         | cron Bearer or sync secret  | Cursor state, queue depths, rollup counts. |
| `GET /api/appfolio/health`        | cron Bearer or push secret  | Rollup backlog + 24h push success/failure counts + 10 most-recent errors. |

Wire these to UptimeRobot, Healthchecks.io, or a status page.

### Vercel logs

Every cron tick emits a structured JSON response. Filter by path:

```
/api/skywalk/sync/messages    rateLimited=true   → quota issue
/api/appfolio/push            failed > 0         → AF rejection
/api/skywalk/rollup           rolledUp=0         → either no traffic or rollup is stuck
```

### Supabase

| Table | What to watch |
| ----- | ------------- |
| `skywalk_sync_cursors`        | `last_run_status='error'` → see `last_run_error`. |
| `manual_fetch_queue`          | `status='failed'` → permanent. Operator must triage. |
| `appfolio_push_log`           | `status='failure'` → AF rejected. `attempted_at desc` for recent errors. |
| `skywalk_thread_day_rollups`  | `synced_to_appfolio_at IS NULL` for >1h → push is stuck. |

---

## 8. Why this design is quota-efficient

1. **Cursor checkpoints**: every page write must succeed before the cursor
   advances. Crashes resume; they don't restart.
2. **Lease-based concurrency**: 5-min lease on each cursor prevents two
   workers ingesting the same page. Stale leases are auto-stolen so a crashed
   worker doesn't deadlock.
3. **Quota-aware backoff**: 429 with `Retry-After` either sleeps or stops the
   tick gracefully. 5xx + network errors use exponential backoff with full
   jitter, capped by `SKYWALK_MAX_RETRIES`.
4. **No accidental full pulls**: full ingest requires `x-skywalk-confirm-full:
   yes` AND the manual sync secret. Cron cannot trigger it.
5. **Conditional rollup invalidation**: re-aggregating the same messages
   within the lookback window is a no-op for the AppFolio push pipeline —
   `synced_to_appfolio_at` is only reset when content actually changed.
6. **Push policy**: only thread-day rollups that are settled, action-worthy,
   and linkable get sent. Single low-signal messages are filtered. Owner
   records are manual-only.
7. **Idempotency at every layer**: external IDs are UNIQUE on every table;
   the AppFolio payload includes a deterministic `external_id` so the
   downstream side can dedupe even if our worker double-fires.
