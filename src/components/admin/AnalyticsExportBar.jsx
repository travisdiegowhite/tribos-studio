/**
 * Analytics Export Bar
 * Reusable component for CSV export and Claude AI analysis in admin tabs
 */

import { useState } from 'react';
import {
  Group,
  Button,
  Modal,
  Text,
  Stack,
  Loader,
  CopyButton,
  ActionIcon,
  Tooltip,
  ScrollArea,
  Alert,
} from '@mantine/core';
import { Check, Copy, DownloadSimple, Sparkle, Warning } from '@phosphor-icons/react';
import { downloadCSV } from '../../utils/adminExport';
import { analyzeAnalytics } from '../../services/adminService';

export default function AnalyticsExportBar({ onExport, exportFilename, analyticsData, analysisType }) {
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [analysisError, setAnalysisError] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);

  function handleExport() {
    const csv = onExport();
    if (csv) {
      const date = new Date().toISOString().split('T')[0];
      downloadCSV(csv, `${exportFilename}-${date}.csv`);
    }
  }

  async function handleAnalyze() {
    setModalOpen(true);
    setAnalysisLoading(true);
    setAnalysisError(null);
    setAnalysisResult(null);
    try {
      const result = await analyzeAnalytics(analyticsData, analysisType);
      setAnalysisResult(result.analysis);
    } catch (err) {
      console.error('Analysis failed:', err);
      setAnalysisError(err.message);
    } finally {
      setAnalysisLoading(false);
    }
  }

  return (
    <>
      <Group gap="xs">
        <Button
          leftSection={<DownloadSimple size={16} />}
          variant="light"
          size="xs"
          onClick={handleExport}
        >
          Export CSV
        </Button>
        <Button
          leftSection={<Sparkle size={16} />}
          variant="light"
          color="violet"
          size="xs"
          onClick={handleAnalyze}
          loading={analysisLoading && !modalOpen}
        >
          Analyze with Claude
        </Button>
      </Group>

      <Modal
        opened={modalOpen}
        onClose={() => setModalOpen(false)}
        title={
          <Group gap="xs">
            <Sparkle size={20} color="var(--mantine-color-violet-6)" />
            <Text fw={600}>AI Analytics Analysis</Text>
          </Group>
        }
        size="lg"
      >
        {analysisLoading && (
          <Stack align="center" py="xl" gap="md">
            <Loader size="md" color="violet" />
            <Text size="sm" c="dimmed">Analyzing your data with Claude...</Text>
          </Stack>
        )}

        {analysisError && (
          <Alert icon={<Warning size={16} />} color="red" title="Analysis Failed">
            {analysisError}
          </Alert>
        )}

        {analysisResult && (
          <Stack gap="md">
            <Group justify="flex-end">
              <CopyButton value={analysisResult}>
                {({ copied, copy }) => (
                  <Tooltip label={copied ? 'Copied' : 'Copy analysis'}>
                    <ActionIcon variant="light" color={copied ? 'green' : 'gray'} onClick={copy}>
                      {copied ? <Check size={16} /> : <Copy size={16} />}
                    </ActionIcon>
                  </Tooltip>
                )}
              </CopyButton>
            </Group>
            <ScrollArea.Autosize mah={500}>
              <Text
                size="sm"
                style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}
              >
                {analysisResult}
              </Text>
            </ScrollArea.Autosize>
          </Stack>
        )}
      </Modal>
    </>
  );
}
