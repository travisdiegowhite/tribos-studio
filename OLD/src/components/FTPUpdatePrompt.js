import React, { useState } from 'react';
import {
  Modal,
  Stack,
  Text,
  Group,
  Button,
  Card,
  Badge,
  Alert,
  NumberInput
} from '@mantine/core';
import {
  TrendingUp,
  TrendingDown,
  Activity,
  Info,
  Trophy
} from 'lucide-react';
import { applyFTPUpdate } from '../services/ftpDetection';
import { notifications } from '@mantine/notifications';

export default function FTPUpdatePrompt({ opened, onClose, user, detectionData, onAccepted }) {
  const [loading, setLoading] = useState(false);
  const [customFTP, setCustomFTP] = useState(detectionData?.estimatedFTP || 0);
  const [useCustom, setUseCustom] = useState(false);

  if (!detectionData) return null;

  const {
    estimatedFTP,
    currentFTP,
    improvement,
    improvementPercent,
    testType,
    confidence,
    rideName,
    rideDate,
    details
  } = detectionData;

  const isIncrease = improvement > 0;
  const isSignificant = Math.abs(improvementPercent) >= 5;

  const handleAccept = async (useSuggested = true) => {
    setLoading(true);
    try {
      const ftpToApply = useSuggested ? estimatedFTP : customFTP;

      await applyFTPUpdate(user.id, ftpToApply, detectionData);

      notifications.show({
        title: 'FTP Updated!',
        message: `Your FTP has been updated to ${ftpToApply}W. Training zones have been recalculated.`,
        color: 'green',
        icon: <Trophy size={18} />
      });

      if (onAccepted) onAccepted();
      onClose();
    } catch (error) {
      console.error('Error updating FTP:', error);
      notifications.show({
        title: 'Error',
        message: 'Failed to update FTP',
        color: 'red'
      });
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const getTestTypeLabel = (type) => {
    const labels = {
      '20min': '20-Min Test',
      '8min': '8-Min Test',
      '60min': '60-Min Test',
      ramp: 'Ramp Test',
      auto_detected: 'Auto-Detected'
    };
    return labels[type] || type;
  };

  const getConfidenceColor = (conf) => {
    if (conf >= 0.8) return 'green';
    if (conf >= 0.6) return 'yellow';
    return 'orange';
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Group gap="xs">
          {isIncrease ? (
            <TrendingUp size={20} color="green" />
          ) : (
            <TrendingDown size={20} color="orange" />
          )}
          <Text fw={600}>FTP Update Detected</Text>
        </Group>
      }
      size="md"
    >
      <Stack gap="md">
        <Alert
          icon={<Info size={16} />}
          color={isIncrease ? 'green' : 'orange'}
          variant="light"
        >
          {isIncrease ? (
            <Text size="sm" c="#1a202c">
              Great work! We detected a potential FTP increase from your recent ride.
            </Text>
          ) : (
            <Text size="sm" c="#1a202c">
              We detected a potential FTP change from your recent ride.
            </Text>
          )}
        </Alert>

        <Card withBorder p="md" style={{ backgroundColor: '#3d4e5e' }}>
          <Stack gap="xs">
            <Group justify="space-between">
              <Text size="sm" c="#cbd5e1">
                Ride
              </Text>
              <Text size="sm" fw={600} c="#FFFFFF">
                {rideName}
              </Text>
            </Group>
            <Group justify="space-between">
              <Text size="sm" c="#cbd5e1">
                Date
              </Text>
              <Text size="sm" c="#FFFFFF">
                {formatDate(rideDate)}
              </Text>
            </Group>
            <Group justify="space-between">
              <Text size="sm" c="#cbd5e1">
                Test Type
              </Text>
              <Badge color="blue" variant="light">
                {getTestTypeLabel(testType)}
              </Badge>
            </Group>
            {details?.duration && (
              <Group justify="space-between">
                <Text size="sm" c="#cbd5e1">
                  Duration
                </Text>
                <Text size="sm" c="#FFFFFF">
                  {details.duration.toFixed(0)} min
                </Text>
              </Group>
            )}
            {details?.normalizedPower && (
              <Group justify="space-between">
                <Text size="sm" c="#cbd5e1">
                  Normalized Power
                </Text>
                <Text size="sm" fw={600} c="#FFFFFF">
                  {Math.round(details.normalizedPower)}W
                </Text>
              </Group>
            )}
            <Group justify="space-between">
              <Text size="sm" c="#cbd5e1">
                Confidence
              </Text>
              <Badge color={getConfidenceColor(confidence)} variant="light">
                {(confidence * 100).toFixed(0)}%
              </Badge>
            </Group>
          </Stack>
        </Card>

        <div>
          <Group justify="space-between" mb="md">
            <div>
              <Text size="sm" c="#cbd5e1" mb={4}>
                Current FTP
              </Text>
              <Text size="xl" fw={700} c="#FFFFFF">
                {currentFTP}W
              </Text>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', padding: '0 16px' }}>
              {isIncrease ? (
                <TrendingUp size={32} color="green" />
              ) : (
                <TrendingDown size={32} color="orange" />
              )}
            </div>

            <div>
              <Text size="sm" c="#cbd5e1" mb={4}>
                Suggested FTP
              </Text>
              <Group gap="xs">
                <Text size="xl" fw={700} c={isIncrease ? 'green' : 'orange'}>
                  {estimatedFTP}W
                </Text>
                {isSignificant && (
                  <Trophy size={20} color="gold" />
                )}
              </Group>
            </div>
          </Group>

          <Card withBorder p="sm" style={{ backgroundColor: isIncrease ? '#ebfbee' : '#fff5f5' }}>
            <Text size="sm" ta="center" fw={600} c={isIncrease ? '#047857' : '#c2410c'}>
              {isIncrease ? '+' : ''}
              {improvement}W ({isIncrease ? '+' : ''}
              {improvementPercent.toFixed(1)}%)
            </Text>
          </Card>
        </div>

        {!useCustom ? (
          <>
            <Group justify="space-between" grow>
              <Button
                variant="default"
                onClick={onClose}
              >
                Ignore
              </Button>
              <Button
                variant="light"
                onClick={() => setUseCustom(true)}
              >
                Enter Custom
              </Button>
              <Button
                onClick={() => handleAccept(true)}
                loading={loading}
                color={isIncrease ? 'green' : 'orange'}
                leftSection={<Activity size={16} />}
              >
                Accept {estimatedFTP}W
              </Button>
            </Group>
          </>
        ) : (
          <>
            <NumberInput
              label="Custom FTP"
              placeholder="Enter your FTP"
              value={customFTP}
              onChange={setCustomFTP}
              min={50}
              max={600}
              leftSection={<Activity size={16} />}
            />
            <Group justify="space-between" grow>
              <Button
                variant="default"
                onClick={() => setUseCustom(false)}
              >
                Back
              </Button>
              <Button
                onClick={() => handleAccept(false)}
                loading={loading}
                color="blue"
              >
                Save {customFTP}W
              </Button>
            </Group>
          </>
        )}
      </Stack>
    </Modal>
  );
}
