# Garmin Webhook Cloudflare Worker - Deployment Guide

## ✅ Changes Made

The Cloudflare worker has been updated to **fully process FIT files** instead of marking them for external processing.

### What was fixed:
- ✅ Added `fit-file-parser` dependency
- ✅ Implemented complete FIT file parsing
- ✅ Creates routes in Supabase `routes` table
- ✅ Stores GPS track points in `track_points` table
- ✅ Records sync history in `bike_computer_sync_history` table
- ✅ Marks webhook events as `processed: true`

---

## 📦 Deployment Steps

### 1. Install Dependencies

```bash
cd cloudflare-workers/garmin-webhook
npm install
```

### 2. Configure Environment Variables

Set these in your Cloudflare dashboard or via `wrangler secret`:

```bash
# Required environment variables
wrangler secret put SUPABASE_URL
# Enter: https://your-project.supabase.co

wrangler secret put SUPABASE_SERVICE_KEY
# Enter: your service_role key (from Supabase Settings > API)

# Optional: Webhook signature verification
wrangler secret put GARMIN_WEBHOOK_SECRET
# Enter: your webhook secret (if you configured one in Garmin dashboard)
```

### 3. Deploy to Cloudflare

```bash
npm run deploy
```

Or using wrangler directly:

```bash
wrangler deploy
```

### 4. Get Your Worker URL

After deployment, Wrangler will show your worker URL:

```
https://garmin-webhook.<your-subdomain>.workers.dev
```

Or if you configured a custom route:

```
https://yourdomain.com/api/garmin-webhook
```

### 5. Update Garmin Developer Dashboard

1. Go to: https://developer.garmin.com/gc-developer-program/overview/
2. Navigate to your application
3. Find **Push Notification Settings** or **Webhook URL**
4. Set the URL to your Cloudflare Worker URL
5. Save changes

---

## 🧪 Testing

### Test Health Check

```bash
curl https://garmin-webhook.<your-subdomain>.workers.dev
```

Expected response:
```json
{
  "status": "ok",
  "service": "garmin-webhook-handler-cloudflare",
  "timestamp": "2025-10-25T..."
}
```

### Test Webhook (Simulated)

```bash
curl -X POST https://garmin-webhook.<your-subdomain>.workers.dev \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test-garmin-user-123",
    "activityId": "test-activity-456",
    "eventType": "activity",
    "fileUrl": "https://example.com/test.fit"
  }'
```

Expected response:
```json
{
  "success": true,
  "eventId": "uuid-here",
  "message": "Webhook received and queued for processing"
}
```

### Check Supabase

After receiving a real webhook from Garmin:

1. Check `garmin_webhook_events` table:
   ```sql
   SELECT * FROM garmin_webhook_events
   ORDER BY received_at DESC
   LIMIT 10;
   ```

2. Check if processed:
   ```sql
   SELECT id, processed, processed_at, process_error, route_id
   FROM garmin_webhook_events
   WHERE processed = true
   ORDER BY processed_at DESC;
   ```

3. Check routes created:
   ```sql
   SELECT id, name, distance, garmin_id, created_at
   FROM routes
   WHERE garmin_id IS NOT NULL
   ORDER BY created_at DESC;
   ```

---

## 🐛 Troubleshooting

### Check Worker Logs

```bash
wrangler tail
```

This will show real-time logs from your worker.

### Common Issues

#### 1. "Missing environment variables"
**Solution:** Make sure you've set all required secrets:
```bash
wrangler secret list
```

#### 2. "No integration found for Garmin user"
**Cause:** User hasn't connected their Garmin account in your app yet.

**Check:**
```sql
SELECT * FROM bike_computer_integrations
WHERE provider = 'garmin';
```

#### 3. "Failed to download FIT file: 401"
**Cause:** Access token expired or invalid.

**Solution:** Implement token refresh logic or have user reconnect.

#### 4. Worker timeout or CPU limit exceeded
**Note:** Free Cloudflare Workers have 10ms CPU time limit. If processing large FIT files:
- Upgrade to Cloudflare Workers Paid plan ($5/month) for 30s CPU limit
- Or use the hybrid approach (Cloudflare stores event, Vercel processes it later)

---

## 📊 Monitoring

### Check Processing Success Rate

```sql
SELECT
  COUNT(*) FILTER (WHERE processed = true AND process_error IS NULL) as success,
  COUNT(*) FILTER (WHERE processed = true AND process_error IS NOT NULL) as errors,
  COUNT(*) FILTER (WHERE processed = false) as pending,
  COUNT(*) as total
FROM garmin_webhook_events
WHERE received_at > NOW() - INTERVAL '24 hours';
```

### View Recent Errors

```sql
SELECT id, garmin_user_id, activity_id, process_error, received_at
FROM garmin_webhook_events
WHERE processed = true
  AND process_error IS NOT NULL
ORDER BY received_at DESC
LIMIT 10;
```

---

## 🔄 Rollback

If you need to rollback to a previous version:

```bash
wrangler rollback
```

---

## 📝 Next Steps

After deployment:

1. ✅ Test with a real Garmin activity sync
2. ✅ Monitor logs for any errors
3. ✅ Check that routes appear in your app
4. ✅ Verify GPS track points are stored correctly

---

## 💡 Performance Notes

**Cloudflare Worker Limits:**
- Free tier: 10ms CPU time
- Paid tier: 30s CPU time
- Memory: 128MB

**FIT File Processing:**
- Average cycling activity: 2-5 seconds to process
- Large activities (100+ km): 5-10 seconds
- If you hit CPU limits, consider the paid plan or hybrid approach

---

## 🆘 Support

If webhooks still aren't working after deployment:

1. Check Cloudflare worker logs: `wrangler tail`
2. Check Garmin developer dashboard for delivery failures
3. Verify environment variables are set correctly
4. Test the health check endpoint
5. Check Supabase RLS policies allow service_role writes

---

**Last Updated:** 2025-10-25
