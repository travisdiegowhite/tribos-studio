import React from 'react';
import { Container, Title, Text, Stack, Card, Alert, Divider } from '@mantine/core';
import { BookOpen } from 'lucide-react';
import BreadcrumbNav from './BreadcrumbNav';

/**
 * Training Research & Methodology Page
 * Dedicated page explaining the scientific basis for our training methodologies
 */
const TrainingResearch = () => {
  const breadcrumbs = [
    { label: 'Training', path: '/training' },
    { label: 'Research & Methodology', path: '/training-research' }
  ];

  return (
    <Container size="md" py="xl">
      <BreadcrumbNav items={breadcrumbs} />

      <Stack gap="xl" mt="xl">
        {/* Header */}
        <div style={{ textAlign: 'center' }}>
          <BookOpen size={48} style={{ margin: '0 auto 16px', color: 'var(--mantine-color-blue-6)' }} />
          <Title order={1} mb="sm">Research & Methodology</Title>
          <Text size="lg" c="dimmed" maw={700} mx="auto">
            Our training plans and workouts are based on peer-reviewed research and proven methodologies from leading sports scientists and coaches.
          </Text>
        </div>

        <Divider />

        {/* Polarized Training */}
        <Card withBorder p="lg">
          <Title order={3} mb="sm">Polarized Training (80/20 Method)</Title>
          <Text size="sm" c="dimmed" mb="md">
            <strong>Why we use it:</strong> Studies show that 80% low-intensity (Zone 1-2) and 20% high-intensity (Zone 5+) training
            produces superior endurance adaptations compared to threshold-heavy approaches, especially for time-constrained athletes.
            This approach minimizes time in the "grey zone" (Zone 3-4) where fatigue accumulates without optimal adaptation.
          </Text>
          <Text size="xs" c="dimmed" fs="italic">
            Sources: Seiler & Tønnessen (Norwegian endurance studies), Stöggl & Sperlich (2014 meta-analysis on polarized training)
          </Text>
        </Card>

        {/* Pyramidal Training */}
        <Card withBorder p="lg">
          <Title order={3} mb="sm">Pyramidal Training Distribution</Title>
          <Text size="sm" c="dimmed" mb="md">
            <strong>Why we use it:</strong> A 2024 meta-analysis found the 67.5% low / 23.4% moderate / 9.1% high intensity
            distribution to be highly effective for recreational cyclists, providing sustainable long-term performance gains.
            This balanced approach allows for more moderate-intensity work than polarized training while still emphasizing aerobic development.
          </Text>
          <Text size="xs" c="dimmed" fs="italic">
            Sources: 2024 training intensity distribution meta-analysis for recreational endurance cyclists
          </Text>
        </Card>

        {/* Sweet Spot Training */}
        <Card withBorder p="lg">
          <Title order={3} mb="sm">Sweet Spot Training (88-94% FTP)</Title>
          <Text size="sm" c="dimmed" mb="md">
            <strong>Why we use it:</strong> Sweet spot training (high Zone 3) provides an optimal balance between training
            stress and recovery, delivering FTP improvements in 6-8 weeks with less fatigue than threshold-only training.
            This zone is particularly effective for time-constrained athletes seeking maximum return on training investment.
          </Text>
          <Text size="xs" c="dimmed" fs="italic">
            Sources: Coggan & Allen power-based training research, time-efficient FTP development protocols
          </Text>
        </Card>

        {/* VO2max Intervals */}
        <Card withBorder p="lg">
          <Title order={3} mb="sm">VO2max Interval Protocols</Title>
          <Text size="sm" c="dimmed" mb="md">
            <strong>Why we use it:</strong> Our 30/30, 40/20, and Billat interval protocols are proven to maximize
            aerobic capacity gains. Research shows these short, intense intervals allow more total time at VO2max compared to
            longer intervals, leading to greater adaptations. The brief recovery periods maintain high cardiac output while
            allowing neuromuscular recovery.
          </Text>
          <Text size="xs" c="dimmed" fs="italic">
            Sources: Billat VO2max interval research, Tabata protocol studies, HIIT effectiveness meta-analyses
          </Text>
        </Card>

        {/* TSS & Performance Management */}
        <Card withBorder p="lg">
          <Title order={3} mb="sm">Training Stress Score (TSS) & Performance Management</Title>
          <Text size="sm" c="dimmed" mb="md">
            <strong>Why we use it:</strong> TSS provides an objective measure of training load that accounts for both duration
            and intensity. Our updated weekly TSS targets reflect 2024-2025 best practices:
          </Text>
          <Stack gap="xs" ml="md" mb="md">
            <Text size="sm" c="dimmed">• <strong>Beginner:</strong> 200-350 TSS/week</Text>
            <Text size="sm" c="dimmed">• <strong>Intermediate:</strong> 350-600 TSS/week</Text>
            <Text size="sm" c="dimmed">• <strong>Advanced:</strong> 600-900 TSS/week</Text>
          </Stack>
          <Text size="sm" c="dimmed" mb="md">
            Combined with CTL (Chronic Training Load), ATL (Acute Training Load), and TSB (Training Stress Balance),
            these metrics help prevent overtraining while optimizing adaptation.
          </Text>
          <Text size="xs" c="dimmed" fs="italic">
            Sources: Coggan Training Stress Score methodology, CTL/ATL/TSB performance management research
          </Text>
        </Card>

        {/* Periodization */}
        <Card withBorder p="lg">
          <Title order={3} mb="sm">Periodization (Base → Build → Peak → Taper)</Title>
          <Text size="sm" c="dimmed" mb="md">
            <strong>Why we use it:</strong> Traditional periodization with recovery weeks every 3-4 weeks maximizes
            adaptations while preventing overtraining. Research consistently shows periodized training outperforms
            non-periodized approaches for both performance gains and injury prevention. The progressive nature allows
            for systematic overload followed by recovery.
          </Text>
          <Text size="xs" c="dimmed" fs="italic">
            Sources: Block periodization meta-analysis (2024), traditional periodization effectiveness studies
          </Text>
        </Card>

        {/* Disclaimer */}
        <Alert variant="light" color="blue">
          <Text size="sm" fw={600} mb="xs">Important Note</Text>
          <Text size="sm">
            While we reference research to inform our training methodologies, individual responses
            to training vary significantly. Factors including genetics, training history, recovery capacity,
            nutrition, sleep, and life stress all influence adaptation.
          </Text>
          <Text size="sm" mt="xs">
            All training plans should be adjusted based on your personal response. Consult with a qualified coach
            or healthcare provider before beginning any new training program.
          </Text>
        </Alert>

        {/* Additional Resources */}
        <Card withBorder p="lg" style={{ backgroundColor: 'var(--mantine-color-gray-0)' }}>
          <Title order={4} mb="sm">Learn More</Title>
          <Text size="sm" c="dimmed">
            For more detailed information about training science and methodology, we recommend consulting:
          </Text>
          <Stack gap="xs" ml="md" mt="sm">
            <Text size="sm" c="dimmed">• "Training and Racing with a Power Meter" by Hunter Allen and Andrew Coggan</Text>
            <Text size="sm" c="dimmed">• "The Cyclist's Training Bible" by Joe Friel</Text>
            <Text size="sm" c="dimmed">• Peer-reviewed journals: Medicine & Science in Sports & Exercise, Journal of Applied Physiology</Text>
          </Stack>
        </Card>
      </Stack>
    </Container>
  );
};

export default TrainingResearch;
