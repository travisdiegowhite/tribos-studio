import React, { useState, useEffect } from 'react';
import {
  Paper,
  Text,
  Stack,
  Tabs,
  Title,
  Button,
  Group,
  Alert,
} from '@mantine/core';
import StravaIntegration from './StravaIntegration';
import WahooIntegration from './WahooIntegration';
import GarminIntegration from './GarminIntegration';
import FileUpload from './FileUpload';
import ImportWizard from './ImportWizard';
import ImportStatusBanner from './ImportStatusBanner';
import { stravaService } from '../utils/stravaService';
import garminService from '../utils/garminService';
import { useActiveImports } from '../hooks/useActiveImports';

const FitnessIntegrations = () => {
  const [activeTab, setActiveTab] = useState('strava');
  const [stravaConnected, setStravaConnected] = useState(false);
  const [garminConnected, setGarminConnected] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const { activeJobs, dismissJob } = useActiveImports();

  useEffect(() => {
    checkConnections();
  }, []);

  const checkConnections = async () => {
    try {
      const strava = await stravaService.isConnected();
      const garmin = await garminService.isConnected();
      setStravaConnected(strava);
      setGarminConnected(garmin);
    } catch (error) {
      console.error('Error checking connections:', error);
    }
  };

  return (
    <>
      {/* Import Wizard Modal */}
      <ImportWizard
        opened={showWizard}
        onClose={() => setShowWizard(false)}
        stravaConnected={stravaConnected}
        garminConnected={garminConnected}
      />

      {/* Show active import jobs banner */}
      {activeJobs && activeJobs.length > 0 && activeJobs.map(job => (
        <ImportStatusBanner
          key={job.id}
          job={job}
          onDismiss={() => dismissJob(job.id)}
        />
      ))}

      <Paper shadow="sm" p="md">
        <Stack gap="lg">
          <Group justify="space-between" align="flex-start">
            <div>
              <Title order={2} mb="xs">Import Routes & Rides</Title>
              <Text size="sm" c="dimmed">
                Upload route files or connect your fitness tracking service to import your rides
              </Text>
            </div>
            <Button
              onClick={() => setShowWizard(true)}
              variant="gradient"
              gradient={{ from: '#FC4C02', to: '#007CC3', deg: 90 }}
              size="md"
            >
              📚 Import Wizard
            </Button>
          </Group>

          <Tabs value={activeTab} onChange={setActiveTab}>
          <Tabs.List>
            <Tabs.Tab value="strava">
              Strava
            </Tabs.Tab>
            <Tabs.Tab value="wahoo">
              Wahoo Fitness
            </Tabs.Tab>
            <Tabs.Tab value="garmin">
              Garmin Connect
            </Tabs.Tab>
            <Tabs.Tab value="upload">
              Upload Files
            </Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="strava" pt="lg">
            <StravaIntegration />
          </Tabs.Panel>

          <Tabs.Panel value="wahoo" pt="lg">
            <WahooIntegration />
          </Tabs.Panel>

          <Tabs.Panel value="garmin" pt="lg">
            <GarminIntegration />
          </Tabs.Panel>

          <Tabs.Panel value="upload" pt="lg">
            <FileUpload />
          </Tabs.Panel>
        </Tabs>
      </Stack>
    </Paper>
    </>
  );
};

export default FitnessIntegrations;
