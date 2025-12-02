import React, { useState, useEffect } from 'react';
import {
  Modal,
  Stack,
  TextInput,
  NumberInput,
  Select,
  Button,
  Text,
  Group,
  Card,
  Tabs,
  Table,
  Badge,
  Textarea,
  Alert
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { Info, Activity, Heart, Trophy } from 'lucide-react';
import { getCurrentFTP, setCurrentFTP, getFTPHistory, calculateZones } from '../services/ftp';
import { notifications } from '@mantine/notifications';

export default function FTPSettingsModal({ opened, onClose, user, onSaved }) {
  const [loading, setLoading] = useState(false);
  const [currentFTP, setCurrentFTPData] = useState(null);
  const [ftpHistory, setFTPHistory] = useState([]);
  const [activeTab, setActiveTab] = useState('current');

  // Form state
  const [ftpWatts, setFTPWatts] = useState('');
  const [lthr, setLTHR] = useState('');
  const [testDate, setTestDate] = useState(new Date());
  const [testType, setTestType] = useState('manual');
  const [notes, setNotes] = useState('');

  // Calculated zones preview
  const [zonesPreview, setZonesPreview] = useState([]);

  useEffect(() => {
    if (opened && user?.id) {
      loadFTPData();
    }
  }, [opened, user]);

  useEffect(() => {
    // Update zones preview when FTP changes
    if (ftpWatts && ftpWatts > 0) {
      const zones = calculateZones(parseInt(ftpWatts), lthr || null);
      setZonesPreview(zones);
    } else {
      setZonesPreview([]);
    }
  }, [ftpWatts, lthr]);

  const loadFTPData = async () => {
    setLoading(true);
    try {
      // Load current FTP
      const current = await getCurrentFTP(user.id);
      setCurrentFTPData(current);

      if (current) {
        setFTPWatts(current.ftp);
        setLTHR(current.lthr || '');
        setTestDate(new Date(current.testDate));
        setTestType(current.testType);
        setNotes(current.notes || '');
      }

      // Load FTP history
      const history = await getFTPHistory(user.id, 20);
      setFTPHistory(history);
    } catch (error) {
      console.error('Error loading FTP data:', error);
      notifications.show({
        title: 'Error',
        message: 'Failed to load FTP data',
        color: 'red'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!ftpWatts || ftpWatts < 50 || ftpWatts > 600) {
      notifications.show({
        title: 'Invalid FTP',
        message: 'FTP must be between 50 and 600 watts',
        color: 'red'
      });
      return;
    }

    setLoading(true);
    try {
      await setCurrentFTP(user.id, parseInt(ftpWatts), {
        lthr: lthr ? parseInt(lthr) : null,
        testDate: testDate.toISOString().split('T')[0],
        testType,
        notes
      });

      notifications.show({
        title: 'Success',
        message: 'FTP updated successfully. Training zones have been recalculated.',
        color: 'green'
      });

      if (onSaved) onSaved();
      onClose();
    } catch (error) {
      console.error('Error saving FTP:', error);
      notifications.show({
        title: 'Error',
        message: 'Failed to save FTP',
        color: 'red'
      });
    } finally {
      setLoading(false);
    }
  };

  const testTypeOptions = [
    { value: 'manual', label: 'Manual Entry' },
    { value: '20min', label: '20-Minute Test' },
    { value: '8min', label: '8-Minute Test' },
    { value: 'ramp', label: 'Ramp Test' },
    { value: 'auto_detected', label: 'Auto-Detected' }
  ];

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const getTestTypeBadgeColor = (type) => {
    switch (type) {
      case 'ramp': return 'violet';
      case '20min': return 'blue';
      case '8min': return 'cyan';
      case 'auto_detected': return 'green';
      default: return 'gray';
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Group gap="xs">
          <Activity size={20} />
          <Text fw={600}>FTP & Training Zones</Text>
        </Group>
      }
      size="xl"
    >
      <Tabs value={activeTab} onChange={setActiveTab}>
        <Tabs.List>
          <Tabs.Tab value="current">Current FTP</Tabs.Tab>
          <Tabs.Tab value="zones">Training Zones</Tabs.Tab>
          <Tabs.Tab value="history">History</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="current" pt="md">
          <Stack gap="md">
            <Alert icon={<Info size={16} />} color="blue" variant="light">
              FTP (Functional Threshold Power) is the maximum power you can sustain for ~1 hour.
              Setting your FTP will automatically calculate your 7 training zones.
            </Alert>

            <Group grow align="flex-start">
              <NumberInput
                label="FTP (watts)"
                placeholder="Enter your FTP"
                value={ftpWatts}
                onChange={setFTPWatts}
                min={50}
                max={600}
                leftSection={<Activity size={16} />}
                required
              />
              <NumberInput
                label="LTHR (bpm)"
                placeholder="Optional"
                description="Lactate Threshold Heart Rate"
                value={lthr}
                onChange={setLTHR}
                min={100}
                max={220}
                leftSection={<Heart size={16} />}
              />
            </Group>

            <Group grow align="flex-start">
              <DateInput
                label="Test Date"
                value={testDate}
                onChange={setTestDate}
                maxDate={new Date()}
                required
              />
              <Select
                label="Test Type"
                data={testTypeOptions}
                value={testType}
                onChange={setTestType}
                required
              />
            </Group>

            <Textarea
              label="Notes"
              placeholder="Add any notes about this FTP test (optional)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              minRows={2}
              maxRows={4}
            />

            {currentFTP && (
              <Card withBorder p="sm" bg="gray.0">
                <Text size="sm" c="dimmed" mb={4}>
                  Current FTP
                </Text>
                <Group gap="md">
                  <div>
                    <Text size="xl" fw={700}>
                      {currentFTP.ftp}W
                    </Text>
                    <Text size="xs" c="dimmed">
                      Set on {formatDate(currentFTP.testDate)}
                    </Text>
                  </div>
                  {currentFTP.lthr && (
                    <div>
                      <Text size="xl" fw={700} c="pink">
                        {currentFTP.lthr} bpm
                      </Text>
                      <Text size="xs" c="dimmed">
                        LTHR
                      </Text>
                    </div>
                  )}
                </Group>
              </Card>
            )}

            <Group justify="flex-end" mt="md">
              <Button variant="default" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={handleSave} loading={loading}>
                Save FTP
              </Button>
            </Group>
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="zones" pt="md">
          <Stack gap="md">
            {zonesPreview.length === 0 ? (
              <Alert icon={<Info size={16} />} color="gray">
                Enter your FTP in the "Current FTP" tab to see your training zones.
              </Alert>
            ) : (
              <>
                <Text size="sm" c="dimmed">
                  Your training zones based on FTP of {ftpWatts}W
                  {lthr && ` and LTHR of ${lthr} bpm`}
                </Text>

                <Stack gap="xs">
                  {zonesPreview.map((zone) => (
                    <Card
                      key={zone.number}
                      withBorder
                      p="md"
                      style={{
                        borderLeft: `4px solid ${zone.color}`
                      }}
                    >
                      <Group justify="space-between" mb={4}>
                        <Group gap="xs">
                          <Badge
                            color={zone.color}
                            variant="light"
                            size="lg"
                          >
                            Zone {zone.number}
                          </Badge>
                          <Text fw={600}>{zone.label}</Text>
                        </Group>
                      </Group>

                      <Text size="sm" c="dimmed" mb={8}>
                        {zone.description}
                      </Text>

                      <Group gap="xl">
                        <div>
                          <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
                            Power
                          </Text>
                          <Text size="sm" fw={600}>
                            {zone.powerMin}-{zone.powerMax}W
                          </Text>
                          <Text size="xs" c="dimmed">
                            {zone.ftpPercentMin}-{zone.ftpPercentMax}% FTP
                          </Text>
                        </div>

                        {zone.hrMin && zone.hrMax && (
                          <div>
                            <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
                              Heart Rate
                            </Text>
                            <Text size="sm" fw={600} c="pink">
                              {zone.hrMin}-{zone.hrMax} bpm
                            </Text>
                            <Text size="xs" c="dimmed">
                              {zone.lthrPercentMin}-{zone.lthrPercentMax}% LTHR
                            </Text>
                          </div>
                        )}
                      </Group>
                    </Card>
                  ))}
                </Stack>
              </>
            )}
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="history" pt="md">
          <Stack gap="md">
            {ftpHistory.length === 0 ? (
              <Alert icon={<Info size={16} />} color="gray">
                No FTP history yet. Set your first FTP in the "Current FTP" tab.
              </Alert>
            ) : (
              <Table
                striped
                highlightOnHover
                styles={{
                  table: {
                    '--table-striped-color': 'rgba(102, 126, 234, 0.05)', // Light purple/blue
                    '--table-hover-color': 'rgba(102, 126, 234, 0.1)', // Slightly darker on hover
                  }
                }}
              >
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Date</Table.Th>
                    <Table.Th>FTP</Table.Th>
                    <Table.Th>LTHR</Table.Th>
                    <Table.Th>Test Type</Table.Th>
                    <Table.Th>Change</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {ftpHistory.map((entry, index) => {
                    const previousFTP = ftpHistory[index + 1]?.ftp_watts;
                    const change = previousFTP ? entry.ftp_watts - previousFTP : 0;

                    return (
                      <Table.Tr key={entry.id}>
                        <Table.Td>
                          <Group gap="xs">
                            <Text size="sm">{formatDate(entry.test_date)}</Text>
                            {entry.is_current && (
                              <Badge size="xs" color="blue">
                                Current
                              </Badge>
                            )}
                          </Group>
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm" fw={600}>
                            {entry.ftp_watts}W
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          {entry.lthr_bpm ? (
                            <Text size="sm" c="pink">
                              {entry.lthr_bpm} bpm
                            </Text>
                          ) : (
                            <Text size="sm" c="dimmed">
                              -
                            </Text>
                          )}
                        </Table.Td>
                        <Table.Td>
                          <Badge
                            size="sm"
                            color={getTestTypeBadgeColor(entry.test_type)}
                            variant="light"
                          >
                            {entry.test_type}
                          </Badge>
                        </Table.Td>
                        <Table.Td>
                          {change !== 0 && (
                            <Badge
                              size="sm"
                              color={change > 0 ? 'green' : 'red'}
                              variant="light"
                            >
                              {change > 0 ? '+' : ''}
                              {change}W
                            </Badge>
                          )}
                        </Table.Td>
                      </Table.Tr>
                    );
                  })}
                </Table.Tbody>
              </Table>
            )}
          </Stack>
        </Tabs.Panel>
      </Tabs>
    </Modal>
  );
}
