# VNS Push Worker

Cloudflare Worker backend for Phase 2B background push notifications.

This Worker stores browser push subscriptions, sends manual test pushes, and checks Cash / PO / Bali plus Repair / Labor approval counts on a schedule.

## Routes

- `GET /api/push/check`
- `POST /api/push/subscribe`
- `POST /api/push/unsubscribe`
- `POST /api/push/test`
- `POST /api/push/run-check`

## Scheduled Checker

The Worker cron runs every 5 minutes. It reads:

- Cash: `CASH_APP_SCRIPT_URL?action=listEntries&syncKey=CASH_SYNC_KEY`
- Repair: `REPAIR_WEB_APP_URL?action=list`

Counts are stored in KV at `push:last-counts:global`. The last successful approval alert timestamp is stored at `push:last-sent:global`.

Only enabled subscriptions with role `Admin`, `Mother`, or `Approver` receive approval alerts.

## Cloudflare Resources

Create a KV namespace:

```bash
wrangler kv namespace create VNS_PUSH_SUBSCRIPTIONS
wrangler kv namespace create VNS_PUSH_SUBSCRIPTIONS --preview
```

Copy the IDs into `wrangler.toml`.

## VAPID Keys

Generate VAPID keys with a trusted tool, for example:

```bash
npx web-push generate-vapid-keys
```

Set the public key in two places:

- `workers/push-worker/wrangler.toml` as `VAPID_PUBLIC_KEY`
- root `push-config.js` as `window.VNS_PUSH_PUBLIC_KEY`

Set the private key only as a Worker secret:

```bash
cd workers/push-worker
wrangler secret put VAPID_PRIVATE_KEY
```

Set a VAPID subject in `wrangler.toml`, for example:

```toml
VAPID_SUBJECT = "mailto:admin@vns-logistics.com"
```

Do not commit the VAPID private key.

## Approval Source Configuration

Set non-secret Apps Script URLs in `wrangler.toml` or through Cloudflare Worker variables:

```toml
CASH_APP_SCRIPT_URL = "https://script.google.com/macros/s/.../exec"
REPAIR_WEB_APP_URL = "https://script.google.com/macros/s/.../exec"
```

Set the Cash sync key as a Worker secret:

```bash
cd workers/push-worker
wrangler secret put CASH_SYNC_KEY
```

## Deploy

```bash
cd workers/push-worker
wrangler deploy
```

Route `/api/push/*` for `portal.vns-logistics.com` to this Worker in Cloudflare.

## Test Flow

1. Deploy frontend files, including `push-config.js` and `service-worker.js`.
2. Open `https://portal.vns-logistics.com/portal.html`.
3. Open the notification dropdown.
4. Click `Subscribe to Background Alerts`.
5. Allow browser notification permission.
6. Click `Send Test Push`.
7. Confirm the service worker shows `Test background alert from VNS.`
8. Click the notification and confirm it opens/focuses `portal.html`.

## Current Limits

- Role is accepted from the frontend role preview for now.
- Subscription storage is KV only.
- No Payroll or Payment Queue polling yet.
- No Cloudflare Access identity enforcement yet.
