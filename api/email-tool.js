// Vercel API Route: Email Campaign Operations
// Dedicated lightweight endpoint for email campaign management
// Extracted from api/admin.js to avoid cold-start timeout issues
//
// SECURITY: This endpoint is restricted to travis@tribos.studio ONLY
// All actions are logged to admin_audit_log table

import { getSupabaseAdmin } from './utils/supabaseAdmin.js';
import { Resend } from 'resend';
import { setupCors } from './utils/cors.js';
import { rateLimitMiddleware } from './utils/rateLimit.js';

const resend = new Resend(process.env.RESEND_API_KEY);

const supabase = getSupabaseAdmin();

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'travis@tribos.studio';

/**
 * Verify the user from JWT token and check admin authorization
 */
async function verifyAdminAccess(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { user: null, error: 'No authorization token provided' };
  }

  const token = authHeader.substring(7);
  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {
    console.error('Admin auth validation failed:', error?.message);
    return { user: null, error: 'Invalid or expired token' };
  }

  if (!user.email || user.email.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    console.warn(`SECURITY: Unauthorized email-tool access attempt by ${user.email} (ID: ${user.id})`);
    return { user: null, error: 'Unauthorized - admin access denied' };
  }

  return { user, error: null };
}

/**
 * Log admin action to audit table
 */
async function logAdminAction(adminUserId, action, targetUserId, details) {
  try {
    await supabase
      .from('admin_audit_log')
      .insert({
        admin_user_id: adminUserId,
        action,
        target_user_id: targetUserId,
        details,
        created_at: new Date().toISOString()
      });
  } catch (error) {
    console.error('Failed to log admin action:', error);
  }
}

