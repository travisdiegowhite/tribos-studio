# Edge Function Deployment Guide

Since the Supabase CLI requires interactive login, you have **two options** to deploy the edge function:

## Option 1: Deploy via Supabase CLI (Recommended - Do this in your local terminal)

### Step 1: Login to Supabase
```bash
supabase login
```
This will open your browser for authentication.

### Step 2: Link to your project
```bash
cd /home/travis/Desktop/cycling-ai-app-v2
supabase link --project-ref toihfeffpljsmgritmuy
```

### Step 3: Get Resend API Key
1. Go to https://resend.com
2. Sign up for free account
3. Create API Key
4. Copy the key (starts with `re_`)

### Step 4: Set the Resend API key as a secret
```bash
supabase secrets set RESEND_API_KEY=re_your_actual_key_here
```

### Step 5: Deploy the function
```bash
supabase functions deploy send-invitation-email
```

That's it! The function will be deployed and ready to use.

---

## Option 2: Deploy via Supabase Dashboard (Alternative)

If you prefer to use the dashboard instead of CLI:

### Step 1: Create the Function

1. Go to: https://supabase.com/dashboard/project/toihfeffpljsmgritmuy/functions
2. Click "Create a new function"
3. Name: `send-invitation-email`
4. Click "Create function"

### Step 2: Copy the Code

1. Open: `supabase/functions/send-invitation-email/index.ts`
2. Copy all the code
3. Paste it into the function editor in the dashboard
4. Click "Deploy"

### Step 3: Set Environment Variables

1. Go to: https://supabase.com/dashboard/project/toihfeffpljsmgritmuy/settings/functions
2. Click "Add secret"
3. Name: `RESEND_API_KEY`
4. Value: Your Resend API key (from https://resend.com)
5. Click "Save"

### Step 4: Get Resend API Key

1. Go to https://resend.com
2. Sign up for free account (if you haven't)
3. Click "API Keys" in sidebar
4. Click "Create API Key"
5. Name it "tribos-studio-invitations"
6. Copy the key (starts with `re_`)
7. Use this in Step 3 above

---

## Verify Deployment

After deploying via either method, test the function:

### Test URL
Your function will be available at:
```
https://toihfeffpljsmgritmuy.supabase.co/functions/v1/send-invitation-email
```

### Test with curl

```bash
curl -i --location --request POST \
  'https://toihfeffpljsmgritmuy.supabase.co/functions/v1/send-invitation-email' \
  --header 'Authorization: Bearer YOUR_SUPABASE_ANON_KEY' \
  --header 'Content-Type: application/json' \
  --data '{
    "type": "new_user",
    "athleteEmail": "test@example.com",
    "coachId": "your-coach-user-id",
    "invitationToken": "test-token-123",
    "coachMessage": "Looking forward to training with you!"
  }'
```

Replace:
- `YOUR_SUPABASE_ANON_KEY` - Get from: https://supabase.com/dashboard/project/toihfeffpljsmgritmuy/settings/api
- `your-coach-user-id` - Use your actual user ID

### Expected Response

Success:
```json
{
  "success": true,
  "emailId": "some-email-id"
}
```

Error:
```json
{
  "error": "error message"
}
```

---

## Troubleshooting

### Function not found
- Make sure you deployed the function
- Check function exists: https://supabase.com/dashboard/project/toihfeffpljsmgritmuy/functions

### "RESEND_API_KEY not found"
- Set the secret in Function Settings
- Redeploy the function after setting secrets

### Email not sending
- Check Resend dashboard: https://resend.com/emails
- Check function logs in Supabase dashboard
- Verify Resend API key is valid

### CORS errors
- The function includes CORS headers
- Make sure you're calling from your app domain

---

## Next Steps After Deployment

Once the function is deployed:

1. ✅ **Test it** - Send a test invitation
2. ✅ **Run database migrations** - The function needs the database tables
3. ✅ **Try inviting an athlete** - From your coach dashboard
4. ✅ **Check email** - Verify the email was sent and looks good

---

## Supabase CLI Installation (for reference)

If you want to install the CLI on your local machine:

**macOS:**
```bash
brew install supabase/tap/supabase
```

**Linux:**
```bash
curl -L https://github.com/supabase/cli/releases/latest/download/supabase_linux_amd64.tar.gz | tar -xz
sudo mv supabase /usr/local/bin/supabase
```

**Windows:**
```bash
scoop install supabase
```

**NPM (not recommended, use package managers above):**
```bash
npm install supabase -D
npx supabase <command>
```

---

## Function Code Location

The function code is in:
- `supabase/functions/send-invitation-email/index.ts`

If you need to modify the email templates, edit this file and redeploy.

---

## Resend Free Tier

- ✅ 100 emails per day
- ✅ 3,000 emails per month
- ✅ No credit card required
- ✅ Professional email templates
- ✅ Email analytics

For production, consider verifying your domain to send from `invitations@tribos.studio` instead of `onboarding@resend.dev`.
