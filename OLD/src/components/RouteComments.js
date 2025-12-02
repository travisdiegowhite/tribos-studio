// RouteComments Component
// Practical, utility-focused comments about routes

import React, { useState, useEffect } from 'react';
import {
  Stack,
  Paper,
  Text,
  Badge,
  Group,
  Button,
  Textarea,
  Select,
  Card,
  Avatar,
  ActionIcon,
  Modal,
  SegmentedControl,
  Tooltip,
  Divider,
  Box,
  Alert
} from '@mantine/core';
import {
  MessageCircle,
  AlertTriangle,
  Lightbulb,
  MapPin,
  Coffee,
  ThumbsUp,
  Flag,
  Edit,
  Trash,
  Plus,
  CheckCircle,
  Clock,
  Users
} from 'lucide-react';
import { notifications } from '@mantine/notifications';
import { supabase } from '../supabase';
import {
  getRouteComments,
  addRouteComment,
  verifyComment,
  deleteComment,
  flagComment,
  getCommentStats
} from '../utils/routeComments';
import { CommentTypes } from '../utils/routeSharing';

const RouteComments = ({ routeId }) => {
  const [comments, setComments] = useState({ all: [], grouped: {} });
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [commentFilter, setCommentFilter] = useState('all');
  const [addModalOpen, setAddModalOpen] = useState(false);

  useEffect(() => {
    if (routeId) {
      loadComments();
      loadStats();
    }
  }, [routeId]);

  const loadComments = async () => {
    setLoading(true);
    try {
      const result = await getRouteComments(routeId);
      if (result.success) {
        setComments({
          all: result.comments,
          grouped: result.grouped
        });
      }
    } catch (error) {
      console.error('Error loading comments:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    const result = await getCommentStats(routeId);
    if (result.success) {
      setStats(result.stats);
    }
  };

  const handleAddComment = async (commentData) => {
    const result = await addRouteComment(routeId, commentData);
    if (result.success) {
      notifications.show({
        title: 'Success',
        message: 'Comment added successfully',
        color: 'green'
      });
      loadComments();
      loadStats();
      setAddModalOpen(false);
    } else {
      notifications.show({
        title: 'Error',
        message: result.error,
        color: 'red'
      });
    }
  };

  const handleVerify = async (commentId) => {
    const result = await verifyComment(commentId);
    if (result.success) {
      notifications.show({
        title: 'Verified',
        message: 'Thanks for verifying this information!',
        color: 'green'
      });
      loadComments();
    } else if (result.error === 'Already verified') {
      notifications.show({
        title: 'Info',
        message: 'You already verified this comment',
        color: 'blue'
      });
    } else {
      notifications.show({
        title: 'Error',
        message: result.error,
        color: 'red'
      });
    }
  };

  const handleDelete = async (commentId) => {
    const result = await deleteComment(commentId);
    if (result.success) {
      notifications.show({
        title: 'Deleted',
        message: 'Comment deleted',
        color: 'green'
      });
      loadComments();
      loadStats();
    } else {
      notifications.show({
        title: 'Error',
        message: result.error,
        color: 'red'
      });
    }
  };

  const handleFlag = async (commentId) => {
    const result = await flagComment(commentId);
    if (result.success) {
      notifications.show({
        title: 'Reported',
        message: 'Comment has been reported for review',
        color: 'green'
      });
    } else {
      notifications.show({
        title: 'Error',
        message: result.error,
        color: 'red'
      });
    }
  };

  const getFilteredComments = () => {
    if (commentFilter === 'all') {
      return comments.all;
    }
    return comments.grouped[commentFilter] || [];
  };

  const filteredComments = getFilteredComments();

  return (
    <Stack spacing="md">
      <Paper p="md" withBorder>
        <Group position="apart" mb="md">
          <Group>
            <MessageCircle size={20} />
            <Text size="lg" weight={600}>Local Knowledge</Text>
          </Group>
          <Button
            leftSection={<Plus size={16} />}
            size="sm"
            onClick={() => setAddModalOpen(true)}
          >
            Add Info
          </Button>
        </Group>

        {stats && (
          <Group spacing="xs" mb="md">
            <Badge variant="light">{stats.total} comments</Badge>
            <Badge variant="light" color="green">{stats.verified} verified</Badge>
            <Badge variant="light" color="orange">{stats.byType.hazards} hazards</Badge>
          </Group>
        )}

        <SegmentedControl
          value={commentFilter}
          onChange={setCommentFilter}
          data={[
            { label: 'All', value: 'all' },
            { label: `Conditions (${stats?.byType.conditions || 0})`, value: 'conditions' },
            { label: `Tips (${stats?.byType.tips || 0})`, value: 'tips' },
            { label: `Hazards (${stats?.byType.hazards || 0})`, value: 'hazards' },
            { label: `Amenities (${stats?.byType.amenities || 0})`, value: 'amenities' }
          ]}
          fullWidth
        />
      </Paper>

      {loading ? (
        <Paper p="xl" withBorder>
          <Text c="dimmed" ta="center">Loading comments...</Text>
        </Paper>
      ) : filteredComments.length === 0 ? (
        <Paper p="xl" withBorder>
          <Stack align="center" spacing="md">
            <MessageCircle size={48} opacity={0.3} />
            <Text c="dimmed">No comments yet</Text>
            <Text size="sm" c="dimmed" ta="center">
              Be the first to share local knowledge about this route
            </Text>
          </Stack>
        </Paper>
      ) : (
        <Stack spacing="sm">
          {filteredComments.map(comment => (
            <CommentCard
              key={comment.id}
              comment={comment}
              onVerify={handleVerify}
              onDelete={handleDelete}
              onFlag={handleFlag}
            />
          ))}
        </Stack>
      )}

      <AddCommentModal
        opened={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        onSubmit={handleAddComment}
      />
    </Stack>
  );
};

const CommentCard = ({ comment, onVerify, onDelete, onFlag }) => {
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    getCurrentUser();
  }, []);

  const getCurrentUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    setCurrentUser(user);
  };

  const getCommentIcon = () => {
    switch (comment.comment_type) {
      case CommentTypes.CONDITION:
        return <AlertTriangle size={16} />;
      case CommentTypes.TIP:
        return <Lightbulb size={16} />;
      case CommentTypes.HAZARD:
        return <AlertTriangle size={16} />;
      case CommentTypes.AMENITY:
        return <Coffee size={16} />;
      case CommentTypes.VARIANT:
        return <MapPin size={16} />;
      default:
        return <MessageCircle size={16} />;
    }
  };

  const getCommentColor = () => {
    switch (comment.comment_type) {
      case CommentTypes.HAZARD:
        return 'red';
      case CommentTypes.CONDITION:
        return 'orange';
      case CommentTypes.TIP:
        return 'blue';
      case CommentTypes.AMENITY:
        return 'teal';
      case CommentTypes.VARIANT:
        return 'violet';
      default:
        return 'gray';
    }
  };

  const isOwner = currentUser?.id === comment.user_id;
  const timeAgo = getTimeAgo(new Date(comment.created_at));

  return (
    <Card padding="md" withBorder>
      <Stack spacing="sm">
        <Group position="apart">
          <Badge
            leftSection={getCommentIcon()}
            color={getCommentColor()}
            variant="light"
          >
            {comment.comment_type}
          </Badge>

          {comment.is_verified && (
            <Badge leftSection={<CheckCircle size={12} />} color="green" size="sm">
              Verified by {comment.verification_count} riders
            </Badge>
          )}
        </Group>

        <Text size="sm">{comment.content}</Text>

        {comment.expires_at && (
          <Alert icon={<Clock size={16} />} color="orange" variant="light">
            <Text size="xs">
              Temporary condition - expires {new Date(comment.expires_at).toLocaleDateString()}
            </Text>
          </Alert>
        )}

        <Group position="apart" mt="xs">
          <Group spacing="xs">
            <Avatar
              src={comment.user_profiles?.avatar_url}
              size="sm"
              radius="xl"
            >
              {comment.user_profiles?.display_name?.[0] || '?'}
            </Avatar>
            <div>
              <Text size="xs" weight={500}>
                {comment.user_profiles?.display_name || 'Anonymous'}
              </Text>
              <Text size="xs" c="dimmed">{timeAgo}</Text>
            </div>
          </Group>

          <Group spacing={4}>
            {!isOwner && (
              <>
                <Tooltip label="Verify this information">
                  <ActionIcon
                    variant="subtle"
                    onClick={() => onVerify(comment.id)}
                  >
                    <ThumbsUp size={16} />
                  </ActionIcon>
                </Tooltip>
                <Tooltip label="Report">
                  <ActionIcon
                    variant="subtle"
                    color="red"
                    onClick={() => onFlag(comment.id)}
                  >
                    <Flag size={16} />
                  </ActionIcon>
                </Tooltip>
              </>
            )}

            {isOwner && (
              <Tooltip label="Delete">
                <ActionIcon
                  variant="subtle"
                  color="red"
                  onClick={() => onDelete(comment.id)}
                >
                  <Trash size={16} />
                </ActionIcon>
              </Tooltip>
            )}
          </Group>
        </Group>
      </Stack>
    </Card>
  );
};

