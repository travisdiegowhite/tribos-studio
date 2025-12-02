// ShareRouteDialog Component
// Privacy-first route sharing with explicit permission levels

import React, { useState, useEffect } from 'react';
import {
  Modal,
  Stack,
  Text,
  Radio,
  Group,
  Button,
  TextInput,
  Textarea,
  TagsInput,
  Select,
  Switch,
  Alert,
  Code,
  CopyButton,
  ActionIcon,
  Tooltip,
  Paper,
  Badge,
  Divider
} from '@mantine/core';
import {
  Lock,
  Link as LinkIcon,
  Users,
  MapPin,
  Globe,
  Copy,
  Check,
  Shield,
  AlertTriangle,
  Clock
} from 'lucide-react';
import { notifications } from '@mantine/notifications';
import { shareRoute, unshareRoute, SharingLevels } from '../utils/routeSharing';

const ShareRouteDialog = ({ opened, onClose, route, currentSharingLevel = null }) => {
  const [sharingLevel, setSharingLevel] = useState(currentSharingLevel || SharingLevels.PRIVATE);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState([]);
  const [obscureStartEnd, setObscureStartEnd] = useState(true);
  const [expiresInDays, setExpiresInDays] = useState(null);
  const [shareUrl, setShareUrl] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (route) {
      setTitle(route.name || '');
      if (currentSharingLevel) {
        setSharingLevel(currentSharingLevel);
      }
    }
  }, [route, currentSharingLevel]);

  const handleShare = async () => {
    setLoading(true);
    try {
      const result = await shareRoute(route.id, {
        sharingLevel,
        title: title.trim() || route.name,
        description: description.trim() || null,
        tags,
        expiresInDays: expiresInDays ? parseInt(expiresInDays) : null,
        obscureStartEnd
      });

      if (result.success) {
        notifications.show({
          title: 'Success',
          message: 'Route sharing settings updated',
          color: 'green'
        });

        if (result.shareUrl) {
          setShareUrl(result.shareUrl);
        }

        // Don't close immediately if link-only, show the URL
        if (sharingLevel !== SharingLevels.LINK_ONLY) {
          onClose();
        }
      } else {
        notifications.show({
          title: 'Error',
          message: result.error,
          color: 'red'
        });
      }
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'Failed to share route',
        color: 'red'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleUnshare = async () => {
    setLoading(true);
    try {
      const result = await unshareRoute(route.id);
      if (result.success) {
        notifications.show({
          title: 'Success',
          message: 'Route is now private',
          color: 'green'
        });
        onClose();
      } else {
        notifications.show({
          title: 'Error',
          message: result.error,
          color: 'red'
        });
      }
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'Failed to unshare route',
        color: 'red'
      });
    } finally {
      setLoading(false);
    }
  };

  const getSharingLevelInfo = () => {
    switch (sharingLevel) {
      case SharingLevels.PRIVATE:
        return {
          icon: <Lock size={20} />,
          color: 'gray',
          description: 'Only you can see this route'
        };
      case SharingLevels.LINK_ONLY:
        return {
          icon: <LinkIcon size={20} />,
          color: 'blue',
          description: 'Anyone with the link can view this route'
        };
      case SharingLevels.FRIENDS:
        return {
          icon: <Users size={20} />,
          color: 'green',
          description: 'Your connections can discover and view this route'
        };
      case SharingLevels.LOCAL:
        return {
          icon: <MapPin size={20} />,
          color: 'teal',
          description: 'Riders in your area can discover this route'
        };
      case SharingLevels.PUBLIC:
        return {
          icon: <Globe size={20} />,
          color: 'violet',
          description: 'Anyone can discover and view this route'
        };
      default:
        return { icon: null, color: 'gray', description: '' };
    }
  };

  const levelInfo = getSharingLevelInfo();

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Share Route"
      size="lg"
    >
      <Stack spacing="md">
        <Alert icon={<Shield size={16} />} color="blue" variant="light">
          <Text size="sm">
            Your privacy is important. Start/end points are automatically obscured by default.
          </Text>
        </Alert>

        <Paper p="md" withBorder style={{ backgroundColor: 'var(--mantine-color-gray-0)' }}>
          <Group mb="sm">
            {levelInfo.icon}
            <div style={{ flex: 1 }}>
              <Text weight={500}>Privacy Level</Text>
              <Text size="sm" c="dimmed">{levelInfo.description}</Text>
            </div>
          </Group>

          <Radio.Group value={sharingLevel} onChange={setSharingLevel}>
            <Stack spacing="xs">
              <Radio
                value={SharingLevels.PRIVATE}
                label="Private"
                description="Only you (default)"
              />
              <Radio
                value={SharingLevels.LINK_ONLY}
                label="Share with link"
                description="Anyone with the link"
              />
              <Radio
                value={SharingLevels.FRIENDS}
                label="Friends only"
                description="Your connections"
              />
              <Radio
                value={SharingLevels.LOCAL}
                label="Local riders"
                description="People in your area"
              />
              <Radio
                value={SharingLevels.PUBLIC}
                label="Public"
                description="Everyone on BaseMiles"
              />
            </Stack>
          </Radio.Group>
        </Paper>

        {sharingLevel !== SharingLevels.PRIVATE && (
          <>
            <Divider />

            <TextInput
              label="Title (optional)"
              placeholder={route?.name || 'Route name'}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              description="Give your route a memorable name"
            />

            <Textarea
              label="Description (optional)"
              placeholder="Share what makes this route special..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              minRows={3}
              maxLength={500}
              description="Help others understand what to expect"
            />

            <TagsInput
              label="Tags (optional)"
              placeholder="Add tags"
              value={tags}
              onChange={setTags}
              description="E.g., scenic, quiet, gravel, coffee-stops"
            />

            <Switch
              label="Obscure start and end points"
              description="First and last 500m will be hidden to protect your home/work location"
              checked={obscureStartEnd}
              onChange={(e) => setObscureStartEnd(e.currentTarget.checked)}
            />

            <Select
              label="Link expiration (optional)"
              placeholder="Never expires"
              value={expiresInDays}
              onChange={setExpiresInDays}
              data={[
                { value: '1', label: '1 day' },
                { value: '7', label: '1 week' },
                { value: '30', label: '1 month' },
                { value: '90', label: '3 months' }
              ]}
              clearable
              description="Automatically unshare after this period"
              leftSection={<Clock size={16} />}
            />

            {obscureStartEnd && (
              <Alert icon={<Shield size={16} />} color="yellow" variant="light">
                <Text size="xs">
                  Privacy protection: Your home and work locations will be automatically obscured
                </Text>
              </Alert>
            )}
          </>
        )}

        {shareUrl && sharingLevel === SharingLevels.LINK_ONLY && (
          <>
            <Divider />
            <Paper p="md" withBorder>
              <Stack spacing="xs">
                <Text size="sm" weight={500}>Share this link:</Text>
                <Group>
                  <Code style={{ flex: 1, wordBreak: 'break-all' }}>{shareUrl}</Code>
                  <CopyButton value={shareUrl} timeout={2000}>
                    {({ copied, copy }) => (
                      <Tooltip label={copied ? 'Copied!' : 'Copy link'}>
                        <ActionIcon
                          color={copied ? 'teal' : 'blue'}
                          onClick={() => {
                            copy();
                            notifications.show({
                              message: 'Share link copied to clipboard',
                              color: 'green',
                              autoClose: 2000
                            });
                          }}
                        >
                          {copied ? <Check size={16} /> : <Copy size={16} />}
                        </ActionIcon>
                      </Tooltip>
                    )}
                  </CopyButton>
                </Group>
              </Stack>
            </Paper>
          </>
        )}

        <Group position="apart" mt="md">
          <div>
            {currentSharingLevel && currentSharingLevel !== SharingLevels.PRIVATE && (
              <Button
                variant="subtle"
                color="red"
                onClick={handleUnshare}
                loading={loading}
              >
                Make Private
              </Button>
            )}
          </div>
          <Group>
            <Button variant="subtle" onClick={onClose}>Cancel</Button>
            <Button onClick={handleShare} loading={loading}>
              {sharingLevel === SharingLevels.PRIVATE ? 'Save' : 'Share Route'}
            </Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
};

export default ShareRouteDialog;
