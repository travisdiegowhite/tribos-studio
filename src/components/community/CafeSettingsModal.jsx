/**
 * CafeSettingsModal
 * Settings modal for cafe management - admin and member options
 */

import { useState, useEffect } from 'react';
import {
  Modal,
  Tabs,
  Stack,
  Group,
  Text,
  TextInput,
  Textarea,
  Select,
  NumberInput,
  Switch,
  Button,
  Card,
  Avatar,
  Badge,
  ActionIcon,
  Divider,
  Alert,
  Box,
  Loader,
  Menu,
} from '@mantine/core';
import {
  IconSettings,
  IconUsers,
  IconDoorExit,
  IconTrash,
  IconCrown,
  IconUser,
  IconDotsVertical,
  IconAlertTriangle,
  IconCheck,
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { tokens } from '../../theme';

const GOAL_OPTIONS = [
  { value: 'general_fitness', label: 'General Fitness' },
  { value: 'century', label: 'Century / Long Distance' },
  { value: 'gran_fondo', label: 'Gran Fondo' },
  { value: 'racing', label: 'Racing / Competitive' },
  { value: 'gravel', label: 'Gravel / Adventure' },
  { value: 'climbing', label: 'Climbing Focused' },
  { value: 'time_crunched', label: 'Time Crunched' },
  { value: 'comeback', label: 'Comeback / Recovery' },
  { value: 'weight_loss', label: 'Weight Loss' },
  { value: 'social', label: 'Social / Fun' },
];

const EXPERIENCE_OPTIONS = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
  { value: 'mixed', label: 'Mixed Levels' },
];

const CHECKIN_DAY_OPTIONS = [
  { value: '0', label: 'Sunday' },
  { value: '1', label: 'Monday' },
  { value: '2', label: 'Tuesday' },
  { value: '3', label: 'Wednesday' },
  { value: '4', label: 'Thursday' },
  { value: '5', label: 'Friday' },
  { value: '6', label: 'Saturday' },
];

