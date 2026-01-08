// Vercel API Route: Resend Webhook Handler
// Receives delivery/open/click events from Resend for email tracking
// Setup: Configure webhook URL in Resend dashboard: https://yourdomain.com/api/resend-webhook

import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { setupCors } from './utils/cors.js';

// Initialize Supabase with service key for database operations
const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

/**
 * Verify webhook signature from Resend (using Svix)
 * This ensures the webhook is actually from Resend
 */
function verifyWebhookSignature(payload, headers) {
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;

  // Skip verification if no secret configured (not recommended for production)
  if (!webhookSecret) {
    console.warn('RESEND_WEBHOOK_SECRET not configured - skipping signature verification');
    return true;
  }

  const svixId = headers['svix-id'];
  const svixTimestamp = headers['svix-timestamp'];
  const svixSignature = headers['svix-signature'];

  if (!svixId || !svixTimestamp || !svixSignature) {
    console.error('Missing Svix headers for webhook verification');
    return false;
  }

  // Verify timestamp is within tolerance (5 minutes)
  const timestamp = parseInt(svixTimestamp, 10);
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > 300) {
    console.error('Webhook timestamp out of tolerance');
    return false;
  }

  // Create the signed content
  const signedContent = `${svixId}.${svixTimestamp}.${payload}`;

  // Extract the expected signature
  const expectedSignatures = svixSignature.split(' ');

  // Get the secret (remove 'whsec_' prefix if present)
  const secret = webhookSecret.startsWith('whsec_')
    ? webhookSecret.slice(6)
    : webhookSecret;
  const secretBytes = Buffer.from(secret, 'base64');

  // Compute the signature
  const computedSignature = crypto
    .createHmac('sha256', secretBytes)
    .update(signedContent)
    .digest('base64');

  // Check if any of the expected signatures match
  for (const sig of expectedSignatures) {
    const [version, signature] = sig.split(',');
    if (version === 'v1' && signature === computedSignature) {
      return true;
    }
  }

  console.error('Webhook signature verification failed');
  return false;
}

export default async function handler(req, res) {
  // Handle CORS (for browser testing, but webhooks come directly from Resend)
  if (setupCors(req, res)) {
    return;
  }

  // Only accept POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Get raw body for signature verification
  const rawBody = JSON.stringify(req.body);

  // Verify webhook signature
  if (!verifyWebhookSignature(rawBody, req.headers)) {
    return res.status(401).json({ error: 'Invalid webhook signature' });
  }

  try {
    const event = req.body;
    const eventType = event.type;
    const data = event.data;

    console.log(`Resend webhook received: ${eventType}`, { emailId: data?.email_id });

    // Map event types to our status and timestamp fields
    const eventMap = {
      'email.sent': { status: 'sent', timestampField: 'sent_at' },
      'email.delivered': { status: 'delivered', timestampField: 'delivered_at' },
      'email.delivery_delayed': { status: 'sent', timestampField: null }, // Keep as sent, no new timestamp
      'email.opened': { status: 'opened', timestampField: 'first_opened_at', counter: 'open_count' },
      'email.clicked': { status: 'clicked', timestampField: 'first_clicked_at', counter: 'click_count' },
      'email.bounced': { status: 'bounced', timestampField: 'bounced_at' },
      'email.complained': { status: 'complained', timestampField: 'complained_at' }
    };

    const eventInfo = eventMap[eventType];

    if (!eventInfo) {
      // Unknown event type - just acknowledge
      console.log(`Ignoring unknown Resend event type: ${eventType}`);
      return res.status(200).json({ received: true });
    }

    const emailId = data?.email_id;
    if (!emailId) {
      console.warn('Webhook event missing email_id');
      return res.status(200).json({ received: true });
    }

    // Find the recipient by Resend email ID
    const { data: recipient, error: findError } = await supabase
      .from('email_recipients')
      .select('id, campaign_id, status, first_opened_at, first_clicked_at')
      .eq('resend_email_id', emailId)
      .single();

    if (findError || !recipient) {
      // Email not found in our system - might be from a different source
      console.log(`Email ID ${emailId} not found in email_recipients`);
      return res.status(200).json({ received: true });
    }

    // Build update object
    const updates = {
      updated_at: new Date().toISOString()
    };

    // Status progression: pending -> sent -> delivered -> opened -> clicked
    // Don't downgrade status (e.g., don't go from 'opened' back to 'delivered')
    const statusOrder = ['pending', 'failed', 'sent', 'delivered', 'bounced', 'complained', 'opened', 'clicked'];
    const currentStatusIndex = statusOrder.indexOf(recipient.status);
    const newStatusIndex = statusOrder.indexOf(eventInfo.status);

    if (newStatusIndex > currentStatusIndex) {
      updates.status = eventInfo.status;
    }

    // Set timestamp only if not already set (first occurrence)
    if (eventInfo.timestampField) {
      // For first_opened_at and first_clicked_at, only set if null
      if (eventInfo.timestampField === 'first_opened_at' && !recipient.first_opened_at) {
        updates.first_opened_at = new Date().toISOString();
      } else if (eventInfo.timestampField === 'first_clicked_at' && !recipient.first_clicked_at) {
        updates.first_clicked_at = new Date().toISOString();
      } else if (eventInfo.timestampField !== 'first_opened_at' && eventInfo.timestampField !== 'first_clicked_at') {
        updates[eventInfo.timestampField] = new Date().toISOString();
      }
    }

    // Handle bounce/complaint details
    if (eventType === 'email.bounced' && data.bounce) {
      updates.error_message = data.bounce.message || 'Email bounced';
      updates.error_code = data.bounce.type || null;
    }

    if (eventType === 'email.complained') {
      updates.error_message = 'Marked as spam by recipient';
    }

    // Update recipient record
    await supabase
      .from('email_recipients')
      .update(updates)
      .eq('id', recipient.id);

    // Increment counters for opens/clicks
    if (eventInfo.counter) {
      await supabase.rpc('increment_recipient_counter', {
        p_resend_id: emailId,
        p_counter: eventInfo.counter
      });
    }

    // Update campaign stats
    if (recipient.campaign_id) {
      await supabase.rpc('update_campaign_stats', {
        p_campaign_id: recipient.campaign_id
      });
    }

    console.log(`Updated recipient ${recipient.id} with event ${eventType}`);

    return res.status(200).json({ received: true });

  } catch (error) {
    console.error('Error processing Resend webhook:', error);
    // Return 200 to prevent Resend from retrying (we've logged the error)
    return res.status(200).json({ received: true, error: 'Processing error logged' });
  }
}
