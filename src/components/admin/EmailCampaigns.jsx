/**
 * Email Campaigns Component
 * Batch email management for admin dashboard
 * Features: Create campaigns, filter recipients, preview, send test, track stats
 */

import { useState, useEffect } from 'react';
import {
  Paper,
  Table,
  Text,
  Badge,
  Button,
  Group,
  Stack,
  Alert,
  Modal,
  Loader,
  TextInput,
  Textarea,
  Select,
  Switch,
  NumberInput,
  ActionIcon,
  Tooltip,
  Box,
  Card,
  SimpleGrid,
  Tabs,
  Progress,
  Divider,
  Code,
  ScrollArea
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import {
  IconPlus,
  IconSend,
  IconTrash,
  IconRefresh,
  IconAlertTriangle,
  IconMail,
  IconMailOpened,
  IconClick,
  IconUsers,
  IconFilter,
  IconEye,
  IconEdit,
  IconCheck,
  IconX,
  IconTestPipe,
  IconChartBar
} from '@tabler/icons-react';
import {
  listCampaigns,
  getCampaign,
  createCampaign,
  updateCampaign,
  deleteCampaign,
  previewRecipients,
  sendTestEmail,
  sendCampaign
} from '../../services/adminService';

// Default email template
const DEFAULT_HTML_TEMPLATE = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{subject}}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #121212;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #121212; padding: 40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #1a1a1a; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.3);">
          <!-- Header -->
          <tr>
            <td style="padding: 30px 40px; text-align: center; border-bottom: 1px solid #222222;">
              <p style="margin: 0; color: #32CD32; font-size: 18px; font-weight: 700; letter-spacing: 0.1em;">TRIBOS.STUDIO</p>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <h1 style="margin: 0 0 20px; color: #ffffff; font-size: 24px; font-weight: 700;">{{title}}</h1>
              <p style="margin: 0 0 25px; font-size: 16px; line-height: 1.7; color: #B8B8B8;">{{content}}</p>

              <!-- Optional CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin: 30px 0;">
                <tr>
                  <td align="center">
                    <a href="https://www.tribos.studio" style="display: inline-block; padding: 16px 32px; background-color: #32CD32; color: #121212; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">Visit Tribos.Studio</a>
                  </td>
                </tr>
              </table>

              <p style="margin: 25px 0 5px; font-size: 16px; line-height: 1.6; color: #B8B8B8;">Happy riding,</p>
              <p style="margin: 0; font-size: 16px; line-height: 1.6; color: #ffffff; font-weight: 600;">Travis</p>
              <p style="margin: 5px 0 0; font-size: 14px; color: #999999;">Founder, Tribos.Studio</p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color: #121212; padding: 30px 40px; text-align: center; border-radius: 0 0 12px 12px; border-top: 1px solid #222222;">
              <p style="margin: 0 0 10px; font-size: 14px; color: #999999;"><strong style="color: #32CD32;">tribos.studio</strong></p>
              <p style="margin: 0; font-size: 12px; color: #666666;">Training load analytics & smart route planning for cyclists</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

// Campaign type options
const CAMPAIGN_TYPES = [
  { value: 'announcement', label: 'Announcement' },
  { value: 'feature', label: 'Feature Update' },
  { value: 'newsletter', label: 'Newsletter' },
  { value: 'reengagement', label: 'Re-engagement' },
  { value: 'beta_invite', label: 'Beta Invite' }
];

// Audience type options
const AUDIENCE_TYPES = [
  { value: 'users', label: 'Registered Users' },
  { value: 'beta_signups', label: 'Beta Signups' },
  { value: 'both', label: 'Both (Users + Beta Signups)' }
];