export default function CafeSettingsModal({
  opened,
  onClose,
  cafe,
  isAdmin,
  currentUserId,
  onUpdateCafe,
  onDeleteCafe,
  onLeaveCafe,
  onLoadMembers,
  onRemoveMember,
  onUpdateMemberRole,
}) {
  const [activeTab, setActiveTab] = useState('settings');
  const [members, setMembers] = useState([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [leaveConfirm, setLeaveConfirm] = useState(false);

  // Form state for cafe settings
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    goal_type: 'general_fitness',
    experience_level: 'mixed',
    checkin_day: '0',
    max_members: 8,
    is_public: true,
    is_open: true,
  });

  // Initialize form data when cafe changes
  useEffect(() => {
    if (cafe?.cafe) {
      setFormData({
        name: cafe.cafe.name || '',
        description: cafe.cafe.description || '',
        goal_type: cafe.cafe.goal_type || 'general_fitness',
        experience_level: cafe.cafe.experience_level || 'mixed',
        checkin_day: String(cafe.cafe.checkin_day ?? 0),
        max_members: cafe.cafe.max_members || 8,
        is_public: cafe.cafe.is_public ?? true,
        is_open: cafe.cafe.is_open ?? true,
      });
    }
  }, [cafe]);

  // Load members when members tab is selected
  useEffect(() => {
    if (activeTab === 'members' && cafe?.cafe_id && onLoadMembers) {
      loadMembers();
    }
  }, [activeTab, cafe?.cafe_id]);

  const loadMembers = async () => {
    setMembersLoading(true);
    try {
      const memberList = await onLoadMembers(cafe.cafe_id);
      setMembers(memberList);
    } catch (err) {
      console.error('Error loading members:', err);
    } finally {
      setMembersLoading(false);
    }
  };

  const handleSave = async () => {
    if (!cafe?.cafe_id) return;

    setSaving(true);
    try {
      const success = await onUpdateCafe(cafe.cafe_id, {
        name: formData.name,
        description: formData.description || null,
        goal_type: formData.goal_type,
        experience_level: formData.experience_level,
        checkin_day: parseInt(formData.checkin_day),
        max_members: formData.max_members,
        is_public: formData.is_public,
        is_open: formData.is_open,
      });

      if (success) {
        notifications.show({
          title: 'Settings saved',
          message: 'Cafe settings have been updated',
          color: 'sage',
          icon: <IconCheck size={16} />,
        });
        onClose();
      }
    } catch (err) {
      notifications.show({
        title: 'Error',
        message: 'Failed to save settings',
        color: 'red',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!cafe?.cafe_id) return;

    setSaving(true);
    try {
      const success = await onDeleteCafe(cafe.cafe_id);
      if (success) {
        notifications.show({
          title: 'Cafe deleted',
          message: 'The cafe has been permanently deleted',
          color: 'gold',
        });
        onClose();
      }
    } catch (err) {
      notifications.show({
        title: 'Error',
        message: 'Failed to delete cafe',
        color: 'red',
      });
    } finally {
      setSaving(false);
      setDeleteConfirm(false);
    }
  };

  const handleLeave = async () => {
    if (!cafe?.cafe_id) return;

    setSaving(true);
    try {
      const success = await onLeaveCafe(cafe.cafe_id);
      if (success) {
        notifications.show({
          title: 'Left cafe',
          message: 'You have left the cafe',
          color: 'teal',
        });
        onClose();
      }
    } catch (err) {
      notifications.show({
        title: 'Error',
        message: 'Failed to leave cafe',
        color: 'red',
      });
    } finally {
      setSaving(false);
      setLeaveConfirm(false);
    }
  };

  const handleRemoveMember = async (memberUserId) => {
    if (!cafe?.cafe_id) return;

    try {
      const success = await onRemoveMember(cafe.cafe_id, memberUserId);
      if (success) {
        notifications.show({
          title: 'Member removed',
          message: 'The member has been removed from the cafe',
          color: 'gold',
        });
        loadMembers(); // Reload members list
      }
    } catch (err) {
      notifications.show({
        title: 'Error',
        message: 'Failed to remove member',
        color: 'red',
      });
    }
  };

  const handleUpdateRole = async (memberUserId, newRole) => {
    if (!cafe?.cafe_id) return;

    try {
      const success = await onUpdateMemberRole(cafe.cafe_id, memberUserId, newRole);
      if (success) {
        notifications.show({
          title: 'Role updated',
          message: `Member has been ${newRole === 'admin' ? 'promoted to admin' : 'changed to member'}`,
          color: 'sage',
        });
        loadMembers(); // Reload members list
      }
    } catch (err) {
      notifications.show({
        title: 'Error',
        message: 'Failed to update role',
        color: 'red',
      });
    }
  };

  const getMemberDisplayName = (member) => {
    return member.user_profile?.community_display_name ||
           member.user_profile?.display_name ||
           'Anonymous';
  };

  const adminCount = members.filter(m => m.role === 'admin').length;

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Cafe Settings"
      size="lg"
      styles={{
        header: {
          backgroundColor: 'var(--tribos-bg-secondary)',
        },
        content: {
          backgroundColor: 'var(--tribos-bg-secondary)',
        },
        title: {
          color: 'var(--tribos-text-primary)',
          fontWeight: 600,
        },
      }}
    >
      <Tabs value={activeTab} onChange={setActiveTab}>
        <Tabs.List>
          {isAdmin && (
            <Tabs.Tab value="settings" leftSection={<IconSettings size={14} />}>
              Settings
            </Tabs.Tab>
          )}
          {isAdmin && (
            <Tabs.Tab value="members" leftSection={<IconUsers size={14} />}>
              Members
            </Tabs.Tab>
          )}
          <Tabs.Tab value="leave" leftSection={<IconDoorExit size={14} />}>
            {isAdmin ? 'Danger Zone' : 'Leave'}
          </Tabs.Tab>
        </Tabs.List>

        {/* Settings Tab (Admin Only) */}
        {isAdmin && (
          <Tabs.Panel value="settings" pt="md">
            <Stack gap="md">
              <TextInput
                label="Cafe Name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                maxLength={50}
                styles={{
                  input: { backgroundColor: 'var(--tribos-bg-tertiary)' },
                }}
              />

              <Textarea
                label="Description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                maxLength={300}
                autosize
                minRows={2}
                styles={{
                  input: { backgroundColor: 'var(--tribos-bg-tertiary)' },
                }}
              />

              <Group grow>
                <Select
                  label="Primary Goal"
                  value={formData.goal_type}
                  onChange={(val) => setFormData({ ...formData, goal_type: val })}
                  data={GOAL_OPTIONS}
                  styles={{
                    input: { backgroundColor: 'var(--tribos-bg-tertiary)' },
                  }}
                />

                <Select
                  label="Experience Level"
                  value={formData.experience_level}
                  onChange={(val) => setFormData({ ...formData, experience_level: val })}
                  data={EXPERIENCE_OPTIONS}
                  styles={{
                    input: { backgroundColor: 'var(--tribos-bg-tertiary)' },
                  }}
                />
              </Group>

              <Group grow>
                <Select
                  label="Check-in Day"
                  description="Day of the week for weekly check-ins"
                  value={formData.checkin_day}
                  onChange={(val) => setFormData({ ...formData, checkin_day: val })}
                  data={CHECKIN_DAY_OPTIONS}
                  styles={{
                    input: { backgroundColor: 'var(--tribos-bg-tertiary)' },
                  }}
                />

                <NumberInput
                  label="Max Members"
                  value={formData.max_members}
                  onChange={(val) => setFormData({ ...formData, max_members: val })}
                  min={3}
                  max={12}
                  styles={{
                    input: { backgroundColor: 'var(--tribos-bg-tertiary)' },
                  }}
                />
              </Group>

              <Divider my="sm" />

              <Switch
                label="Public Cafe"
                description="Allow this cafe to appear in search results"
                checked={formData.is_public}
                onChange={(e) => setFormData({ ...formData, is_public: e.currentTarget.checked })}
                color="terracotta"
              />

              <Switch
                label="Open to New Members"
                description="Allow new members to join without an invite"
                checked={formData.is_open}
                onChange={(e) => setFormData({ ...formData, is_open: e.currentTarget.checked })}
                color="terracotta"
              />

              <Group justify="flex-end" mt="md">
                <Button variant="subtle" onClick={onClose}>
                  Cancel
                </Button>
                <Button
                  onClick={handleSave}
                  loading={saving}
                  style={{
                    backgroundColor: 'var(--tribos-terracotta-500)',
                    color: 'var(--tribos-bg-primary)',
                  }}
                >
                  Save Changes
                </Button>
              </Group>
            </Stack>
          </Tabs.Panel>
        )}

        {/* Members Tab (Admin Only) */}
        {isAdmin && (
          <Tabs.Panel value="members" pt="md">
            <Stack gap="md">
              <Text size="sm" c="dimmed">
                Manage cafe members. Admins can remove members or change roles.
              </Text>

              {membersLoading ? (
                <Box py="xl" style={{ textAlign: 'center' }}>
                  <Loader size="sm" />
                </Box>
              ) : (
                <Stack gap="xs">
                  {members.map((member) => (
                    <Card
                      key={member.id}
                      padding="sm"
                      radius="md"
                      style={{
                        backgroundColor: 'var(--tribos-bg-tertiary)',
                      }}
                    >
                      <Group justify="space-between">
                        <Group>
                          <Avatar
                            src={member.user_profile?.avatar_url}
                            size="sm"
                            radius="xl"
                          >
                            {getMemberDisplayName(member).charAt(0).toUpperCase()}
                          </Avatar>
                          <Box>
                            <Group gap="xs">
                              <Text size="sm" fw={500} style={{ color: 'var(--tribos-text-primary)' }}>
                                {getMemberDisplayName(member)}
                              </Text>
                              {member.role === 'admin' && (
                                <Badge size="xs" color="gold" variant="light" leftSection={<IconCrown size={10} />}>
                                  Admin
                                </Badge>
                              )}
                              {member.user_id === currentUserId && (
                                <Badge size="xs" color="teal" variant="light">
                                  You
                                </Badge>
                              )}
                            </Group>
                            <Text size="xs" c="dimmed">
                              Joined {new Date(member.joined_at).toLocaleDateString()}
                            </Text>
                          </Box>
                        </Group>

                        {/* Don't show actions for self */}
                        {member.user_id !== currentUserId && (
                          <Menu position="bottom-end" withinPortal>
                            <Menu.Target>
                              <ActionIcon variant="subtle" color="gray">
                                <IconDotsVertical size={16} />
                              </ActionIcon>
                            </Menu.Target>
                            <Menu.Dropdown>
                              {member.role === 'member' ? (
                                <Menu.Item
                                  leftSection={<IconCrown size={14} />}
                                  onClick={() => handleUpdateRole(member.user_id, 'admin')}
                                >
                                  Promote to Admin
                                </Menu.Item>
                              ) : (
                                <Menu.Item
                                  leftSection={<IconUser size={14} />}
                                  onClick={() => handleUpdateRole(member.user_id, 'member')}
                                  disabled={adminCount <= 1}
                                >
                                  Remove Admin Role
                                </Menu.Item>
                              )}
                              <Menu.Divider />
                              <Menu.Item
                                leftSection={<IconTrash size={14} />}
                                color="red"
                                onClick={() => handleRemoveMember(member.user_id)}
                              >
                                Remove from Cafe
                              </Menu.Item>
                            </Menu.Dropdown>
                          </Menu>
                        )}
                      </Group>
                    </Card>
                  ))}
                </Stack>
              )}
            </Stack>
          </Tabs.Panel>
        )}

        {/* Leave / Danger Zone Tab */}
        <Tabs.Panel value="leave" pt="md">
          <Stack gap="lg">
            {/* Leave Cafe (for all members) */}
            <Card
              padding="md"
              radius="md"
              style={{
                backgroundColor: 'var(--tribos-bg-tertiary)',
                border: '1px solid rgba(196, 120, 92, 0.3)',
              }}
            >
              <Stack gap="sm">
                <Group>
                  <IconDoorExit size={20} color={'var(--tribos-text-muted)'} />
                  <Text fw={500} style={{ color: 'var(--tribos-text-primary)' }}>
                    Leave Cafe
                  </Text>
                </Group>
                <Text size="sm" c="dimmed">
                  You will no longer be a member of this cafe and won't see check-ins or discussions.
                  {isAdmin && adminCount <= 1 && (
                    <Text component="span" c="red" inherit>
                      {' '}Warning: You are the only admin. Leaving will delete the cafe.
                    </Text>
                  )}
                </Text>

                {leaveConfirm ? (
                  <Group>
                    <Button
                      variant="subtle"
                      size="sm"
                      onClick={() => setLeaveConfirm(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      color="red"
                      size="sm"
                      onClick={handleLeave}
                      loading={saving}
                    >
                      Yes, Leave Cafe
                    </Button>
                  </Group>
                ) : (
                  <Button
                    variant="outline"
                    color="red"
                    size="sm"
                    onClick={() => setLeaveConfirm(true)}
                    style={{ alignSelf: 'flex-start' }}
                  >
                    Leave Cafe
                  </Button>
                )}
              </Stack>
            </Card>

            {/* Delete Cafe (Admin only) */}
            {isAdmin && (
              <Card
                padding="md"
                radius="md"
                style={{
                  backgroundColor: 'var(--tribos-bg-tertiary)',
                  border: '1px solid rgba(196, 120, 92, 0.5)',
                }}
              >
                <Stack gap="sm">
                  <Group>
                    <IconTrash size={20} color="#C4785C" />
                    <Text fw={500} c="red">
                      Delete Cafe
                    </Text>
                  </Group>
                  <Text size="sm" c="dimmed">
                    Permanently delete this cafe and all its data. This cannot be undone.
                    All members will be removed and all check-ins and discussions will be deleted.
                  </Text>

                  {deleteConfirm ? (
                    <Alert
                      icon={<IconAlertTriangle size={16} />}
                      color="red"
                      variant="light"
                    >
                      <Stack gap="sm">
                        <Text size="sm">
                          Are you absolutely sure? Type the cafe name to confirm: <strong>{cafe?.cafe?.name}</strong>
                        </Text>
                        <TextInput
                          placeholder="Type cafe name to confirm"
                          size="sm"
                          id="delete-confirm-input"
                        />
                        <Group>
                          <Button
                            variant="subtle"
                            size="sm"
                            onClick={() => setDeleteConfirm(false)}
                          >
                            Cancel
                          </Button>
                          <Button
                            color="red"
                            size="sm"
                            onClick={() => {
                              const input = document.getElementById('delete-confirm-input');
                              if (input?.value === cafe?.cafe?.name) {
                                handleDelete();
                              } else {
                                notifications.show({
                                  title: 'Name mismatch',
                                  message: 'Please type the exact cafe name to confirm deletion',
                                  color: 'red',
                                });
                              }
                            }}
                            loading={saving}
                          >
                            Delete Forever
                          </Button>
                        </Group>
                      </Stack>
                    </Alert>
                  ) : (
                    <Button
                      variant="filled"
                      color="red"
                      size="sm"
                      onClick={() => setDeleteConfirm(true)}
                      style={{ alignSelf: 'flex-start' }}
                    >
                      Delete Cafe
                    </Button>
                  )}
                </Stack>
              </Card>
            )}
          </Stack>
        </Tabs.Panel>
      </Tabs>
    </Modal>
  );
}
