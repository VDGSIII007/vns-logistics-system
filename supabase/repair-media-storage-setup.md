# Repair Media Storage Setup

Create a Supabase Storage bucket named `repair-media`.

Recommended bucket settings:

- Private bucket: enabled
- Public bucket: disabled

The Cloudflare Worker uses `SUPABASE_SERVICE_ROLE_KEY` server-side only to upload files and create 1-hour signed URLs. Do not expose the service role key in browser code.

Media paths are stored on `repair_requests.photo_links` and `repair_requests.video_links` as storage object paths:

```text
repair_requests/{request_id}/{timestamp}_{safe_filename}
```

If the bucket does not already exist, create it in Supabase Dashboard under Storage, then verify the `repair_requests` table has `photo_links` and `video_links` array or JSON-compatible columns.
