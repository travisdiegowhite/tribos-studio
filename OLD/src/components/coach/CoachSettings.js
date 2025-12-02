import React, { useState, useEffect } from 'react';
import {
  Container,
  Card,
  Title,
  Text,
  Stack,
  TextInput,
  Textarea,
  NumberInput,
  Button,
  Group,
  MultiSelect,
  Alert,
  Divider,
  Badge,
  Paper,
  LoadingOverlay,
} from '@mantine/core';
import {
  Save,
  AlertCircle,
  CheckCircle,
  Award,
  Users,
  DollarSign,
  Calendar,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import coachService from '../../services/coachService';

/**
 * Coach Settings Page
 * Allows coaches to manage their profile and settings
 */
const CoachSettings = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  // State
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  // Form state
  const [bio, setBio] = useState('');
  const [certifications, setCertifications] = useState([]);
  const [specialties, setSpecialties] = useState([]);
  const [maxAthletes, setMaxAthletes] = useState(50);
  const [pricing, setPricing] = useState({
    currency: 'USD',
    individual: '',
    group: '',
    description: ''
  });
  const [availability, setAvailability] = useState({
    hours: '',
    timezone: '',
    notes: ''
  });

  // Predefined options
  const certificationOptions = [
    'USA Cycling Level 1',
    'USA Cycling Level 2',
    'USA Cycling Level 3',
    'British Cycling Coach',
    'UCI Cycling Coach',
    'Zwift Academy',
    'NASM CPT',
    'ACE Certified',
    'ISSA Certified',
    'Exercise Physiologist',
    'Sports Nutritionist'
  ];

  const specialtyOptions = [
    'Road Cycling',
    'Mountain Biking',
    'Gravel',
    'Time Trial',
    'Criterium',
    'Gran Fondo',
    'Ultra Endurance',
    'Sprint',
    'Climbing',
    'Beginner Training',
    'Masters (50+)',
    'Youth Development',
    'Power Training',
    'Indoor Training',
    'Recovery & Injury Prevention'
  ];

  useEffect(() => {
    if (!user) return;
    loadCoachProfile();
  }, [user]);

  const loadCoachProfile = async () => {
    setLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await coachService.getCoachProfile(user.id);

      if (fetchError) throw fetchError;

      if (data) {
        setBio(data.coach_bio || '');
        setCertifications(data.coach_certifications || []);
        setSpecialties(data.coach_specialties || []);
        setMaxAthletes(data.max_athletes || 50);

        if (data.coach_pricing) {
          setPricing({
            currency: data.coach_pricing.currency || 'USD',
            individual: data.coach_pricing.individual || '',
            group: data.coach_pricing.group || '',
            description: data.coach_pricing.description || ''
          });
        }

        if (data.coach_availability) {
          setAvailability({
            hours: data.coach_availability.hours || '',
            timezone: data.coach_availability.timezone || '',
            notes: data.coach_availability.notes || ''
          });
        }
      }
    } catch (err) {
      console.error('Error loading coach profile:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      const updates = {
        coach_bio: bio,
        coach_certifications: certifications,
        coach_specialties: specialties,
        max_athletes: maxAthletes,
        coach_pricing: pricing.individual || pricing.group ? pricing : null,
        coach_availability: availability.hours ? availability : null
      };

      const { error: saveError } = await coachService.updateCoachProfile(user.id, updates);

      if (saveError) throw saveError;

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      console.error('Error saving coach profile:', err);
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Container size="md" py="xl">
        <LoadingOverlay visible />
        <div style={{ height: 400 }} />
      </Container>
    );
  }

  return (
    <Container size="md" py="xl">
      <Stack spacing="xl">
        {/* Header */}
        <div>
          <Group spacing="xs" mb="xs">
            <Award size={28} />
            <Title order={1}>Coach Settings</Title>
          </Group>
          <Text c="dimmed">
            Manage your coach profile and preferences
          </Text>
        </div>

        {/* Success Alert */}
        {success && (
          <Alert
            icon={<CheckCircle size={20} />}
            title="Saved Successfully"
            color="green"
            withCloseButton
            onClose={() => setSuccess(false)}
          >
            Your coach profile has been updated.
          </Alert>
        )}

        {/* Error Alert */}
        {error && (
          <Alert
            icon={<AlertCircle size={20} />}
            title="Error"
            color="red"
            withCloseButton
            onClose={() => setError(null)}
          >
            {error}
          </Alert>
        )}

        {/* Profile Information */}
        <Card shadow="sm" p="lg" radius="md" withBorder>
          <Stack spacing="md">
            <Group spacing="xs">
              <Award size={20} />
              <Title order={3}>Profile Information</Title>
            </Group>

            <Textarea
              label="Coach Bio"
              placeholder="Tell athletes about yourself, your coaching philosophy, and experience..."
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              minRows={4}
              maxLength={500}
              description={`${bio.length}/500 characters`}
            />

            <MultiSelect
              label="Certifications"
              placeholder="Select your certifications"
              data={certificationOptions}
              value={certifications}
              onChange={setCertifications}
              searchable
              creatable
              getCreateLabel={(query) => `+ Add "${query}"`}
              onCreate={(query) => {
                setCertifications([...certifications, query]);
                return query;
              }}
              description="Add certifications to build credibility"
            />

            <MultiSelect
              label="Specialties"
              placeholder="Select your coaching specialties"
              data={specialtyOptions}
              value={specialties}
              onChange={setSpecialties}
              searchable
              creatable
              getCreateLabel={(query) => `+ Add "${query}"`}
              onCreate={(query) => {
                setSpecialties([...specialties, query]);
                return query;
              }}
              description="Help athletes find coaches with relevant expertise"
            />
          </Stack>
        </Card>

        {/* Capacity Settings */}
        <Card shadow="sm" p="lg" radius="md" withBorder>
          <Stack spacing="md">
            <Group spacing="xs">
              <Users size={20} />
              <Title order={3}>Capacity Settings</Title>
            </Group>

            <NumberInput
              label="Maximum Athletes"
              description="Maximum number of athletes you want to coach simultaneously"
              value={maxAthletes}
              onChange={setMaxAthletes}
              min={1}
              max={500}
              step={5}
            />

            <Paper p="md" withBorder>
              <Stack spacing="xs">
                <Text size="sm" weight={500}>Current Status</Text>
                <Group spacing="xs">
                  <Badge size="lg" variant="light" color="blue">
                    0 / {maxAthletes} Athletes
                  </Badge>
                  <Text size="sm" c="dimmed">
                    {maxAthletes} slots available
                  </Text>
                </Group>
              </Stack>
            </Paper>
          </Stack>
        </Card>

        {/* Pricing (Optional) */}
        <Card shadow="sm" p="lg" radius="md" withBorder>
          <Stack spacing="md">
            <div>
              <Group spacing="xs" mb="xs">
                <DollarSign size={20} />
                <Title order={3}>Pricing</Title>
              </Group>
              <Text size="sm" c="dimmed">
                Optional: Set your coaching rates (athletes will see this when invited)
              </Text>
            </div>

            <Group grow>
              <TextInput
                label="Individual Coaching"
                placeholder="$200/month"
                value={pricing.individual}
                onChange={(e) => setPricing({ ...pricing, individual: e.target.value })}
                description="One-on-one coaching rate"
              />
              <TextInput
                label="Group Coaching"
                placeholder="$100/month"
                value={pricing.group}
                onChange={(e) => setPricing({ ...pricing, group: e.target.value })}
                description="Group coaching rate"
              />
            </Group>

            <Textarea
              label="Pricing Details"
              placeholder="What's included in your coaching packages..."
              value={pricing.description}
              onChange={(e) => setPricing({ ...pricing, description: e.target.value })}
              minRows={2}
              description="Describe what's included"
            />
          </Stack>
        </Card>

        {/* Availability (Optional) */}
        <Card shadow="sm" p="lg" radius="md" withBorder>
          <Stack spacing="md">
            <div>
              <Group spacing="xs" mb="xs">
                <Calendar size={20} />
                <Title order={3}>Availability</Title>
              </Group>
              <Text size="sm" c="dimmed">
                Optional: Let athletes know when you're typically available
              </Text>
            </div>

            <Group grow>
              <TextInput
                label="Typical Hours"
                placeholder="Mon-Fri 6am-8pm"
                value={availability.hours}
                onChange={(e) => setAvailability({ ...availability, hours: e.target.value })}
              />
              <TextInput
                label="Timezone"
                placeholder="EST / PST / UTC"
                value={availability.timezone}
                onChange={(e) => setAvailability({ ...availability, timezone: e.target.value })}
              />
            </Group>

            <Textarea
              label="Additional Notes"
              placeholder="Response time, meeting frequency, etc."
              value={availability.notes}
              onChange={(e) => setAvailability({ ...availability, notes: e.target.value })}
              minRows={2}
            />
          </Stack>
        </Card>

        {/* Actions */}
        <Divider />

        <Group position="apart">
          <Button
            variant="subtle"
            onClick={() => navigate('/coach')}
          >
            Cancel
          </Button>
          <Button
            leftIcon={<Save size={20} />}
            onClick={handleSave}
            loading={saving}
          >
            Save Changes
          </Button>
        </Group>
      </Stack>
    </Container>
  );
};

export default CoachSettings;
