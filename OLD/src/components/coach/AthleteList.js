import React, { useState } from 'react';
import {
  Table,
  Avatar,
  Text,
  Group,
  Badge,
  ActionIcon,
  Menu,
  Button,
  Stack,
  Alert,
  Paper,
} from '@mantine/core';
import {
  MoreVertical,
  User,
  Calendar,
  MessageCircle,
  Activity,
  Pause,
  Play,
  X,
  Eye,
  Target,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';

/**
 * Athlete List Component
 * Displays list of athletes with quick actions
 */
const AthleteList = ({ athletes, onRefresh }) => {
  const navigate = useNavigate();
  const [actionLoading, setActionLoading] = useState(null);

  if (!athletes || athletes.length === 0) {
    return (
      <Paper p="xl" withBorder>
        <Stack align="center" spacing="md">
          <User size={48} color="var(--mantine-color-gray-5)" />
          <Stack align="center" spacing={4}>
            <Text weight={500} size="lg">No athletes yet</Text>
            <Text c="dimmed" size="sm" ta="center">
              Invite athletes to get started with coaching
            </Text>
          </Stack>
          <Button
            variant="light"
            leftIcon={<User size={18} />}
            onClick={() => {/* Handled by parent */}}
          >
            Invite Your First Athlete
          </Button>
        </Stack>
      </Paper>
    );
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'active':
        return 'green';
      case 'pending':
        return 'orange';
      case 'paused':
        return 'gray';
      case 'ended':
        return 'red';
      default:
        return 'gray';
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case 'active':
        return 'Active';
      case 'pending':
        return 'Pending';
      case 'paused':
        return 'Paused';
      case 'ended':
        return 'Ended';
      default:
        return status;
    }
  };

  const handleViewAthlete = (athleteId) => {
    navigate(`/coach/athletes/${athleteId}`);
  };

  const handleAssignWorkout = (athleteId) => {
    navigate(`/coach/athletes/${athleteId}/assign-workout`);
  };

  const handleSendMessage = (relationshipId) => {
    navigate(`/coach/messages/${relationshipId}`);
  };

  const rows = athletes.map((relationship) => {
    const athlete = relationship.athlete;
    const athleteId = relationship.athlete_id; // Use relationship's athlete_id

    return (
      <tr key={relationship.id}>
        <td>
          <Group spacing="sm">
            <Avatar
              src={athlete?.avatar_url}
              radius="xl"
              size="md"
            >
              {athlete?.display_name?.[0] || '?'}
            </Avatar>
            <div>
              <Text size="sm" weight={500}>
                {athlete?.display_name || 'Unknown'}
              </Text>
              <Text size="xs" c="dimmed">
                {athleteId}
              </Text>
            </div>
          </Group>
        </td>
        <td>
          {athlete?.location_name ? (
            <Text size="sm">{athlete.location_name}</Text>
          ) : (
            <Text size="sm" c="dimmed">-</Text>
          )}
        </td>
        <td>
          <Badge
            color={getStatusColor(relationship.status)}
            variant="light"
          >
            {getStatusLabel(relationship.status)}
          </Badge>
        </td>
        <td>
          <Text size="sm" c="dimmed">
            {relationship.activated_at
              ? formatDistanceToNow(new Date(relationship.activated_at), { addSuffix: true })
              : relationship.invitation_sent_at
              ? formatDistanceToNow(new Date(relationship.invitation_sent_at), { addSuffix: true })
              : '-'}
          </Text>
        </td>
        <td>
          <Group spacing={4}>
            {/* Permissions badges */}
            {relationship.can_assign_workouts && (
              <Badge size="xs" variant="dot" color="blue">
                Workouts
              </Badge>
            )}
            {relationship.can_view_rides && (
              <Badge size="xs" variant="dot" color="green">
                Rides
              </Badge>
            )}
            {relationship.can_view_health_metrics && (
              <Badge size="xs" variant="dot" color="orange">
                Health
              </Badge>
            )}
          </Group>
        </td>
        <td>
          <Group spacing={4} position="right">
            {/* Quick action buttons */}
            <ActionIcon
              variant="light"
              color="blue"
              onClick={() => handleViewAthlete(athleteId)}
              title="View Details"
            >
              <Eye size={18} />
            </ActionIcon>

            {relationship.status === 'active' && relationship.can_assign_workouts && (
              <ActionIcon
                variant="light"
                color="green"
                onClick={() => handleAssignWorkout(athleteId)}
                title="Assign Workout"
              >
                <Target size={18} />
              </ActionIcon>
            )}

            {relationship.status === 'active' && (
              <ActionIcon
                variant="light"
                color="violet"
                onClick={() => handleSendMessage(relationship.id)}
                title="Send Message"
              >
                <MessageCircle size={18} />
              </ActionIcon>
            )}

            {/* More menu */}
            <Menu shadow="md" width={200}>
              <Menu.Target>
                <ActionIcon variant="subtle">
                  <MoreVertical size={18} />
                </ActionIcon>
              </Menu.Target>

              <Menu.Dropdown>
                <Menu.Label>Actions</Menu.Label>

                <Menu.Item
                  icon={<Eye size={16} />}
                  onClick={() => handleViewAthlete(athleteId)}
                >
                  View Details
                </Menu.Item>

                {relationship.status === 'active' && (
                  <>
                    <Menu.Item
                      icon={<Calendar size={16} />}
                      onClick={() => handleAssignWorkout(athleteId)}
                    >
                      Assign Workout
                    </Menu.Item>

                    <Menu.Item
                      icon={<MessageCircle size={16} />}
                      onClick={() => handleSendMessage(relationship.id)}
                    >
                      Send Message
                    </Menu.Item>

                    <Menu.Item
                      icon={<Activity size={16} />}
                      onClick={() => navigate(`/coach/athletes/${athleteId}/progress`)}
                    >
                      View Progress
                    </Menu.Item>

                    <Menu.Divider />

                    <Menu.Item
                      icon={<Pause size={16} />}
                      color="orange"
                    >
                      Pause Coaching
                    </Menu.Item>
                  </>
                )}

                {relationship.status === 'paused' && (
                  <Menu.Item
                    icon={<Play size={16} />}
                    color="green"
                  >
                    Resume Coaching
                  </Menu.Item>
                )}

                <Menu.Divider />

                <Menu.Item
                  icon={<X size={16} />}
                  color="red"
                >
                  End Relationship
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </Group>
        </td>
      </tr>
    );
  });

  return (
    <Table
      verticalSpacing="md"
      highlightOnHover
      styles={{
        table: {
          '--table-hover-color': 'rgba(34, 211, 238, 0.08)', // Light cyan on hover
        }
      }}
    >
      <thead>
        <tr>
          <th>Athlete</th>
          <th>Location</th>
          <th>Status</th>
          <th>Since</th>
          <th>Permissions</th>
          <th style={{ textAlign: 'right' }}>Actions</th>
        </tr>
      </thead>
      <tbody>{rows}</tbody>
    </Table>
  );
};

export default AthleteList;
