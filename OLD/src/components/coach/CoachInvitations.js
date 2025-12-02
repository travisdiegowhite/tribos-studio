import React, { useState, useEffect } from 'react';
import {
  Card,
  Stack,
  Text,
  Group,
  Button,
  Badge,
  Avatar,
  Alert,
  Paper,
  LoadingOverlay,
  Divider,
  ThemeIcon,
} from '@mantine/core';
import {
  UserCheck,
  UserX,
  Mail,
  Calendar,
  Activity,
  Heart,
  CheckCircle,
  X,
  Info,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import coachService from '../../services/coachService';
import { formatDistanceToNow } from 'date-fns';

/**
 * Coach Invitations Component
 * Shows pending coach invitations for athletes
 */
const CoachInvitations = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [invitations, setInvitations] = useState([]);
  const [actionLoading, setActionLoading] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!user) return;
    loadInvitations();
  }, [user]);

  const loadInvitations = async () => {
    setLoading(true);
    setError(null);

    try {
      const { data, error } = await coachService.getCoaches(user.id, 'pending');

      if (error) throw error;

      setInvitations(data || []);
    } catch (err) {
      console.error('Error loading invitations:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = async (relationshipId) => {
    setActionLoading(relationshipId);
    setError(null);

    try {
      const { error } = await coachService.acceptInvitation(relationshipId, user.id);

      if (error) throw error;

      // Remove from pending list
      setInvitations(invitations.filter(inv => inv.id !== relationshipId));
    } catch (err) {
      console.error('Error accepting invitation:', err);
      setError(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDecline = async (relationshipId) => {
    setActionLoading(relationshipId);
    setError(null);

    try {
      const { error } = await coachService.declineInvitation(relationshipId, user.id);

      if (error) throw error;

      // Remove from pending list
      setInvitations(invitations.filter(inv => inv.id !== relationshipId));
    } catch (err) {
      console.error('Error declining invitation:', err);
      setError(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <Card shadow="sm" p="lg" radius="md" withBorder>
        <LoadingOverlay visible />
        <div style={{ height: 200 }} />
      </Card>
    );
  }

  // Show errors if loading failed
  if (error && invitations.length === 0) {
    return (
      <Alert
        icon={<X size={20} />}
        title="Error Loading Invitations"
        color="red"
        withCloseButton
        onClose={() => setError(null)}
      >
        {error}
      </Alert>
    );
  }

  if (invitations.length === 0) {
    return null; // Don't show anything if no invitations
  }

  return (
    <Stack spacing="md">
      {/* Header Alert */}
      <Alert
        icon={<Mail size={20} />}
        title="Coach Invitations"
        color="blue"
      >
        You have {invitations.length} pending coach invitation{invitations.length !== 1 ? 's' : ''}
      </Alert>

      {/* Error Alert */}
      {error && (
        <Alert
          icon={<X size={20} />}
          title="Error"
          color="red"
          withCloseButton
          onClose={() => setError(null)}
        >
          {error}
        </Alert>
      )}

      {/* Invitations List */}
      <Stack spacing="sm">
        {invitations.map((invitation) => {
          const coach = invitation.coach;
          const profile = coach?.user_profiles;

          return (
            <Card
              key={invitation.id}
              shadow="sm"
              p="lg"
              radius="md"
              withBorder
            >
              <Stack spacing="md">
                {/* Coach Info */}
                <Group position="apart">
                  <Group>
                    <Avatar
                      src={profile?.avatar_url}
                      size="lg"
                      radius="xl"
                    >
                      {profile?.display_name?.[0] || coach?.email?.[0] || 'C'}
                    </Avatar>
                    <div>
                      <Text weight={500} size="lg">
                        {profile?.display_name || 'Coach'}
                      </Text>
                      <Text size="sm" c="dimmed">
                        {coach?.email}
                      </Text>
                      <Text size="xs" c="dimmed" mt={4}>
                        Invited {formatDistanceToNow(new Date(invitation.invitation_sent_at), { addSuffix: true })}
                      </Text>
                    </div>
                  </Group>
                  <Badge color="orange" variant="light" size="lg">
                    Pending
                  </Badge>
                </Group>

                {/* Coach Bio */}
                {profile?.coach_bio && (
                  <>
                    <Divider />
                    <Text size="sm" c="dimmed">
                      {profile.coach_bio}
                    </Text>
                  </>
                )}

                {/* Certifications & Specialties */}
                {(profile?.coach_certifications?.length > 0 || profile?.coach_specialties?.length > 0) && (
                  <Group spacing="xs">
                    {profile?.coach_certifications?.map((cert, idx) => (
                      <Badge key={idx} size="sm" variant="dot" color="blue">
                        {cert}
                      </Badge>
                    ))}
                    {profile?.coach_specialties?.map((specialty, idx) => (
                      <Badge key={idx} size="sm" variant="dot" color="green">
                        {specialty}
                      </Badge>
                    ))}
                  </Group>
                )}

                <Divider label="Permissions" labelPosition="center" />

                {/* Permissions */}
                <Paper p="sm" withBorder>
                  <Stack spacing="xs">
                    <Text size="sm" weight={500} c="dimmed">
                      This coach will be able to:
                    </Text>

                    <Group spacing="xs">
                      {invitation.can_view_rides && (
                        <Badge
                          size="sm"
                          variant="light"
                          color="green"
                          leftSection={<Activity size={12} />}
                        >
                          View your rides
                        </Badge>
                      )}
                      {invitation.can_assign_workouts && (
                        <Badge
                          size="sm"
                          variant="light"
                          color="blue"
                          leftSection={<Calendar size={12} />}
                        >
                          Assign workouts
                        </Badge>
                      )}
                      {invitation.can_view_performance_data && (
                        <Badge
                          size="sm"
                          variant="light"
                          color="violet"
                          leftSection={<CheckCircle size={12} />}
                        >
                          View performance data
                        </Badge>
                      )}
                      {invitation.can_view_health_metrics && (
                        <Badge
                          size="sm"
                          variant="light"
                          color="orange"
                          leftSection={<Heart size={12} />}
                        >
                          View health metrics
                        </Badge>
                      )}
                    </Group>

                    <Alert icon={<Info size={16} />} color="blue" variant="light" p="xs">
                      <Text size="xs">
                        You can modify these permissions anytime after accepting
                      </Text>
                    </Alert>
                  </Stack>
                </Paper>

                {/* Actions */}
                <Group position="right" mt="sm">
                  <Button
                    variant="subtle"
                    color="red"
                    leftIcon={<UserX size={18} />}
                    onClick={() => handleDecline(invitation.id)}
                    loading={actionLoading === invitation.id}
                  >
                    Decline
                  </Button>
                  <Button
                    color="green"
                    leftIcon={<UserCheck size={18} />}
                    onClick={() => handleAccept(invitation.id)}
                    loading={actionLoading === invitation.id}
                  >
                    Accept Invitation
                  </Button>
                </Group>
              </Stack>
            </Card>
          );
        })}
      </Stack>
    </Stack>
  );
};

export default CoachInvitations;
