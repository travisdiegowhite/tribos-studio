# Garmin Webhook Cloudflare Worker

This Cloudflare Worker handles Garmin activity webhooks without requiring Vercel's $150/month deployment protection bypass.

## Features

- ✅ **Free tier**: 100,000 requests/day
- ✅ **No cold starts**: Always-on edge network
- ✅ **Global performance**: Deployed to 300+ edge locations
- ✅ **Built-in security**: Rate limiting, payload validation, signature verification
- ✅ **No deployment protection issues**: Designed for public API endpoints

## Setup Instructions

### 1. Install Dependencies

```bash
cd cloudflare-workers/garmin-webhook
npm install
```

### 2. Install Wrangler CLI (if not already installed)

```bash
npm install -g wrangler
```

### 3. Login to Cloudflare

```bash
wrangler login
```

This will open a browser window to authorize Wrangler.

### 4. Configure Environment Variables

You need to set these environment variables in Cloudflare:

```bash
# Required
wrangler secret put SUPABASE_URL
wrangler secret put SUPABASE_SERVICE_KEY
wrangler secret put GARMIN_CONSUMER_KEY
wrangler secret put GARMIN_CONSUMER_SECRET

# Optional (for webhook signature verification)
wrangler secret put GARMIN_WEBHOOK_SECRET
```

When prompted, paste the values from your Vercel environment variables.

**To get values from Vercel:**
1. Go to: https://vercel.com/travisdiegowhites-projects/cycling-ai-app-v2/settings/environment-variables
2. Copy each value
3. Paste when `wrangler secret put` prompts you

### 5. Test Locally

```bash
npm run dev
```

This starts a local development server at `http://localhost:8787`

Test the health check:
```bash
curl http://localhost:8787
```

Test a webhook (with local Supabase URL):
```bash
curl -X POST http://localhost:8787 \
  -H "Content-Type: application/json" \
  -d '{"userId":"test123","eventType":"activity","activityId":"test-activity"}'
```

### 6. Deploy to Cloudflare

```bash
npm run deploy
```

This deploys your worker to Cloudflare's global network.

Your webhook URL will be:
```
https://garmin-webhook.<your-subdomain>.workers.dev
```

Cloudflare will show you the URL after deployment.

### 7. Update Garmin Developer Portal

1. Go to: https://developerportal.garmin.com/
2. Navigate to your app's Endpoint Configuration
3. Update webhook URL to your new Cloudflare Worker URL:
   ```
   https://garmin-webhook.<your-subdomain>.workers.dev
   ```

### 8. Test Production Webhook

```bash
curl https://garmin-webhook.<your-subdomain>.workers.dev
```

Should return:
```json
{
  "status": "ok",
  "service": "garmin-webhook-handler-cloudflare",
  "timestamp": "2025-10-25T..."
}
```

## Custom Domain (Optional)

If you want to use a custom domain like `garmin-webhook.tribos.studio`:

### Option 1: Using Cloudflare DNS

1. Add `tribos.studio` to Cloudflare DNS (if not already)
2. Update `wrangler.toml`:
   ```toml
   [env.production]
   routes = [
     { pattern = "garmin-webhook.tribos.studio/*", zone_name = "tribos.studio" }
   ]
   ```
3. Deploy: `npm run deploy`

### Option 2: Using Workers.dev Subdomain (Free)

Just use the default `*.workers.dev` URL - it's free and works great!

## Monitoring & Debugging

### View Real-Time Logs

```bash
npm run tail
```

This streams live logs from your deployed worker.

### View Logs in Dashboard

1. Go to: https://dash.cloudflare.com/
2. Navigate to Workers & Pages
3. Click on `garmin-webhook`
4. Click "Logs" tab

### Check Metrics

In the Cloudflare dashboard, you can see:
- Request count
- Error rate
- CPU time usage
- Bandwidth usage

## Cost Monitoring

### Free Tier Limits

- **100,000 requests/day** (3M/month)
- **10ms CPU time per request**
- **Unlimited bandwidth**

### Paid Tier ($5/month)

If you exceed free tier:
- **10M requests/month**
- **30s CPU time per request**
- **Unlimited bandwidth**

### Check Usage

```bash
wrangler metrics
```

Or view in Cloudflare dashboard.

## Security Features

This worker includes:

1. **Rate limiting** - Uses Cloudflare's DDoS protection
2. **Payload size validation** - Max 10MB
3. **Content-Type validation** - JSON only
4. **Webhook signature verification** - Optional HMAC-SHA256
5. **Payload structure validation** - Type checking
6. **Idempotency protection** - Duplicate detection
7. **User integration validation** - Auth check

## Troubleshooting

### "Error: No such namespace"

You need to create a KV namespace for rate limiting:
```bash
wrangler kv:namespace create "RATE_LIMIT"
```

Then update `wrangler.toml` with the ID.

### "Error: Missing environment variables"

Make sure you've set all secrets:
```bash
wrangler secret list
```

Should show:
- SUPABASE_URL
- SUPABASE_SERVICE_KEY
- GARMIN_CONSUMER_KEY
- GARMIN_CONSUMER_SECRET

### "Worker exceeded CPU time limit"

The worker hit the 10ms CPU limit. This shouldn't happen for webhooks, but if it does:
- Upgrade to paid plan ($5/month) for 30s CPU time
- Optimize any heavy processing

### Webhooks not being processed

Check:
1. Supabase connection works (test with curl)
2. Environment variables are set correctly
3. Garmin Developer Portal has correct webhook URL
4. Check worker logs: `npm run tail`

## FIT File Processing

**Important:** This worker downloads FIT files but doesn't parse them (CPU time limits).

Two options for FIT file processing:

### Option 1: Separate Worker (Recommended)

Create a second worker that processes FIT files from a queue:
```bash
# Run every 5 minutes
wrangler cron trigger process-fit-files "*/5 * * * *"
```

### Option 2: Keep FIT Processing on Vercel

Keep the existing Vercel API route for FIT file processing:
```javascript
// Create /api/process-garmin-fit.js on Vercel
// Poll garmin_webhook_events table for unprocessed events
// Download and parse FIT files (no 10ms CPU limit)
```

This hybrid approach:
- Cloudflare Worker: Receives webhooks (free, fast)
- Vercel: Processes FIT files (free tier, no time limits)

## Migration from Vercel

If you want to completely move off Vercel:

1. Deploy this worker
2. Create FIT processing worker or use Cloudflare Queues
3. Deploy frontend to Cloudflare Pages (free)
4. Cancel Vercel subscription

## Support

- Cloudflare Workers Docs: https://developers.cloudflare.com/workers/
- Wrangler CLI Docs: https://developers.cloudflare.com/workers/wrangler/
- Cloudflare Community: https://community.cloudflare.com/

## Next Steps

1. ✅ Deploy worker to Cloudflare
2. ✅ Update Garmin Developer Portal
3. ✅ Test with real activity
4. ⏳ Set up FIT file processing (see options above)
5. ⏳ Monitor usage and costs
6. ⏳ Consider migrating frontend to Cloudflare Pages (optional)
