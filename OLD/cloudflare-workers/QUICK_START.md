# Cloudflare Workers Quick Start Guide

## 🚀 Deploy in 5 Steps

### 1. Install Wrangler CLI

```bash
npm install -g wrangler
```

### 2. Login to Cloudflare

```bash
wrangler login
```

A browser window will open - authorize the CLI.

### 3. Navigate to Worker Directory

```bash
cd cloudflare-workers/garmin-webhook
```

### 4. Set Environment Variables

Run these commands and paste the values when prompted:

```bash
wrangler secret put SUPABASE_URL
# Paste: https://toihfeffpljsmgritmuy.supabase.co

wrangler secret put SUPABASE_SERVICE_KEY
# Paste your Supabase service key from Vercel env vars

wrangler secret put GARMIN_CONSUMER_KEY
# Paste your Garmin consumer key from Vercel env vars

wrangler secret put GARMIN_CONSUMER_SECRET
# Paste your Garmin consumer secret from Vercel env vars
```

**Where to find these values:**
- Go to Vercel: https://vercel.com/travisdiegowhites-projects/cycling-ai-app-v2/settings/environment-variables
- Copy each value
- Paste when prompted

### 5. Deploy!

```bash
npm run deploy
```

Cloudflare will show your webhook URL:
```
https://garmin-webhook.YOUR-SUBDOMAIN.workers.dev
```

---

## ✅ Next Steps

### Update Garmin Developer Portal

1. Go to: https://developerportal.garmin.com/
2. Find your app's Endpoint Configuration
3. Update webhook URL to:
   ```
   https://garmin-webhook.YOUR-SUBDOMAIN.workers.dev
   ```

### Test Your Webhook

```bash
# Health check
curl https://garmin-webhook.YOUR-SUBDOMAIN.workers.dev

# Should return:
# {"status":"ok","service":"garmin-webhook-handler-cloudflare"...}
```

### Complete an Activity

1. Go for a bike ride with your Garmin device
2. Sync to Garmin Connect
3. Check Supabase `garmin_webhook_events` table
4. Should see new webhook event!

---

## 🔍 Monitoring

### View Live Logs

```bash
cd cloudflare-workers/garmin-webhook
npm run tail
```

### View in Dashboard

1. Go to: https://dash.cloudflare.com/
2. Workers & Pages → garmin-webhook → Logs

---

## 💰 Cost

- **Free tier**: 100,000 requests/day
- **Your usage**: Probably ~10-50 webhooks/day
- **Monthly cost**: $0

If you somehow exceed 100k/day:
- **Paid tier**: $5/month for 10M requests

---

## ❓ Troubleshooting

### "Error: Not authenticated"
Run `wrangler login` again

### "Error: Could not find zone"
You're using the default workers.dev subdomain, which is fine! Ignore zone-related warnings.

### Webhook not receiving events
1. Check Garmin Developer Portal has correct URL
2. Complete an activity and sync
3. View worker logs: `npm run tail`
4. Check Supabase: `SELECT * FROM garmin_webhook_events ORDER BY created_at DESC LIMIT 5;`

---

## 📝 Important Notes

### FIT File Processing

This worker **downloads** FIT files but doesn't **process** them (CPU time limits).

**Option 1: Keep using Vercel for FIT processing (Recommended)**
- Worker receives webhooks (free)
- Vercel processes FIT files (free tier)
- Hybrid approach = $0/month

**Option 2: Create separate Cloudflare worker for FIT processing**
- Use Cloudflare Cron Triggers
- Poll unprocessed events every 5 minutes
- Parse FIT files in batches

For now, you can manually process unprocessed events or create a separate worker later.

---

## 🎉 Success!

You've now:
- ✅ Saved $165/month vs Vercel protection bypass
- ✅ Got a webhook endpoint on Cloudflare's global network
- ✅ No deployment protection issues
- ✅ Free tier with plenty of headroom

Enjoy your Garmin integration! 🚴‍♂️