const AddCommentModal = ({ opened, onClose, onSubmit }) => {
  const [commentType, setCommentType] = useState(CommentTypes.TIP);
  const [content, setContent] = useState('');
  const [expiresInDays, setExpiresInDays] = useState(null);

  const handleSubmit = () => {
    if (!content.trim()) {
      notifications.show({
        title: 'Error',
        message: 'Please enter a comment',
        color: 'red'
      });
      return;
    }

    onSubmit({
      commentType,
      content: content.trim(),
      expiresInDays: expiresInDays ? parseInt(expiresInDays) : null
    });

    // Reset form
    setContent('');
    setExpiresInDays(null);
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Add Local Knowledge"
      size="lg"
    >
      <Stack spacing="md">
        <Select
          label="Information Type"
          description="What kind of information are you sharing?"
          value={commentType}
          onChange={setCommentType}
          data={[
            { value: CommentTypes.CONDITION, label: 'Current Condition (road work, closures)' },
            { value: CommentTypes.TIP, label: 'Tip (best times, parking, water)' },
            { value: CommentTypes.HAZARD, label: 'Hazard (safety concerns)' },
            { value: CommentTypes.AMENITY, label: 'Amenity (cafe, restroom, shop)' },
            { value: CommentTypes.VARIANT, label: 'Route Variant (alternative segments)' }
          ]}
        />

        <Textarea
          label="Details"
          description="Share practical information that will help other riders"
          placeholder="E.g., Construction on Main St until March. Use parallel bike path..."
          value={content}
          onChange={(e) => setContent(e.target.value)}
          minRows={4}
          maxLength={1000}
        />

        {(commentType === CommentTypes.CONDITION || commentType === CommentTypes.HAZARD) && (
          <Select
            label="How long is this relevant?"
            description="Set an expiration for temporary conditions"
            placeholder="Permanent"
            value={expiresInDays}
            onChange={setExpiresInDays}
            data={[
              { value: '7', label: '1 week' },
              { value: '30', label: '1 month' },
              { value: '90', label: '3 months' },
              { value: '180', label: '6 months' }
            ]}
            clearable
          />
        )}

        <Group position="right">
          <Button variant="subtle" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit}>Add Comment</Button>
        </Group>
      </Stack>
    </Modal>
  );
};

const getTimeAgo = (date) => {
  const seconds = Math.floor((new Date() - date) / 1000);

  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  if (seconds < 2592000) return `${Math.floor(seconds / 604800)}w ago`;
  return date.toLocaleDateString();
};

export default RouteComments;
