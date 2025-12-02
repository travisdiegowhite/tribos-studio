import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Modal,
  Stepper,
  Button,
  Group,
  Text,
  Stack,
  Paper,
  Alert,
  Radio,
  Progress,
  Card,
  Badge,
  SimpleGrid,
  List,
  ThemeIcon,
} from '@mantine/core';
import {
  Check,
  Download,
  Zap,
  Calendar,
  AlertCircle,
  TrendingUp,
  CheckCircle,
} from 'lucide-react';
import { stravaService } from '../utils/stravaService';
import toast from 'react-hot-toast';

/**
 * Smart Import Wizard - Guides users through hybrid Strava + Garmin setup
 *
 * Step 1: Welcome + explain strategy
 * Step 2: Strava historical import
 * Step 3: Garmin auto-sync setup
 * Step 4: Complete
 */
const ImportWizard = ({ opened, onClose, stravaConnected, garminConnected }) => {
  const navigate = useNavigate();
  const [active, setActive] = useState(0);
  const [historicalPeriod, setHistoricalPeriod] = useState('1_year');
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importResults, setImportResults] = useState(null);
  const [importStatus, setImportStatus] = useState(''); // Status message for user

  const nextStep = () => setActive((current) => (current < 3 ? current + 1 : current));
  const prevStep = () => setActive((current) => (current > 0 ? current - 1 : current));

  const handleStravaImport = async () => {
    setImporting(true);
    setImportProgress(5);
    setImportResults(null);
    setImportStatus('Connecting to Strava...');

    try {
      // Calculate date range
      let startDate = new Date();
      switch (historicalPeriod) {
        case '3_months':
          startDate.setMonth(startDate.getMonth() - 3);
          break;
        case '6_months':
          startDate.setMonth(startDate.getMonth() - 6);
          break;
        case '1_year':
          startDate.setFullYear(startDate.getFullYear() - 1);
          break;
        case '2_years':
          startDate.setFullYear(startDate.getFullYear() - 2);
          break;
        case 'all':
          startDate = new Date('2010-01-01'); // Strava founded in 2009
          break;
        default:
          break;
      }

      console.log('📥 Starting chunked Strava import...', {
        from: startDate.toISOString(),
        to: new Date().toISOString()
      });

      // Step 1: Get list of activities (fast, no GPS data)
      setImportStatus('Finding activities...');
      setImportProgress(10);

      const listResult = await stravaService.listActivities({
        startDate: startDate.toISOString(),
        endDate: new Date().toISOString()
      });

      console.log('📋 Found activities:', listResult);

      if (listResult.newActivities === 0) {
        setImportProgress(100);
        setImportResults({
          imported: 0,
          skipped: listResult.totalActivities - listResult.newActivities,
          errors: 0,
          totalActivities: listResult.totalActivities
        });

        if (listResult.totalActivities === 0) {
          toast('No cycling activities found in the selected date range.', {
            icon: 'ℹ️',
            duration: 5000
          });
        } else {
          toast('All activities have already been imported.', {
            icon: 'ℹ️',
            duration: 5000
          });
        }
        setImporting(false);
        return;
      }

      // Step 2: Import activities in batches of 5 (to avoid timeouts)
      const activities = listResult.activities;
      const batchSize = 5;
      const totalBatches = Math.ceil(activities.length / batchSize);

      let totalImported = 0;
      let totalSkipped = 0;
      let totalErrors = 0;

      setImportStatus(`Importing ${activities.length} activities...`);

      for (let i = 0; i < activities.length; i += batchSize) {
        const batch = activities.slice(i, i + batchSize);
        const batchNumber = Math.floor(i / batchSize) + 1;
        const activityIds = batch.map(a => a.id);

        setImportStatus(`Importing batch ${batchNumber}/${totalBatches} (${batch.length} activities)...`);
        console.log(`📦 Importing batch ${batchNumber}/${totalBatches}:`, activityIds);

        try {
          const batchResult = await stravaService.importBatch(activityIds);

          totalImported += batchResult.imported;
          totalSkipped += batchResult.skipped;
          totalErrors += batchResult.errors;

          console.log(`✅ Batch ${batchNumber} complete:`, batchResult);

          // Check if we hit Strava rate limit
          if (batchResult.rateLimited) {
            console.warn('🛑 Strava rate limit reached');
            const remainingCount = activities.length - (i + batch.length);

            setImportProgress(100);
            setImportStatus('Strava rate limit reached');
            setImportResults({
              imported: totalImported,
              skipped: totalSkipped,
              errors: totalErrors,
              totalActivities: activities.length,
              rateLimited: true,
              remainingCount
            });

            toast(`Imported ${totalImported} rides. Strava rate limit reached - ${remainingCount} activities remaining. Try again in 15 minutes.`, {
              icon: '⚠️',
              duration: 10000
            });
            setImporting(false);
            return;
          }
        } catch (batchError) {
          console.error(`❌ Batch ${batchNumber} failed:`, batchError);
          totalErrors += batch.length;
        }

        // Update progress (10% for listing, 90% for importing)
        const importPercent = ((i + batch.length) / activities.length) * 90;
        setImportProgress(Math.round(10 + importPercent));

        // Delay between batches to avoid rate limiting (3 seconds is safer)
        if (i + batchSize < activities.length) {
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      }

      setImportProgress(100);
      setImportStatus('Import complete!');
      setImportResults({
        imported: totalImported,
        skipped: totalSkipped,
        errors: totalErrors,
        totalActivities: activities.length
      });

      console.log('✅ Chunked import complete:', { totalImported, totalSkipped, totalErrors });

      // Show appropriate toast
      if (totalErrors === 0 && totalImported > 0) {
        toast.success(`Import complete! Imported ${totalImported} rides.`);
        // Auto-advance to next step after success
        setTimeout(() => {
          nextStep();
        }, 2000);
      } else if (totalImported > 0) {
        toast(`Imported ${totalImported} rides with ${totalErrors} errors.`, {
          icon: '⚠️',
          duration: 5000
        });
      } else if (totalErrors > 0) {
        toast.error(`Import failed with ${totalErrors} errors.`);
      }

    } catch (error) {
      console.error('Import error:', error);
      toast.error(error.message || 'Failed to import activities');
      setImportResults({
        imported: 0,
        skipped: 0,
        errors: 1,
        errorMessage: error.message
      });
    } finally {
      setImporting(false);
      setImportStatus('');
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Import Your Cycling History"
      size="lg"
      centered
    >
      <Stepper active={active} onStepClick={setActive} breakpoint="sm">
        {/* Step 1: Welcome */}
        <Stepper.Step label="Welcome" description="Get started">
          <Stack gap="lg" mt="xl">
            <Alert color="blue" variant="light" icon={<TrendingUp size={20} />}>
              <Text size="sm" fw={600} mb={4}>
                Smart Import Strategy
              </Text>
              <Text size="xs">
                We'll help you import your complete cycling history and set up automatic syncing for future rides.
              </Text>
            </Alert>

            <Card withBorder p="md">
              <SimpleGrid cols={2} spacing="md">
                <Stack gap="xs">
                  <Group gap="xs">
                    <ThemeIcon size="lg" radius="xl" color="orange" variant="light">
                      <Download size={18} />
                    </ThemeIcon>
                    <div>
                      <Text size="sm" fw={600}>Step 1: Strava</Text>
                      <Text size="xs" c="dimmed">Import History</Text>
                    </div>
                  </Group>
                  <List size="xs" spacing="xs">
                    <List.Item>Import rides from any date</List.Item>
                    <List.Item>Up to 2 years of data</List.Item>
                    <List.Item>One-time setup</List.Item>
                  </List>
                </Stack>

                <Stack gap="xs">
                  <Group gap="xs">
                    <ThemeIcon size="lg" radius="xl" color="blue" variant="light">
                      <Zap size={18} />
                    </ThemeIcon>
                    <div>
                      <Text size="sm" fw={600}>Step 2: Garmin</Text>
                      <Text size="xs" c="dimmed">Auto-Sync</Text>
                    </div>
                  </Group>
                  <List size="xs" spacing="xs">
                    <List.Item>Automatic sync after rides</List.Item>
                    <List.Item>No manual sync needed</List.Item>
                    <List.Item>Detailed metrics</List.Item>
                  </List>
                </Stack>
              </SimpleGrid>
            </Card>

            <Alert color="cyan" variant="light" icon={<AlertCircle size={20} />}>
              <Text size="xs">
                <strong>Why both?</strong> Strava excels at importing historical data, while Garmin provides automatic
                real-time syncing. Together, you get complete history + effortless future updates!
              </Text>
            </Alert>

            <Group justify="flex-end" mt="xl">
              <Button onClick={nextStep} size="md" style={{ backgroundColor: '#FC4C02', color: 'white' }}>
                Get Started →
              </Button>
            </Group>
          </Stack>
        </Stepper.Step>

        {/* Step 2: Strava Import */}
        <Stepper.Step label="Import History" description="From Strava">
          <Stack gap="md" mt="xl">
            <Text size="sm" fw={500}>
              How far back do you want to import activities?
            </Text>

            <Radio.Group value={historicalPeriod} onChange={setHistoricalPeriod}>
              <Stack gap="xs">
                <Radio value="3_months" label="Last 3 months" />
                <Radio value="6_months" label="Last 6 months" />
                <Radio
                  value="1_year"
                  label={
                    <Group gap="xs">
                      <Text>Last 1 year</Text>
                      <Badge size="xs" color="blue">Recommended</Badge>
                    </Group>
                  }
                />
                <Radio value="2_years" label="Last 2 years" />
                <Radio value="all" label="All time (everything from Strava)" />
              </Stack>
            </Radio.Group>

            <Alert color="blue" variant="light" icon={<Calendar size={16} />}>
              <Text size="xs">
                Strava can import activities from any date. This is a one-time import of your history.
                Large imports (1+ years) may take 5-10 minutes.
              </Text>
            </Alert>

            {importing && (
              <Paper withBorder p="md">
                <Stack gap="xs">
                  <Group justify="space-between" align="center">
                    <Text size="sm" fw={500}>
                      Importing from Strava...
                    </Text>
                    <Badge color="orange" variant="light" size="sm">
                      {importProgress}%
                    </Badge>
                  </Group>
                  <Progress value={importProgress} animated color="orange" />
                  <Text size="xs" c="dimmed">
                    {importStatus || (importProgress < 100 ? 'Fetching activities and GPS data from Strava...' : 'Import complete!')}
                  </Text>
                </Stack>
              </Paper>
            )}

            {importResults && importResults.errors === 0 && importResults.imported > 0 && (
              <Alert color="green" variant="light" icon={<CheckCircle size={20} />}>
                <Text size="sm" fw={600}>Import Successful!</Text>
                <Text size="xs">
                  Imported {importResults.imported} rides
                  {importResults.skipped > 0 && ` (${importResults.skipped} duplicates skipped)`}
                </Text>
              </Alert>
            )}

            {importResults && importResults.totalActivities === 0 && (
              <Alert color="yellow" variant="light" icon={<AlertCircle size={20} />}>
                <Text size="sm" fw={600}>No Activities Found</Text>
                <Text size="xs">
                  No cycling activities were found in Strava for the selected date range.
                  Try selecting a longer time period.
                </Text>
              </Alert>
            )}

            {importResults && importResults.imported === 0 && importResults.skipped > 0 && (
              <Alert color="blue" variant="light" icon={<CheckCircle size={20} />}>
                <Text size="sm" fw={600}>Already Imported</Text>
                <Text size="xs">
                  All {importResults.skipped} activities in this date range have already been imported.
                </Text>
              </Alert>
            )}

            {importResults && importResults.errors > 0 && (
              <Alert color="red" variant="light" icon={<AlertCircle size={20} />}>
                <Text size="sm" fw={600}>Import Failed</Text>
                <Text size="xs">
                  {importResults.errorMessage || 'An error occurred during import. Please try again.'}
                </Text>
              </Alert>
            )}

            <Group justify="space-between" mt="xl">
              <Button variant="subtle" onClick={prevStep}>
                ← Back
              </Button>
              <Button
                onClick={stravaConnected ? handleStravaImport : () => {
                  // Redirect to Import page for Strava OAuth
                  window.location.href = '/import';
                }}
                loading={importing}
                disabled={importing}
                style={{ backgroundColor: '#FC4C02', color: 'white' }}
              >
                {stravaConnected ? 'Start Import' : 'Connect Strava →'}
              </Button>
            </Group>
          </Stack>
        </Stepper.Step>

        {/* Step 3: Garmin Setup */}
        <Stepper.Step label="Enable Auto-Sync" description="With Garmin">
          <Stack gap="md" mt="xl">
            {importResults && (
              <Alert color="green" variant="light" icon={<Check size={20} />}>
                <Text size="sm" fw={600}>✅ Historical rides imported from Strava</Text>
                <Text size="xs">
                  Found {importResults.imported} rides from your selected time period
                </Text>
              </Alert>
            )}

            <Text size="sm">
              Now let's set up automatic syncing for future rides:
            </Text>

            <Card withBorder p="md">
              <Stack gap="md">
                <Group gap="xs">
                  <ThemeIcon size="xl" radius="xl" color="blue" variant="light">
                    <Zap size={24} />
                  </ThemeIcon>
                  <div>
                    <Text size="md" fw={600}>Garmin Auto-Sync</Text>
                    <Text size="xs" c="dimmed">Automatic after each activity</Text>
                  </div>
                </Group>

                <List size="sm" spacing="xs">
                  <List.Item icon={<Check size={16} color="green" />}>
                    Rides appear automatically after syncing to Garmin Connect
                  </List.Item>
                  <List.Item icon={<Check size={16} color="green" />}>
                    No manual sync button needed
                  </List.Item>
                  <List.Item icon={<Check size={16} color="green" />}>
                    More detailed metrics (power, cadence, heart rate)
                  </List.Item>
                  <List.Item icon={<Check size={16} color="green" />}>
                    Works with all Garmin cycling computers and watches
                  </List.Item>
                </List>
              </Stack>
            </Card>

            <Alert color="yellow" variant="light">
              <Text size="xs">
                <strong>Note:</strong> Garmin auto-sync only works for activities from today forward.
                That's why we imported your history from Strava first!
              </Text>
            </Alert>

            <Group justify="space-between" mt="xl">
              <Button variant="subtle" onClick={prevStep}>
                ← Back
              </Button>
              <Group>
                <Button variant="subtle" onClick={nextStep}>
                  Skip for Now
                </Button>
                <Button
                  onClick={() => {
                    if (garminConnected) {
                      nextStep();
                    } else {
                      // TODO: Redirect to Garmin OAuth
                      window.location.href = '/integrations/garmin';
                    }
                  }}
                  style={{ backgroundColor: '#007CC3', color: 'white' }}
                >
                  {garminConnected ? 'Continue →' : 'Connect Garmin →'}
                </Button>
              </Group>
            </Group>
          </Stack>
        </Stepper.Step>

        {/* Step 4: Complete */}
        <Stepper.Completed>
          <Stack gap="lg" mt="xl" align="center">
            <ThemeIcon size={80} radius={80} color="green" variant="light">
              <CheckCircle size={48} />
            </ThemeIcon>

            <div style={{ textAlign: 'center' }}>
              <Text size="xl" fw={600} mb="xs">
                You're All Set!
              </Text>
              <Text size="sm" c="dimmed">
                Your cycling history is imported and auto-sync is enabled
              </Text>
            </div>

            <Paper withBorder p="lg" w="100%">
              <Stack gap="md">
                <Group>
                  <ThemeIcon size="lg" color="green" variant="light">
                    <Check size={20} />
                  </ThemeIcon>
                  <div>
                    <Text size="sm" fw={500}>
                      {importResults?.imported || 0} historical rides imported from Strava
                    </Text>
                  </div>
                </Group>

                <Group>
                  <ThemeIcon size="lg" color="green" variant="light">
                    <Check size={20} />
                  </ThemeIcon>
                  <div>
                    <Text size="sm" fw={500}>
                      {garminConnected ? 'Garmin auto-sync enabled' : 'Ready to connect Garmin'}
                    </Text>
                  </div>
                </Group>
              </Stack>
            </Paper>

            <Alert color="blue" variant="light" w="100%">
              <Text size="xs">
                Future rides will sync automatically when you upload them to Garmin Connect.
                No manual sync needed!
              </Text>
            </Alert>

            <Button
              onClick={() => {
                onClose();
                navigate('/training-dashboard');
              }}
              size="md"
              fullWidth
              style={{ backgroundColor: '#007CC3', color: 'white' }}
            >
              View My Rides →
            </Button>
          </Stack>
        </Stepper.Completed>
      </Stepper>
    </Modal>
  );
};

export default ImportWizard;