export default async function handler(req, res) {
  if (setupCors(req, res)) {
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!process.env.SUPABASE_SERVICE_KEY) {
    console.error('CRITICAL: SUPABASE_SERVICE_KEY not configured for email-tool endpoint');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const { user: adminUser, error: authError } = await verifyAdminAccess(req);
  if (!adminUser) {
    return res.status(403).json({ error: authError || 'Unauthorized' });
  }

  const rateLimitResult = await rateLimitMiddleware(req, res, 'EMAIL_TOOL', 30, 1);
  if (rateLimitResult !== null) {
    return;
  }

  try {
    const { action } = req.body;

    if (!action) {
      return res.status(400).json({ error: 'Action is required' });
    }

    switch (action) {
      case 'list_campaigns':
        return await listCampaigns(req, res, adminUser);
      case 'get_campaign':
        return await getCampaign(req, res, adminUser);
      case 'create_campaign':
        return await createCampaign(req, res, adminUser);
      case 'update_campaign':
        return await updateCampaign(req, res, adminUser);
      case 'delete_campaign':
        return await deleteCampaign(req, res, adminUser);
      case 'preview_recipients':
        return await previewRecipients(req, res, adminUser);
      case 'send_test_email':
        return await sendTestEmail(req, res, adminUser);
      case 'send_campaign':
        return await sendCampaign(req, res, adminUser);
      default:
        return res.status(400).json({ error: 'Invalid action' });
    }
  } catch (error) {
    console.error('Email tool API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// ============================================================================
// Campaign CRUD
// ============================================================================

async function listCampaigns(req, res, adminUser) {
  await logAdminAction(adminUser.id, 'list_campaigns', null, null);

  const { data: campaigns, error } = await supabase
    .from('email_campaigns')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error listing campaigns:', error);
    return res.status(500).json({ error: 'Failed to list campaigns' });
  }

  return res.status(200).json({
    success: true,
    campaigns: campaigns || []
  });
}

async function getCampaign(req, res, adminUser) {
  const { campaignId } = req.body;

  if (!campaignId) {
    return res.status(400).json({ error: 'campaignId is required' });
  }

  await logAdminAction(adminUser.id, 'get_campaign', null, { campaignId });

  const { data: campaign, error: campaignError } = await supabase
    .from('email_campaigns')
    .select('*')
    .eq('id', campaignId)
    .single();

  if (campaignError || !campaign) {
    return res.status(404).json({ error: 'Campaign not found' });
  }

  const { data: recipients } = await supabase
    .from('email_recipients')
    .select('id, email, status, sent_at, delivered_at, first_opened_at, first_clicked_at, open_count, click_count, error_message')
    .eq('campaign_id', campaignId)
    .order('created_at', { ascending: false });

  return res.status(200).json({
    success: true,
    campaign,
    recipients: recipients || []
  });
}

async function createCampaign(req, res, adminUser) {
  const { name, subject, htmlContent, textContent, campaignType, audienceType, filterCriteria, fromName, fromEmail, replyTo } = req.body;

  if (!name || !subject || !htmlContent) {
    return res.status(400).json({ error: 'name, subject, and htmlContent are required' });
  }

  await logAdminAction(adminUser.id, 'create_campaign', null, { name, subject });

  const { data: campaign, error } = await supabase
    .from('email_campaigns')
    .insert({
      name,
      subject,
      html_content: htmlContent,
      text_content: textContent || null,
      campaign_type: campaignType || 'announcement',
      audience_type: audienceType || 'users',
      filter_criteria: filterCriteria || {},
      from_name: fromName || 'Tribos Studio',
      from_email: fromEmail || 'noreply@tribos.studio',
      reply_to: replyTo || null,
      created_by: adminUser.id
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating campaign:', error);
    return res.status(500).json({ error: 'Failed to create campaign' });
  }

  return res.status(200).json({
    success: true,
    campaign
  });
}

async function updateCampaign(req, res, adminUser) {
  const { campaignId, name, subject, htmlContent, textContent, campaignType, audienceType, filterCriteria, fromName, fromEmail, replyTo } = req.body;

  if (!campaignId) {
    return res.status(400).json({ error: 'campaignId is required' });
  }

  const { data: existing, error: fetchError } = await supabase
    .from('email_campaigns')
    .select('status')
    .eq('id', campaignId)
    .single();

  if (fetchError || !existing) {
    return res.status(404).json({ error: 'Campaign not found' });
  }

  if (existing.status !== 'draft') {
    return res.status(400).json({ error: 'Can only update draft campaigns' });
  }

  await logAdminAction(adminUser.id, 'update_campaign', null, { campaignId });

  const updates = {};
  if (name !== undefined) updates.name = name;
  if (subject !== undefined) updates.subject = subject;
  if (htmlContent !== undefined) updates.html_content = htmlContent;
  if (textContent !== undefined) updates.text_content = textContent;
  if (campaignType !== undefined) updates.campaign_type = campaignType;
  if (audienceType !== undefined) updates.audience_type = audienceType;
  if (filterCriteria !== undefined) updates.filter_criteria = filterCriteria;
  if (fromName !== undefined) updates.from_name = fromName;
  if (fromEmail !== undefined) updates.from_email = fromEmail;
  if (replyTo !== undefined) updates.reply_to = replyTo;

  const { data: campaign, error } = await supabase
    .from('email_campaigns')
    .update(updates)
    .eq('id', campaignId)
    .select()
    .single();

  if (error) {
    console.error('Error updating campaign:', error);
    return res.status(500).json({ error: 'Failed to update campaign' });
  }

  return res.status(200).json({
    success: true,
    campaign
  });
}

async function deleteCampaign(req, res, adminUser) {
  const { campaignId } = req.body;

  if (!campaignId) {
    return res.status(400).json({ error: 'campaignId is required' });
  }

  const { data: existing, error: fetchError } = await supabase
    .from('email_campaigns')
    .select('status')
    .eq('id', campaignId)
    .single();

  if (fetchError || !existing) {
    return res.status(404).json({ error: 'Campaign not found' });
  }

  if (existing.status !== 'draft') {
    return res.status(400).json({ error: 'Can only delete draft campaigns' });
  }

  await logAdminAction(adminUser.id, 'delete_campaign', null, { campaignId });

  const { error } = await supabase
    .from('email_campaigns')
    .delete()
    .eq('id', campaignId);

  if (error) {
    console.error('Error deleting campaign:', error);
    return res.status(500).json({ error: 'Failed to delete campaign' });
  }

  return res.status(200).json({
    success: true,
    message: 'Campaign deleted'
  });
}

// ============================================================================
// Recipients & Sending
// ============================================================================

async function previewRecipients(req, res, adminUser) {
  const { audienceType, filterCriteria } = req.body;

  await logAdminAction(adminUser.id, 'preview_recipients', null, { audienceType, filterCriteria });

  try {
    const recipients = await getFilteredRecipients(audienceType || 'users', filterCriteria || {});

    return res.status(200).json({
      success: true,
      recipients: recipients.slice(0, 100),
      total: recipients.length
    });
  } catch (error) {
    console.error('Error previewing recipients:', error);
    return res.status(500).json({ error: 'Failed to preview recipients' });
  }
}

async function sendTestEmail(req, res, adminUser) {
  const { subject, htmlContent, fromName, fromEmail } = req.body;

  if (!subject || !htmlContent) {
    return res.status(400).json({ error: 'subject and htmlContent are required' });
  }

  await logAdminAction(adminUser.id, 'send_test_email', null, { subject });

  try {
    const { data, error } = await resend.emails.send({
      from: `${fromName || 'Tribos Studio'} <${fromEmail || 'noreply@tribos.studio'}>`,
      to: [adminUser.email],
      subject: `[TEST] ${subject}`,
      html: htmlContent
    });

    if (error) {
      console.error('Resend test email error:', error);
      return res.status(500).json({ error: 'Failed to send test email', details: error });
    }

    return res.status(200).json({
      success: true,
      message: `Test email sent to ${adminUser.email}`,
      messageId: data.id
    });
  } catch (error) {
    console.error('Error sending test email:', error);
    return res.status(500).json({ error: 'Failed to send test email' });
  }
}

async function sendCampaign(req, res, adminUser) {
  const { campaignId } = req.body;

  if (!campaignId) {
    return res.status(400).json({ error: 'campaignId is required' });
  }

  const { data: campaign, error: campaignError } = await supabase
    .from('email_campaigns')
    .select('*')
    .eq('id', campaignId)
    .single();

  if (campaignError || !campaign) {
    return res.status(404).json({ error: 'Campaign not found' });
  }

  if (campaign.status !== 'draft') {
    return res.status(400).json({ error: 'Campaign has already been sent or is in progress' });
  }

  await logAdminAction(adminUser.id, 'send_campaign', null, { campaignId, campaignName: campaign.name });

  try {
    const recipients = await getFilteredRecipients(campaign.audience_type, campaign.filter_criteria);

    if (recipients.length === 0) {
      return res.status(400).json({ error: 'No recipients match the filter criteria' });
    }

    // Update campaign status to sending
    await supabase
      .from('email_campaigns')
      .update({
        status: 'sending',
        started_at: new Date().toISOString(),
        total_recipients: recipients.length
      })
      .eq('id', campaignId);

    // Insert all recipients into email_recipients table
    const recipientRecords = recipients.map(r => ({
      campaign_id: campaignId,
      user_id: r.user_id || null,
      email: r.email,
      recipient_name: r.name || null,
      source: r.source || 'users',
      status: 'pending'
    }));

    await supabase
      .from('email_recipients')
      .insert(recipientRecords);

    // Send emails in batches of 100 (Resend limit)
    const BATCH_SIZE = 100;
    const batches = [];
    for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
      batches.push(recipients.slice(i, i + BATCH_SIZE));
    }

    let sentCount = 0;
    let failedCount = 0;

    for (let batchNum = 0; batchNum < batches.length; batchNum++) {
      const batch = batches[batchNum];

      try {
        const emailBatch = batch.map(r => {
          const email = {
            from: `${campaign.from_name} <${campaign.from_email}>`,
            to: [r.email],
            subject: campaign.subject,
            html: campaign.html_content
          };
          if (campaign.text_content) email.text = campaign.text_content;
          if (campaign.reply_to) email.replyTo = campaign.reply_to;
          return email;
        });

        console.log(`Sending batch ${batchNum + 1} with ${emailBatch.length} emails`);

        const { data: batchResult, error: batchError } = await resend.batch.send(emailBatch);

        if (batchError) {
          const errorMsg = batchError.message || JSON.stringify(batchError) || 'Batch send failed';
          console.error(`Batch ${batchNum + 1} error:`, errorMsg, batchError);
          for (const recipient of batch) {
            await supabase
              .from('email_recipients')
              .update({
                status: 'failed',
                error_message: errorMsg
              })
              .eq('campaign_id', campaignId)
              .eq('email', recipient.email);
          }
          failedCount += batch.length;
        } else {
          for (let i = 0; i < batchResult.data.length; i++) {
            const resendId = batchResult.data[i].id;
            const recipient = batch[i];

            await supabase
              .from('email_recipients')
              .update({
                resend_email_id: resendId,
                status: 'sent',
                sent_at: new Date().toISOString(),
                batch_number: batchNum + 1
              })
              .eq('campaign_id', campaignId)
              .eq('email', recipient.email);
          }
          sentCount += batch.length;
        }

        // Small delay between batches to stay under rate limit
        if (batchNum < batches.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      } catch (err) {
        const errorMsg = err.message || JSON.stringify(err) || 'Unknown error';
        console.error(`Batch ${batchNum + 1} exception:`, errorMsg, err);
        for (const recipient of batch) {
          await supabase
            .from('email_recipients')
            .update({
              status: 'failed',
              error_message: errorMsg
            })
            .eq('campaign_id', campaignId)
            .eq('email', recipient.email);
        }
        failedCount += batch.length;
      }
    }

    // Update campaign status to completed
    await supabase
      .from('email_campaigns')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        sent_count: sentCount,
        failed_count: failedCount
      })
      .eq('id', campaignId);

    return res.status(200).json({
      success: true,
      message: `Campaign sent to ${sentCount} recipients`,
      stats: {
        total: recipients.length,
        sent: sentCount,
        failed: failedCount
      }
    });
  } catch (error) {
    console.error('Error sending campaign:', error);

    await supabase
      .from('email_campaigns')
      .update({
        status: 'draft'
      })
      .eq('id', campaignId);

    return res.status(500).json({ error: 'Failed to send campaign' });
  }
}

// ============================================================================
// Recipient Filtering (optimized)
// ============================================================================

/**
 * Get filtered recipients based on audience type and filter criteria.
 * Optimized to scope queries to relevant user IDs instead of fetching entire tables.
 */
async function getFilteredRecipients(audienceType, filterCriteria) {
  const recipients = [];
  const seenEmails = new Set();

  const isManualSelection = filterCriteria.selectedUserIds && filterCriteria.selectedUserIds.length > 0;

  // Get registered users if needed
  if (audienceType === 'users' || audienceType === 'both') {
    // Paginate to get ALL users
    let allAuthUsers = [];
    let authPage = 1;
    while (true) {
      const { data, error } = await supabase.auth.admin.listUsers({ page: authPage, perPage: 1000 });
      if (error) {
        console.error('Error listing auth users:', error);
        throw new Error('Failed to list users');
      }
      allAuthUsers = allAuthUsers.concat(data.users || []);
      if (!data.users || data.users.length < 1000) break;
      authPage++;
    }

    let users = allAuthUsers;

    if (isManualSelection) {
      users = users.filter(u =>
        filterCriteria.selectedUserIds.includes(u.id) ||
        filterCriteria.selectedUserIds.includes(u.email)
      );
    } else {
      // Apply date/verification filters first to narrow down the set
      if (filterCriteria.emailVerified) {
        users = users.filter(u => u.email_confirmed_at);
      }

      if (filterCriteria.signedUpAfter) {
        const cutoff = new Date(filterCriteria.signedUpAfter);
        users = users.filter(u => new Date(u.created_at) >= cutoff);
      }

      if (filterCriteria.signedUpBefore) {
        const cutoff = new Date(filterCriteria.signedUpBefore);
        users = users.filter(u => new Date(u.created_at) <= cutoff);
      }

      if (filterCriteria.lastSignInWithinDays) {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - filterCriteria.lastSignInWithinDays);
        users = users.filter(u => u.last_sign_in_at && new Date(u.last_sign_in_at) >= cutoff);
      }

      // Scope all subsequent queries to the remaining user IDs
      const userIds = users.map(u => u.id);

      // Activity-based filters — only query if actually needed
      if (filterCriteria.hasActivity !== undefined || filterCriteria.activityCountMin) {
        // Scope to current user set instead of fetching ALL activities
        const { data: activities } = await supabase
          .from('activities')
          .select('user_id')
          .in('user_id', userIds);

        const activityCounts = {};
        (activities || []).forEach(a => {
          activityCounts[a.user_id] = (activityCounts[a.user_id] || 0) + 1;
        });

        if (filterCriteria.hasActivity === true) {
          users = users.filter(u => (activityCounts[u.id] || 0) > 0);
        } else if (filterCriteria.hasActivity === false) {
          users = users.filter(u => (activityCounts[u.id] || 0) === 0);
        }

        if (filterCriteria.activityCountMin) {
          users = users.filter(u => (activityCounts[u.id] || 0) >= filterCriteria.activityCountMin);
        }
      }

      // Integration filters — cache results to avoid double-fetching
      let integrationData = null;
      const needsIntegrations = (filterCriteria.integrations && filterCriteria.integrations.length > 0)
        || filterCriteria.hasIntegration !== undefined;

      if (needsIntegrations) {
        const { data } = await supabase
          .from('bike_computer_integrations')
          .select('user_id, provider')
          .in('user_id', userIds);
        integrationData = data || [];
      }

      if (filterCriteria.integrations && filterCriteria.integrations.length > 0 && integrationData) {
        const userIntegrations = {};
        integrationData.forEach(i => {
          if (!userIntegrations[i.user_id]) {
            userIntegrations[i.user_id] = [];
          }
          userIntegrations[i.user_id].push(i.provider);
        });

        users = users.filter(u => {
          const userProviders = userIntegrations[u.id] || [];
          return filterCriteria.integrations.some(p => userProviders.includes(p));
        });
      }

      if (filterCriteria.hasIntegration !== undefined && integrationData) {
        const usersWithIntegrations = new Set(integrationData.map(i => i.user_id));

        if (filterCriteria.hasIntegration === true) {
          users = users.filter(u => usersWithIntegrations.has(u.id));
        } else {
          users = users.filter(u => !usersWithIntegrations.has(u.id));
        }
      }

      // User health status filter
      if (filterCriteria.userStatus && filterCriteria.userStatus.length > 0) {
        const currentUserIds = users.map(u => u.id);

        // Scope queries to current user set
        const [statusActivities, statusIntegrations, statusEvents] = await Promise.all([
          supabase.from('activities').select('user_id').in('user_id', currentUserIds),
          supabase.from('bike_computer_integrations').select('user_id').in('user_id', currentUserIds),
          supabase.from('user_activity_events').select('user_id, created_at').in('user_id', currentUserIds)
        ]);

        const statusActivitySet = new Set((statusActivities.data || []).map(a => a.user_id));
        const statusIntegrationSet = new Set((statusIntegrations.data || []).map(i => i.user_id));

        const lastEventByUser = {};
        (statusEvents.data || []).forEach(e => {
          const ts = new Date(e.created_at).getTime();
          if (!lastEventByUser[e.user_id] || ts > lastEventByUser[e.user_id]) {
            lastEventByUser[e.user_id] = ts;
          }
        });

        const now = Date.now();
        users = users.filter(u => {
          const lastEvent = lastEventByUser[u.id] || 0;
          const lastSignIn = u.last_sign_in_at ? new Date(u.last_sign_in_at).getTime() : 0;
          const latest = Math.max(lastEvent, lastSignIn);
          const daysSinceActive = latest > 0 ? Math.floor((now - latest) / 86400000) : null;
          const hasActivity = statusActivitySet.has(u.id);
          const hasIntegration = statusIntegrationSet.has(u.id);

          let status = 'healthy';
          if (daysSinceActive === null || daysSinceActive > 30) {
            status = !hasActivity && !hasIntegration ? 'never_activated' : 'churned';
          } else if (daysSinceActive > 14) {
            status = 'at_risk';
          }

          return filterCriteria.userStatus.includes(status);
        });
      }
    }

    // Sort users by signup date (newest first)
    users.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    for (const user of users) {
      if (user.email && !seenEmails.has(user.email.toLowerCase())) {
        seenEmails.add(user.email.toLowerCase());
        recipients.push({
          user_id: user.id,
          email: user.email,
          name: user.user_metadata?.name || null,
          source: 'users',
          created_at: user.created_at
        });
      }
    }
  }

  // Get beta signups if needed
  if (audienceType === 'beta_signups' || audienceType === 'both') {
    let query = supabase.from('beta_signups').select('*');

    if (isManualSelection) {
      query = query.in('email', filterCriteria.selectedUserIds);
    } else {
      if (filterCriteria.betaStatus) {
        query = query.eq('status', filterCriteria.betaStatus);
      }

      if (filterCriteria.wantsNotifications !== undefined) {
        query = query.eq('wants_notifications', filterCriteria.wantsNotifications);
      }
    }

    query = query.order('signed_up_at', { ascending: false });

    const { data: signups, error: signupsError } = await query;

    if (signupsError) {
      console.error('Error fetching beta signups:', signupsError);
    } else {
      for (const signup of (signups || [])) {
        if (signup.email && !seenEmails.has(signup.email.toLowerCase())) {
          seenEmails.add(signup.email.toLowerCase());
          recipients.push({
            user_id: signup.user_id || null,
            email: signup.email,
            name: signup.name || null,
            source: 'beta_signups',
            created_at: signup.signed_up_at || signup.created_at
          });
        }
      }
    }
  }

  return recipients;
}
