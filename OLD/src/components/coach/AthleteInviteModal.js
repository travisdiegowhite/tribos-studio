import React, { useState } from 'react';
import {
  Modal,
  Stack,
  TextInput,
  Button,
  Group,
  Alert,
  LoadingOverlay,
  Switch,
  Text,
  Divider,
} from '@mantine/core';
import { Mail, AlertCircle, CheckCircle, UserPlus } from 'lucide-react';
import coachService from '../../services/coachService';

/**
 * Athlete Invite Modal
 * Allows coaches to invite athletes by email
 */
const AthleteInviteModal = ({ opened, onClose, onSuccess, coachId }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  // Form state
  const [athleteEmail, setAthleteEmail] = useState('');
  const [permissions, setPermissions] = useState({
    canViewRides: true,
    canViewHealthMetrics: false,
    canAssignWorkouts: true,
    canViewPerformanceData: true
  });

  const resetForm = () => {
    setAthleteEmail('');
    setPermissions({
      canViewRides: true,
      canViewHealthMetrics: false,
      canAssignWorkouts: true,
      canViewPerformanceData: true
    });
    setError(null);
    setSuccess(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      // Validate email
      if (!athleteEmail || !athleteEmail.includes('@')) {
        throw new Error('Please enter a valid email address');
      }

      const { error: inviteError } = await coachService.inviteAthlete(
        coachId,
        athleteEmail,
        permissions
      );

      if (inviteError) throw inviteError;

      setSuccess(true);
      setTimeout(() => {
        onSuccess?.();
        resetForm();
      }, 2000);

    } catch (err) {
      console.error('Error inviting athlete:', err);
      setError(err.message || 'Failed to send invitation');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      resetForm();
      onClose();
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title="Invite Athlete"
      size="md"
    >
      <form onSubmit={handleSubmit}>
        <Stack spacing="md">
          <LoadingOverlay visible={loading} />

          {/* Success Message */}
          {success && (
            <Alert
              icon={<CheckCircle size={20} />}
              title="Invitation Sent!"
              color="green"
            >
              The athlete will receive an invitation and can accept it from their dashboard.
            </Alert>
          )}

          {/* Error Message */}
          {error && (
            <Alert
              icon={<AlertCircle size={20} />}
              title="Error"
              color="red"
            >
              {error}
            </Alert>
          )}

          {/* Email Input */}
          <TextInput
            label="Athlete Email"
            placeholder="athlete@example.com"
            icon={<Mail size={16} />}
            value={athleteEmail}
            onChange={(e) => setAthleteEmail(e.target.value)}
            required
            disabled={success}
            description="Enter the email address of the athlete you want to invite"
          />

          <Divider label="Permissions" labelPosition="center" />

          {/* Permissions */}
          <Stack spacing="sm">
            <Text size="sm" c="dimmed">
              Set what data you can access for this athlete:
            </Text>

            <Switch
              label="View Rides"
              description="Access athlete's ride history and routes"
              checked={permissions.canViewRides}
              onChange={(e) => setPermissions({
                ...permissions,
                canViewRides: e.currentTarget.checked
              })}
              disabled={success}
            />

            <Switch
              label="Assign Workouts"
              description="Create and assign training workouts"
              checked={permissions.canAssignWorkouts}
              onChange={(e) => setPermissions({
                ...permissions,
                canAssignWorkouts: e.currentTarget.checked
              })}
              disabled={success}
            />

            <Switch
              label="View Performance Data"
              description="Access training metrics (CTL, ATL, TSB, FTP)"
              checked={permissions.canViewPerformanceData}
              onChange={(e) => setPermissions({
                ...permissions,
                canViewPerformanceData: e.currentTarget.checked
              })}
              disabled={success}
            />

            <Switch
              label="View Health Metrics"
              description="Access sleep, HRV, and recovery data"
              checked={permissions.canViewHealthMetrics}
              onChange={(e) => setPermissions({
                ...permissions,
                canViewHealthMetrics: e.currentTarget.checked
              })}
              disabled={success}
            />
          </Stack>

          {/* Info Alert */}
          <Alert color="blue" variant="light">
            <Text size="sm">
              The athlete can modify these permissions after accepting the invitation.
            </Text>
          </Alert>

          {/* Actions */}
          <Group position="right" mt="md">
            <Button variant="subtle" onClick={handleClose} disabled={loading}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading || success}
              leftIcon={<UserPlus size={18} />}
            >
              Send Invitation
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
};

export default AthleteInviteModal;
