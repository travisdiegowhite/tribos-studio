# Send Invitation Email - Supabase Edge Function

This Edge Function sends coach invitation emails via Resend API.

## Setup

### 1. Install Supabase CLI

```bash
npm install -g supabase
```

### 2. Login to Supabase

```bash
supabase login
```

### 3. Link to your project

```bash
supabase link --project-ref toihfeffpljsmgritmuy
```

### 4. Get Resend API Key

1. Go to https://resend.com and create a free account
2. Create an API key
3. Copy the API key

### 5. Set Environment Variables

Set the Resend API key as a secret:

```bash
supabase secrets set RESEND_API_KEY=re_xxxxxxxxxxxxx
```

The function also uses these Supabase environment variables (automatically available):
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

### 6. Deploy the Function

```bash
supabase functions deploy send-invitation-email
```

### 7. Test the Function

```bash
curl -i --location --request POST \
  'https://toihfeffpljsmgritmuy.supabase.co/functions/v1/send-invitation-email' \
  --header 'Authorization: Bearer YOUR_ANON_KEY' \
  --header 'Content-Type: application/json' \
  --data '{
    "type": "new_user",
    "athleteEmail": "test@example.com",
    "coachId": "YOUR_COACH_ID",
    "invitationToken": "test-token-123",
    "coachMessage": "Looking forward to training with you!"
  }'
```

## Email Templates

### New User (No Account)
- Subject: `[Coach Name] invited you to join tribos.studio`
- CTA: "Create Account & Accept Invitation"
- Link: `https://tribos.studio/signup?invitation_token=xxx`

### Existing User
- Subject: `[Coach Name] wants to be your coach on tribos.studio`
- CTA: "View Invitation"
- Link: `https://tribos.studio/training`

## Resend Configuration

### Free Tier Limits
- 100 emails per day
- 3,000 emails per month
- No credit card required

### Sender Email
The function currently uses `onboarding@resend.dev` which works for testing.

For production:
1. Verify your domain in Resend dashboard
2. Update the `from` field in `index.ts`:
   ```typescript
   from: 'tribos.studio <invitations@tribos.studio>'
   ```

## Local Development

Test locally with:

```bash
supabase functions serve send-invitation-email
```

Then call it:

```bash
curl -i --location --request POST \
  'http://localhost:54321/functions/v1/send-invitation-email' \
  --header 'Authorization: Bearer YOUR_ANON_KEY' \
  --header 'Content-Type: application/json' \
  --data '{...}'
```

## Troubleshooting

### Function returns 500
- Check secrets are set: `supabase secrets list`
- Check function logs: `supabase functions logs send-invitation-email`

### Email not received
- Check spam folder
- Verify email address is valid
- Check Resend dashboard for delivery status

### CORS errors
- The function includes CORS headers for `*` origin
- Update if you need to restrict origins

## Environment Variables Reference

| Variable | Source | Description |
|----------|--------|-------------|
| `RESEND_API_KEY` | Secret (manual) | Your Resend API key |
| `SUPABASE_URL` | Auto | Your Supabase project URL |
| `SUPABASE_ANON_KEY` | Auto | Your Supabase anon/public key |