export default function EmailCampaigns() {
  // Campaign list state
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Editor state
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    subject: '',
    htmlContent: DEFAULT_HTML_TEMPLATE,
    textContent: '',
    campaignType: 'announcement',
    audienceType: 'users',
    fromName: 'Tribos Studio',
    fromEmail: 'noreply@tribos.studio',
    replyTo: 'travis@tribos.studio'
  });

  // Filter criteria state
  const [filterCriteria, setFilterCriteria] = useState({});

  // Preview state
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewRecipientsList, setPreviewRecipientsList] = useState([]);
  const [previewTotal, setPreviewTotal] = useState(0);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Campaign details state
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [campaignRecipients, setCampaignRecipients] = useState([]);
  const [detailsLoading, setDetailsLoading] = useState(false);

  // Send state
  const [sendingTest, setSendingTest] = useState(false);
  const [sendingCampaign, setSendingCampaign] = useState(false);
  const [confirmSend, setConfirmSend] = useState(false);

  // Load campaigns on mount
  useEffect(() => {
    loadCampaigns();
  }, []);

  async function loadCampaigns() {
    setLoading(true);
    setError(null);
    try {
      const result = await listCampaigns();
      setCampaigns(result.campaigns || []);
    } catch (err) {
      console.error('Failed to load campaigns:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // Open editor for new campaign
  function handleNewCampaign() {
    setEditingCampaign(null);
    setFormData({
      name: '',
      subject: '',
      htmlContent: DEFAULT_HTML_TEMPLATE,
      textContent: '',
      campaignType: 'announcement',
      audienceType: 'users',
      fromName: 'Tribos Studio',
      fromEmail: 'noreply@tribos.studio',
      replyTo: 'travis@tribos.studio'
    });
    setFilterCriteria({});
    setEditorOpen(true);
  }

  // Open editor for existing campaign
  function handleEditCampaign(campaign) {
    setEditingCampaign(campaign);
    setFormData({
      name: campaign.name,
      subject: campaign.subject,
      htmlContent: campaign.html_content,
      textContent: campaign.text_content || '',
      campaignType: campaign.campaign_type,
      audienceType: campaign.audience_type,
      fromName: campaign.from_name,
      fromEmail: campaign.from_email,
      replyTo: campaign.reply_to || ''
    });
    setFilterCriteria(campaign.filter_criteria || {});
    setEditorOpen(true);
  }

  // Save campaign
  async function handleSaveCampaign() {
    if (!formData.name || !formData.subject || !formData.htmlContent) {
      setError('Name, subject, and HTML content are required');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      if (editingCampaign) {
        await updateCampaign(editingCampaign.id, {
          name: formData.name,
          subject: formData.subject,
          htmlContent: formData.htmlContent,
          textContent: formData.textContent || null,
          campaignType: formData.campaignType,
          audienceType: formData.audienceType,
          filterCriteria,
          fromName: formData.fromName,
          fromEmail: formData.fromEmail,
          replyTo: formData.replyTo || null
        });
      } else {
        await createCampaign({
          name: formData.name,
          subject: formData.subject,
          htmlContent: formData.htmlContent,
          textContent: formData.textContent || null,
          campaignType: formData.campaignType,
          audienceType: formData.audienceType,
          filterCriteria,
          fromName: formData.fromName,
          fromEmail: formData.fromEmail,
          replyTo: formData.replyTo || null
        });
      }

      setEditorOpen(false);
      loadCampaigns();
    } catch (err) {
      console.error('Failed to save campaign:', err);
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  // Delete campaign
  async function handleDeleteCampaign(campaign) {
    if (!confirm(`Delete campaign "${campaign.name}"? This cannot be undone.`)) {
      return;
    }

    try {
      await deleteCampaign(campaign.id);
      loadCampaigns();
    } catch (err) {
      console.error('Failed to delete campaign:', err);
      setError(err.message);
    }
  }

  // Preview recipients
  async function handlePreviewRecipients() {
    setPreviewLoading(true);
    try {
      const result = await previewRecipients(formData.audienceType, filterCriteria);
      setPreviewRecipientsList(result.recipients || []);
      setPreviewTotal(result.total || 0);
      setPreviewOpen(true);
    } catch (err) {
      console.error('Failed to preview recipients:', err);
      setError(err.message);
    } finally {
      setPreviewLoading(false);
    }
  }

  // Send test email
  async function handleSendTest() {
    if (!formData.subject || !formData.htmlContent) {
      setError('Subject and HTML content are required');
      return;
    }

    setSendingTest(true);
    setError(null);

    try {
      const result = await sendTestEmail({
        subject: formData.subject,
        htmlContent: formData.htmlContent,
        fromName: formData.fromName,
        fromEmail: formData.fromEmail
      });
      alert(result.message || 'Test email sent!');
    } catch (err) {
      console.error('Failed to send test:', err);
      setError(err.message);
    } finally {
      setSendingTest(false);
    }
  }

  // Send campaign
  async function handleSendCampaign() {
    if (!editingCampaign) return;

    setSendingCampaign(true);
    setError(null);

    try {
      const result = await sendCampaign(editingCampaign.id);
      alert(`Campaign sent! ${result.message}`);
      setConfirmSend(false);
      setEditorOpen(false);
      loadCampaigns();
    } catch (err) {
      console.error('Failed to send campaign:', err);
      setError(err.message);
    } finally {
      setSendingCampaign(false);
    }
  }

  // View campaign details
  async function handleViewDetails(campaign) {
    setSelectedCampaign(campaign);
    setDetailsLoading(true);
    setDetailsOpen(true);

    try {
      const result = await getCampaign(campaign.id);
      setSelectedCampaign(result.campaign);
      setCampaignRecipients(result.recipients || []);
    } catch (err) {
      console.error('Failed to load campaign details:', err);
      setError(err.message);
    } finally {
      setDetailsLoading(false);
    }
  }

  // Format date
  function formatDate(dateString) {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  // Get status badge color
  function getStatusColor(status) {
    switch (status) {
      case 'draft': return 'gray';
      case 'sending': return 'blue';
      case 'completed': return 'green';
      case 'cancelled': return 'red';
      default: return 'gray';
    }
  }

  if (loading) {
    return (
      <Stack align="center" py="xl">
        <Loader size="lg" />
        <Text c="dimmed">Loading campaigns...</Text>
      </Stack>
    );
  }

  return (
    <Stack gap="md">
      {/* Error Alert */}
      {error && (
        <Alert
          icon={<IconAlertTriangle size={16} />}
          title="Error"
          color="red"
          withCloseButton
          onClose={() => setError(null)}
        >
          {error}
        </Alert>
      )}

      {/* Header */}
      <Paper withBorder p="md">
        <Group justify="space-between">
          <div>
            <Text fw={600} size="lg">Email Campaigns</Text>
            <Text size="sm" c="dimmed">Create and send batch emails to your users</Text>
          </div>
          <Group>
            <Button
              leftSection={<IconRefresh size={16} />}
              variant="light"
              onClick={loadCampaigns}
            >
              Refresh
            </Button>
            <Button
              leftSection={<IconPlus size={16} />}
              onClick={handleNewCampaign}
            >
              New Campaign
            </Button>
          </Group>
        </Group>
      </Paper>

      {/* Campaigns Table */}
      <Paper withBorder>
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Name</Table.Th>
              <Table.Th>Type</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th>Recipients</Table.Th>
              <Table.Th>Sent</Table.Th>
              <Table.Th>Opens</Table.Th>
              <Table.Th>Clicks</Table.Th>
              <Table.Th>Created</Table.Th>
              <Table.Th>Actions</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {campaigns.map(campaign => (
              <Table.Tr key={campaign.id}>
                <Table.Td>
                  <Text fw={500}>{campaign.name}</Text>
                  <Text size="xs" c="dimmed">{campaign.subject}</Text>
                </Table.Td>
                <Table.Td>
                  <Badge variant="light" size="sm">
                    {campaign.campaign_type}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  <Badge color={getStatusColor(campaign.status)}>
                    {campaign.status}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  <Text size="sm">{campaign.total_recipients || 0}</Text>
                </Table.Td>
                <Table.Td>
                  <Text size="sm">{campaign.sent_count || 0}</Text>
                </Table.Td>
                <Table.Td>
                  <Group gap={4}>
                    <Text size="sm">{campaign.opened_count || 0}</Text>
                    {campaign.sent_count > 0 && (
                      <Text size="xs" c="dimmed">
                        ({Math.round((campaign.opened_count / campaign.sent_count) * 100) || 0}%)
                      </Text>
                    )}
                  </Group>
                </Table.Td>
                <Table.Td>
                  <Group gap={4}>
                    <Text size="sm">{campaign.clicked_count || 0}</Text>
                    {campaign.sent_count > 0 && (
                      <Text size="xs" c="dimmed">
                        ({Math.round((campaign.clicked_count / campaign.sent_count) * 100) || 0}%)
                      </Text>
                    )}
                  </Group>
                </Table.Td>
                <Table.Td>
                  <Text size="sm">{formatDate(campaign.created_at)}</Text>
                </Table.Td>
                <Table.Td>
                  <Group gap="xs">
                    <Tooltip label="View details">
                      <ActionIcon variant="light" onClick={() => handleViewDetails(campaign)}>
                        <IconChartBar size={16} />
                      </ActionIcon>
                    </Tooltip>
                    {campaign.status === 'draft' && (
                      <>
                        <Tooltip label="Edit">
                          <ActionIcon variant="light" onClick={() => handleEditCampaign(campaign)}>
                            <IconEdit size={16} />
                          </ActionIcon>
                        </Tooltip>
                        <Tooltip label="Delete">
                          <ActionIcon variant="light" color="red" onClick={() => handleDeleteCampaign(campaign)}>
                            <IconTrash size={16} />
                          </ActionIcon>
                        </Tooltip>
                      </>
                    )}
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>

        {campaigns.length === 0 && (
          <Box p="xl" ta="center">
            <IconMail size={48} color="var(--mantine-color-dimmed)" style={{ marginBottom: 10 }} />
            <Text c="dimmed">No campaigns yet. Create your first campaign!</Text>
          </Box>
        )}
      </Paper>

      {/* Campaign Editor Modal */}
      <Modal
        opened={editorOpen}
        onClose={() => setEditorOpen(false)}
        title={
          <Group>
            <IconMail size={20} />
            <Text fw={600}>{editingCampaign ? 'Edit Campaign' : 'New Campaign'}</Text>
          </Group>
        }
        size="xl"
        scrollAreaComponent={ScrollArea.Autosize}
      >
        <Tabs defaultValue="content">
          <Tabs.List>
            <Tabs.Tab value="content" leftSection={<IconEdit size={14} />}>Content</Tabs.Tab>
            <Tabs.Tab value="audience" leftSection={<IconUsers size={14} />}>Audience</Tabs.Tab>
            <Tabs.Tab value="preview" leftSection={<IconEye size={14} />}>Preview</Tabs.Tab>
          </Tabs.List>

          {/* Content Tab */}
          <Tabs.Panel value="content" pt="md">
            <Stack gap="md">
              <TextInput
                label="Campaign Name"
                placeholder="e.g., January Newsletter"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />

              <Group grow>
                <Select
                  label="Campaign Type"
                  data={CAMPAIGN_TYPES}
                  value={formData.campaignType}
                  onChange={(value) => setFormData({ ...formData, campaignType: value })}
                />
                <Select
                  label="Audience"
                  data={AUDIENCE_TYPES}
                  value={formData.audienceType}
                  onChange={(value) => setFormData({ ...formData, audienceType: value })}
                />
              </Group>

              <Divider label="Email Details" />

              <TextInput
                label="Subject Line"
                placeholder="e.g., New Features in Tribos.Studio"
                value={formData.subject}
                onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                required
              />

              <Group grow>
                <TextInput
                  label="From Name"
                  value={formData.fromName}
                  onChange={(e) => setFormData({ ...formData, fromName: e.target.value })}
                />
                <TextInput
                  label="From Email"
                  value={formData.fromEmail}
                  onChange={(e) => setFormData({ ...formData, fromEmail: e.target.value })}
                />
                <TextInput
                  label="Reply To"
                  value={formData.replyTo}
                  onChange={(e) => setFormData({ ...formData, replyTo: e.target.value })}
                />
              </Group>

              <Textarea
                label="HTML Content"
                placeholder="Paste your HTML email content here..."
                value={formData.htmlContent}
                onChange={(e) => setFormData({ ...formData, htmlContent: e.target.value })}
                minRows={30}
                maxRows={50}
                autosize
                required
                styles={{ input: { fontFamily: 'monospace', fontSize: '12px' } }}
              />

              <Textarea
                label="Plain Text (optional)"
                placeholder="Optional plain text version..."
                value={formData.textContent}
                onChange={(e) => setFormData({ ...formData, textContent: e.target.value })}
                minRows={12}
                maxRows={30}
                autosize
              />
            </Stack>
          </Tabs.Panel>

          {/* Audience Tab */}
          <Tabs.Panel value="audience" pt="md">
            <Stack gap="md">
              <Alert icon={<IconFilter size={16} />} color="blue">
                Configure filters to target specific users. Leave empty to include all users in the selected audience.
              </Alert>

              {(formData.audienceType === 'users' || formData.audienceType === 'both') && (
                <>
                  <Text fw={600}>Registered Users Filters</Text>

                  <Switch
                    label="Email verified only"
                    checked={filterCriteria.emailVerified || false}
                    onChange={(e) => setFilterCriteria({
                      ...filterCriteria,
                      emailVerified: e.currentTarget.checked || undefined
                    })}
                  />

                  <Group grow>
                    <Select
                      label="Has activities"
                      data={[
                        { value: '', label: 'Any' },
                        { value: 'true', label: 'Yes - has activities' },
                        { value: 'false', label: 'No - no activities' }
                      ]}
                      value={filterCriteria.hasActivity === true ? 'true' : filterCriteria.hasActivity === false ? 'false' : ''}
                      onChange={(value) => setFilterCriteria({
                        ...filterCriteria,
                        hasActivity: value === 'true' ? true : value === 'false' ? false : undefined
                      })}
                      clearable
                    />
                    <NumberInput
                      label="Min activity count"
                      placeholder="e.g., 10"
                      value={filterCriteria.activityCountMin || ''}
                      onChange={(value) => setFilterCriteria({
                        ...filterCriteria,
                        activityCountMin: value || undefined
                      })}
                      min={0}
                    />
                  </Group>

                  <Group grow>
                    <Select
                      label="Has integration"
                      data={[
                        { value: '', label: 'Any' },
                        { value: 'true', label: 'Yes - has integration' },
                        { value: 'false', label: 'No - no integration' }
                      ]}
                      value={filterCriteria.hasIntegration === true ? 'true' : filterCriteria.hasIntegration === false ? 'false' : ''}
                      onChange={(value) => setFilterCriteria({
                        ...filterCriteria,
                        hasIntegration: value === 'true' ? true : value === 'false' ? false : undefined
                      })}
                      clearable
                    />
                    <Select
                      label="Specific integrations"
                      data={[
                        { value: 'strava', label: 'Strava' },
                        { value: 'garmin', label: 'Garmin' },
                        { value: 'wahoo', label: 'Wahoo' }
                      ]}
                      value={filterCriteria.integrations || []}
                      onChange={(value) => setFilterCriteria({
                        ...filterCriteria,
                        integrations: value?.length ? value : undefined
                      })}
                      multiple
                      clearable
                    />
                  </Group>

                  <NumberInput
                    label="Active in last X days"
                    placeholder="e.g., 30"
                    value={filterCriteria.lastSignInWithinDays || ''}
                    onChange={(value) => setFilterCriteria({
                      ...filterCriteria,
                      lastSignInWithinDays: value || undefined
                    })}
                    min={1}
                  />
                </>
              )}

              {(formData.audienceType === 'beta_signups' || formData.audienceType === 'both') && (
                <>
                  <Divider label="Beta Signups Filters" />

                  <Group grow>
                    <Select
                      label="Beta status"
                      data={[
                        { value: '', label: 'Any' },
                        { value: 'pending', label: 'Pending (not invited)' },
                        { value: 'invited', label: 'Invited' },
                        { value: 'activated', label: 'Activated' }
                      ]}
                      value={filterCriteria.betaStatus || ''}
                      onChange={(value) => setFilterCriteria({
                        ...filterCriteria,
                        betaStatus: value || undefined
                      })}
                      clearable
                    />
                    <Select
                      label="Wants notifications"
                      data={[
                        { value: '', label: 'Any' },
                        { value: 'true', label: 'Yes' },
                        { value: 'false', label: 'No' }
                      ]}
                      value={filterCriteria.wantsNotifications === true ? 'true' : filterCriteria.wantsNotifications === false ? 'false' : ''}
                      onChange={(value) => setFilterCriteria({
                        ...filterCriteria,
                        wantsNotifications: value === 'true' ? true : value === 'false' ? false : undefined
                      })}
                      clearable
                    />
                  </Group>
                </>
              )}

              <Divider />

              <Button
                leftSection={<IconUsers size={16} />}
                variant="light"
                onClick={handlePreviewRecipients}
                loading={previewLoading}
              >
                Preview Recipients
              </Button>
            </Stack>
          </Tabs.Panel>

          {/* Preview Tab */}
          <Tabs.Panel value="preview" pt="md">
            <Stack gap="md">
              <Alert icon={<IconEye size={16} />} color="blue">
                Preview how your email will look and send a test to yourself.
              </Alert>

              <Paper withBorder p="md">
                <Text fw={600} mb="xs">Subject: {formData.subject || '(no subject)'}</Text>
                <Text size="sm" c="dimmed" mb="md">
                  From: {formData.fromName} &lt;{formData.fromEmail}&gt;
                </Text>
                <Box
                  style={{
                    border: '1px solid var(--mantine-color-default-border)',
                    borderRadius: 8,
                    overflow: 'hidden',
                    maxHeight: 400
                  }}
                >
                  <iframe
                    srcDoc={formData.htmlContent}
                    style={{ width: '100%', height: 400, border: 'none' }}
                    title="Email Preview"
                  />
                </Box>
              </Paper>

              <Button
                leftSection={<IconTestPipe size={16} />}
                variant="light"
                onClick={handleSendTest}
                loading={sendingTest}
              >
                Send Test Email to Me
              </Button>
            </Stack>
          </Tabs.Panel>
        </Tabs>

        <Divider my="md" />

        {/* Action Buttons */}
        <Group justify="space-between">
          <Button variant="light" onClick={() => setEditorOpen(false)}>
            Cancel
          </Button>
          <Group>
            <Button
              onClick={handleSaveCampaign}
              loading={saving}
            >
              {editingCampaign ? 'Save Changes' : 'Create Campaign'}
            </Button>
            {editingCampaign && editingCampaign.status === 'draft' && (
              <Button
                color="green"
                leftSection={<IconSend size={16} />}
                onClick={() => setConfirmSend(true)}
              >
                Send Campaign
              </Button>
            )}
          </Group>
        </Group>
      </Modal>

      {/* Recipients Preview Modal */}
      <Modal
        opened={previewOpen}
        onClose={() => setPreviewOpen(false)}
        title={
          <Group>
            <IconUsers size={20} />
            <Text fw={600}>Recipients Preview ({previewTotal} total)</Text>
          </Group>
        }
        size="lg"
      >
        <Stack gap="md">
          <Alert color={previewTotal > 0 ? 'green' : 'yellow'}>
            {previewTotal > 0
              ? `${previewTotal} recipients match your criteria. Showing first 100.`
              : 'No recipients match the current filter criteria.'}
          </Alert>

          {previewRecipientsList.length > 0 && (
            <Table striped>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Email</Table.Th>
                  <Table.Th>Name</Table.Th>
                  <Table.Th>Source</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {previewRecipientsList.map((r, i) => (
                  <Table.Tr key={i}>
                    <Table.Td>{r.email}</Table.Td>
                    <Table.Td>{r.name || '-'}</Table.Td>
                    <Table.Td>
                      <Badge size="sm" variant="light">
                        {r.source}
                      </Badge>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}

          <Button onClick={() => setPreviewOpen(false)}>Close</Button>
        </Stack>
      </Modal>

      {/* Send Confirmation Modal */}
      <Modal
        opened={confirmSend}
        onClose={() => setConfirmSend(false)}
        title={
          <Group>
            <IconAlertTriangle size={20} color="var(--mantine-color-yellow-6)" />
            <Text fw={600}>Confirm Send Campaign</Text>
          </Group>
        }
        size="md"
      >
        <Stack gap="md">
          <Alert color="yellow" icon={<IconAlertTriangle size={16} />}>
            <Text fw={600}>Are you sure you want to send this campaign?</Text>
            <Text size="sm" mt="xs">
              This will send emails to all recipients matching your filter criteria. This action cannot be undone.
            </Text>
          </Alert>

          <Paper withBorder p="md">
            <Stack gap="xs">
              <Group justify="space-between">
                <Text c="dimmed">Campaign</Text>
                <Text fw={500}>{editingCampaign?.name}</Text>
              </Group>
              <Group justify="space-between">
                <Text c="dimmed">Subject</Text>
                <Text fw={500}>{formData.subject}</Text>
              </Group>
              <Group justify="space-between">
                <Text c="dimmed">Audience</Text>
                <Badge>{formData.audienceType}</Badge>
              </Group>
            </Stack>
          </Paper>

          <Group justify="flex-end">
            <Button variant="light" onClick={() => setConfirmSend(false)}>
              Cancel
            </Button>
            <Button
              color="green"
              leftSection={<IconSend size={16} />}
              onClick={handleSendCampaign}
              loading={sendingCampaign}
            >
              Yes, Send Campaign
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Campaign Details Modal */}
      <Modal
        opened={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        title={
          <Group>
            <IconChartBar size={20} />
            <Text fw={600}>Campaign Details</Text>
          </Group>
        }
        size="xl"
      >
        {detailsLoading ? (
          <Stack align="center" py="xl">
            <Loader />
            <Text c="dimmed">Loading details...</Text>
          </Stack>
        ) : selectedCampaign ? (
          <Stack gap="md">
            {/* Campaign Info */}
            <Paper withBorder p="md">
              <Group justify="space-between" mb="md">
                <div>
                  <Text fw={600} size="lg">{selectedCampaign.name}</Text>
                  <Text size="sm" c="dimmed">{selectedCampaign.subject}</Text>
                </div>
                <Badge size="lg" color={getStatusColor(selectedCampaign.status)}>
                  {selectedCampaign.status}
                </Badge>
              </Group>

              <SimpleGrid cols={4}>
                <Card withBorder p="sm">
                  <Group gap="xs">
                    <IconUsers size={20} color="var(--mantine-color-blue-6)" />
                    <div>
                      <Text size="lg" fw={700}>{selectedCampaign.total_recipients || 0}</Text>
                      <Text size="xs" c="dimmed">Recipients</Text>
                    </div>
                  </Group>
                </Card>
                <Card withBorder p="sm">
                  <Group gap="xs">
                    <IconMail size={20} color="var(--mantine-color-green-6)" />
                    <div>
                      <Text size="lg" fw={700}>{selectedCampaign.sent_count || 0}</Text>
                      <Text size="xs" c="dimmed">Sent</Text>
                    </div>
                  </Group>
                </Card>
                <Card withBorder p="sm">
                  <Group gap="xs">
                    <IconMailOpened size={20} color="var(--mantine-color-violet-6)" />
                    <div>
                      <Text size="lg" fw={700}>
                        {selectedCampaign.opened_count || 0}
                        {selectedCampaign.sent_count > 0 && (
                          <Text span size="sm" c="dimmed" ml={4}>
                            ({Math.round((selectedCampaign.opened_count / selectedCampaign.sent_count) * 100)}%)
                          </Text>
                        )}
                      </Text>
                      <Text size="xs" c="dimmed">Opened</Text>
                    </div>
                  </Group>
                </Card>
                <Card withBorder p="sm">
                  <Group gap="xs">
                    <IconClick size={20} color="var(--mantine-color-orange-6)" />
                    <div>
                      <Text size="lg" fw={700}>
                        {selectedCampaign.clicked_count || 0}
                        {selectedCampaign.sent_count > 0 && (
                          <Text span size="sm" c="dimmed" ml={4}>
                            ({Math.round((selectedCampaign.clicked_count / selectedCampaign.sent_count) * 100)}%)
                          </Text>
                        )}
                      </Text>
                      <Text size="xs" c="dimmed">Clicked</Text>
                    </div>
                  </Group>
                </Card>
              </SimpleGrid>

              {(selectedCampaign.bounced_count > 0 || selectedCampaign.complained_count > 0 || selectedCampaign.failed_count > 0) && (
                <Group mt="md">
                  {selectedCampaign.bounced_count > 0 && (
                    <Badge color="red" variant="light">
                      {selectedCampaign.bounced_count} bounced
                    </Badge>
                  )}
                  {selectedCampaign.complained_count > 0 && (
                    <Badge color="red" variant="light">
                      {selectedCampaign.complained_count} spam complaints
                    </Badge>
                  )}
                  {selectedCampaign.failed_count > 0 && (
                    <Badge color="red" variant="light">
                      {selectedCampaign.failed_count} failed
                    </Badge>
                  )}
                </Group>
              )}
            </Paper>

            {/* Recipients Table */}
            {campaignRecipients.length > 0 && (
              <Paper withBorder>
                <Text fw={600} p="md" pb={0}>Recipients</Text>
                <Table striped>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Email</Table.Th>
                      <Table.Th>Status</Table.Th>
                      <Table.Th>Sent</Table.Th>
                      <Table.Th>Opened</Table.Th>
                      <Table.Th>Clicks</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {campaignRecipients.slice(0, 50).map((r) => (
                      <Table.Tr key={r.id}>
                        <Table.Td>{r.email}</Table.Td>
                        <Table.Td>
                          <Badge
                            size="sm"
                            color={
                              r.status === 'clicked' || r.status === 'opened' ? 'green' :
                              r.status === 'delivered' || r.status === 'sent' ? 'blue' :
                              r.status === 'bounced' || r.status === 'complained' || r.status === 'failed' ? 'red' :
                              'gray'
                            }
                          >
                            {r.status}
                          </Badge>
                        </Table.Td>
                        <Table.Td>{formatDate(r.sent_at)}</Table.Td>
                        <Table.Td>
                          {r.first_opened_at ? (
                            <Group gap={4}>
                              <IconCheck size={14} color="var(--mantine-color-green-6)" />
                              <Text size="sm">{r.open_count}x</Text>
                            </Group>
                          ) : (
                            <IconX size={14} color="var(--mantine-color-gray-5)" />
                          )}
                        </Table.Td>
                        <Table.Td>
                          {r.first_clicked_at ? (
                            <Group gap={4}>
                              <IconCheck size={14} color="var(--mantine-color-green-6)" />
                              <Text size="sm">{r.click_count}x</Text>
                            </Group>
                          ) : (
                            <IconX size={14} color="var(--mantine-color-gray-5)" />
                          )}
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
                {campaignRecipients.length > 50 && (
                  <Text size="sm" c="dimmed" ta="center" py="sm">
                    Showing first 50 of {campaignRecipients.length} recipients
                  </Text>
                )}
              </Paper>
            )}

            <Button onClick={() => setDetailsOpen(false)}>Close</Button>
          </Stack>
        ) : null}
      </Modal>
    </Stack>
  );
}
