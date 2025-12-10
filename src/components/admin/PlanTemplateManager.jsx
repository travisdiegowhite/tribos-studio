/**
 * PlanTemplateManager Component
 * Admin interface for managing training plan templates
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Stack,
  Paper,
  Group,
  Text,
  Title,
  Button,
  Table,
  Badge,
  ActionIcon,
  TextInput,
  Textarea,
  NumberInput,
  Select,
  Modal,
  Switch,
  Loader,
  Alert,
  Menu,
  Tooltip,
  ScrollArea,
  Card,
  SimpleGrid,
  Divider,
} from '@mantine/core';
import {
  IconPlus,
  IconEdit,
  IconTrash,
  IconDotsVertical,
  IconSearch,
  IconRefresh,
  IconCheck,
  IconAlertCircle,
  IconEye,
  IconCopy,
  IconStar,
  IconStarFilled,
  IconArrowUp,
  IconArrowDown,
  IconUpload,
  IconDownload,
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { useAuth } from '../../contexts/AuthContext';
import {
  getAllPlanTemplates,
  upsertPlanTemplate,
  deletePlanTemplate,
  clearTemplateCache,
} from '../../services/trainingTemplates';
import { TRAINING_PLAN_TEMPLATES } from '../../data/trainingPlanTemplates';
import { FITNESS_LEVELS, TRAINING_PHASES } from '../../utils/trainingPlans';

const METHODOLOGY_OPTIONS = [
  { value: 'polarized', label: 'Polarized Training' },
  { value: 'sweet_spot', label: 'Sweet Spot' },
  { value: 'pyramidal', label: 'Pyramidal' },
  { value: 'threshold', label: 'Threshold Focus' },
  { value: 'endurance', label: 'Endurance' },
];

const GOAL_OPTIONS = [
  { value: 'general_fitness', label: 'General Fitness' },
  { value: 'century', label: 'Century Ride' },
  { value: 'climbing', label: 'Climbing' },
  { value: 'racing', label: 'Racing' },
  { value: 'gran_fondo', label: 'Gran Fondo' },
  { value: 'base_building', label: 'Base Building' },
];

const FITNESS_LEVEL_OPTIONS = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
];

export default function PlanTemplateManager() {
  const { user } = useAuth();
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [editForm, setEditForm] = useState({
    id: '',
    name: '',
    description: '',
    duration: 8,
    methodology: 'polarized',
    goal: 'general_fitness',
    fitnessLevel: 'intermediate',
    hoursPerWeek: { min: 5, max: 10 },
    weeklyTSS: { min: 200, max: 400 },
    targetAudience: '',
    phases: [],
    weekTemplates: {},
    expectedGains: {},
  });

  // Load templates
  const loadTemplates = useCallback(async () => {
    try {
      setLoading(true);
      clearTemplateCache();
      const data = await getAllPlanTemplates();
      setTemplates(data);
    } catch (err) {
      console.error('Error loading templates:', err);
      notifications.show({
        title: 'Error',
        message: 'Failed to load templates',
        color: 'red',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  // Filter templates
  const filteredTemplates = templates.filter((t) =>
    t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.methodology?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Open edit modal
  const openEditModal = (template = null) => {
    if (template) {
      setEditForm({
        id: template.id,
        name: template.name,
        description: template.description || '',
        duration: template.duration,
        methodology: template.methodology,
        goal: template.goal,
        fitnessLevel: template.fitnessLevel,
        hoursPerWeek: template.hoursPerWeek || { min: 5, max: 10 },
        weeklyTSS: template.weeklyTSS || { min: 200, max: 400 },
        targetAudience: template.targetAudience || '',
        phases: template.phases || [],
        weekTemplates: template.weekTemplates || {},
        expectedGains: template.expectedGains || {},
      });
    } else {
      setEditForm({
        id: '',
        name: '',
        description: '',
        duration: 8,
        methodology: 'polarized',
        goal: 'general_fitness',
        fitnessLevel: 'intermediate',
        hoursPerWeek: { min: 5, max: 10 },
        weeklyTSS: { min: 200, max: 400 },
        targetAudience: '',
        phases: [],
        weekTemplates: {},
        expectedGains: {},
      });
    }
    setSelectedTemplate(template);
    setEditModalOpen(true);
  };

  // Open view modal
  const openViewModal = (template) => {
    setSelectedTemplate(template);
    setViewModalOpen(true);
  };

  // Open delete confirmation
  const openDeleteConfirm = (template) => {
    setSelectedTemplate(template);
    setDeleteConfirmOpen(true);
  };

  // Save template
  const handleSave = async () => {
    if (!editForm.name || !editForm.id) {
      notifications.show({
        title: 'Validation Error',
        message: 'Name and ID are required',
        color: 'red',
      });
      return;
    }

    try {
      setSaving(true);
      const result = await upsertPlanTemplate(editForm, user?.id);

      if (result.success) {
        notifications.show({
          title: 'Success',
          message: selectedTemplate ? 'Template updated' : 'Template created',
          color: 'green',
          icon: <IconCheck size={18} />,
        });
        setEditModalOpen(false);
        loadTemplates();
      } else {
        throw new Error(result.error || 'Failed to save');
      }
    } catch (err) {
      console.error('Error saving template:', err);
      notifications.show({
        title: 'Error',
        message: err.message || 'Failed to save template',
        color: 'red',
      });
    } finally {
      setSaving(false);
    }
  };

  // Delete template
  const handleDelete = async () => {
    if (!selectedTemplate) return;

    try {
      setSaving(true);
      const result = await deletePlanTemplate(selectedTemplate.id);

      if (result.success) {
        notifications.show({
          title: 'Deleted',
          message: 'Template has been deactivated',
          color: 'green',
          icon: <IconCheck size={18} />,
        });
        setDeleteConfirmOpen(false);
        loadTemplates();
      } else {
        throw new Error(result.error || 'Failed to delete');
      }
    } catch (err) {
      console.error('Error deleting template:', err);
      notifications.show({
        title: 'Error',
        message: err.message || 'Failed to delete template',
        color: 'red',
      });
    } finally {
      setSaving(false);
    }
  };

  // Seed templates from JS files
  const seedFromLocalFiles = async () => {
    try {
      setSaving(true);
      let successCount = 0;

      for (const template of Object.values(TRAINING_PLAN_TEMPLATES)) {
        const result = await upsertPlanTemplate(template, user?.id);
        if (result.success) successCount++;
      }

      notifications.show({
        title: 'Seeding Complete',
        message: `Imported ${successCount} templates from local files`,
        color: 'green',
        icon: <IconCheck size={18} />,
      });
      loadTemplates();
    } catch (err) {
      console.error('Error seeding templates:', err);
      notifications.show({
        title: 'Error',
        message: 'Failed to seed templates',
        color: 'red',
      });
    } finally {
      setSaving(false);
    }
  };

  // Get methodology badge color
  const getMethodologyColor = (methodology) => {
    const colors = {
      polarized: 'blue',
      sweet_spot: 'orange',
      pyramidal: 'violet',
      threshold: 'red',
      endurance: 'green',
    };
    return colors[methodology] || 'gray';
  };

  if (loading) {
    return (
      <Stack align="center" py="xl">
        <Loader size="lg" />
        <Text c="dimmed">Loading templates...</Text>
      </Stack>
    );
  }

  return (
    <Stack spacing="md">
      {/* Header Actions */}
      <Paper p="md" withBorder radius="md">
        <Group position="apart">
          <Group>
            <TextInput
              placeholder="Search templates..."
              leftSection={<IconSearch size={16} />}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              w={300}
            />
            <Button
              variant="subtle"
              leftSection={<IconRefresh size={16} />}
              onClick={loadTemplates}
            >
              Refresh
            </Button>
          </Group>
          <Group>
            <Button
              variant="light"
              leftSection={<IconUpload size={16} />}
              onClick={seedFromLocalFiles}
              loading={saving}
            >
              Import from JS
            </Button>
            <Button
              leftSection={<IconPlus size={16} />}
              onClick={() => openEditModal()}
            >
              New Template
            </Button>
          </Group>
        </Group>
      </Paper>

      {/* Templates Summary */}
      <SimpleGrid cols={4} spacing="md">
        <Card padding="sm" withBorder>
          <Text size="xs" c="dimmed" tt="uppercase">Total Templates</Text>
          <Text size="xl" fw={600}>{templates.length}</Text>
        </Card>
        <Card padding="sm" withBorder>
          <Text size="xs" c="dimmed" tt="uppercase">Polarized</Text>
          <Text size="xl" fw={600} c="blue">
            {templates.filter((t) => t.methodology === 'polarized').length}
          </Text>
        </Card>
        <Card padding="sm" withBorder>
          <Text size="xs" c="dimmed" tt="uppercase">Sweet Spot</Text>
          <Text size="xl" fw={600} c="orange">
            {templates.filter((t) => t.methodology === 'sweet_spot').length}
          </Text>
        </Card>
        <Card padding="sm" withBorder>
          <Text size="xs" c="dimmed" tt="uppercase">Other</Text>
          <Text size="xl" fw={600} c="gray">
            {templates.filter((t) => !['polarized', 'sweet_spot'].includes(t.methodology)).length}
          </Text>
        </Card>
      </SimpleGrid>

      {/* Templates Table */}
      <Paper withBorder radius="md">
        <ScrollArea>
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Name</Table.Th>
                <Table.Th>Duration</Table.Th>
                <Table.Th>Methodology</Table.Th>
                <Table.Th>Level</Table.Th>
                <Table.Th>Goal</Table.Th>
                <Table.Th>Hours/Week</Table.Th>
                <Table.Th style={{ width: 100 }}>Actions</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {filteredTemplates.length === 0 ? (
                <Table.Tr>
                  <Table.Td colSpan={7}>
                    <Text ta="center" c="dimmed" py="lg">
                      {searchQuery ? 'No templates match your search' : 'No templates found. Import from JS files or create a new one.'}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ) : (
                filteredTemplates.map((template) => (
                  <Table.Tr key={template.id}>
                    <Table.Td>
                      <Text fw={500}>{template.name}</Text>
                      <Text size="xs" c="dimmed" lineClamp={1}>
                        {template.description}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Badge variant="light">{template.duration} weeks</Badge>
                    </Table.Td>
                    <Table.Td>
                      <Badge color={getMethodologyColor(template.methodology)} variant="light">
                        {template.methodology?.replace('_', ' ')}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Badge
                        variant="outline"
                        color={
                          template.fitnessLevel === 'beginner'
                            ? 'green'
                            : template.fitnessLevel === 'advanced'
                            ? 'red'
                            : 'blue'
                        }
                      >
                        {template.fitnessLevel}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">{template.goal?.replace('_', ' ')}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">
                        {template.hoursPerWeek?.min}-{template.hoursPerWeek?.max}h
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Group spacing={4} noWrap>
                        <Tooltip label="View">
                          <ActionIcon
                            variant="subtle"
                            onClick={() => openViewModal(template)}
                          >
                            <IconEye size={16} />
                          </ActionIcon>
                        </Tooltip>
                        <Tooltip label="Edit">
                          <ActionIcon
                            variant="subtle"
                            color="blue"
                            onClick={() => openEditModal(template)}
                          >
                            <IconEdit size={16} />
                          </ActionIcon>
                        </Tooltip>
                        <Menu shadow="md" width={160}>
                          <Menu.Target>
                            <ActionIcon variant="subtle">
                              <IconDotsVertical size={16} />
                            </ActionIcon>
                          </Menu.Target>
                          <Menu.Dropdown>
                            <Menu.Item
                              leftSection={<IconCopy size={14} />}
                              onClick={() => {
                                const clone = { ...template, id: `${template.id}_copy`, name: `${template.name} (Copy)` };
                                openEditModal(clone);
                              }}
                            >
                              Duplicate
                            </Menu.Item>
                            <Menu.Divider />
                            <Menu.Item
                              color="red"
                              leftSection={<IconTrash size={14} />}
                              onClick={() => openDeleteConfirm(template)}
                            >
                              Delete
                            </Menu.Item>
                          </Menu.Dropdown>
                        </Menu>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))
              )}
            </Table.Tbody>
          </Table>
        </ScrollArea>
      </Paper>

      {/* Edit Modal */}
      <Modal
        opened={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        title={
          <Text fw={600}>
            {selectedTemplate ? 'Edit Template' : 'Create Template'}
          </Text>
        }
        size="lg"
      >
        <Stack spacing="md">
          <TextInput
            label="Template ID"
            description="Unique identifier (no spaces, use underscores)"
            placeholder="e.g., polarized_8_week"
            value={editForm.id}
            onChange={(e) => setEditForm({ ...editForm, id: e.target.value.toLowerCase().replace(/\s+/g, '_') })}
            required
            disabled={!!selectedTemplate}
          />
          <TextInput
            label="Name"
            placeholder="e.g., 8-Week Polarized Plan"
            value={editForm.name}
            onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
            required
          />
          <Textarea
            label="Description"
            placeholder="Describe what this plan offers..."
            value={editForm.description}
            onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
            minRows={2}
          />

          <SimpleGrid cols={3}>
            <NumberInput
              label="Duration (weeks)"
              value={editForm.duration}
              onChange={(v) => setEditForm({ ...editForm, duration: v })}
              min={1}
              max={52}
            />
            <Select
              label="Methodology"
              data={METHODOLOGY_OPTIONS}
              value={editForm.methodology}
              onChange={(v) => setEditForm({ ...editForm, methodology: v })}
            />
            <Select
              label="Fitness Level"
              data={FITNESS_LEVEL_OPTIONS}
              value={editForm.fitnessLevel}
              onChange={(v) => setEditForm({ ...editForm, fitnessLevel: v })}
            />
          </SimpleGrid>

          <Select
            label="Goal"
            data={GOAL_OPTIONS}
            value={editForm.goal}
            onChange={(v) => setEditForm({ ...editForm, goal: v })}
          />

          <SimpleGrid cols={2}>
            <div>
              <Text size="sm" fw={500} mb={4}>Hours per Week</Text>
              <Group>
                <NumberInput
                  label="Min"
                  size="xs"
                  value={editForm.hoursPerWeek.min}
                  onChange={(v) => setEditForm({ ...editForm, hoursPerWeek: { ...editForm.hoursPerWeek, min: v } })}
                  min={1}
                  max={30}
                  w={80}
                />
                <NumberInput
                  label="Max"
                  size="xs"
                  value={editForm.hoursPerWeek.max}
                  onChange={(v) => setEditForm({ ...editForm, hoursPerWeek: { ...editForm.hoursPerWeek, max: v } })}
                  min={1}
                  max={40}
                  w={80}
                />
              </Group>
            </div>
            <div>
              <Text size="sm" fw={500} mb={4}>Weekly TSS</Text>
              <Group>
                <NumberInput
                  label="Min"
                  size="xs"
                  value={editForm.weeklyTSS.min}
                  onChange={(v) => setEditForm({ ...editForm, weeklyTSS: { ...editForm.weeklyTSS, min: v } })}
                  min={50}
                  max={1500}
                  w={80}
                />
                <NumberInput
                  label="Max"
                  size="xs"
                  value={editForm.weeklyTSS.max}
                  onChange={(v) => setEditForm({ ...editForm, weeklyTSS: { ...editForm.weeklyTSS, max: v } })}
                  min={50}
                  max={2000}
                  w={80}
                />
              </Group>
            </div>
          </SimpleGrid>

          <Textarea
            label="Target Audience"
            placeholder="Who is this plan designed for?"
            value={editForm.targetAudience}
            onChange={(e) => setEditForm({ ...editForm, targetAudience: e.target.value })}
          />

          <Alert icon={<IconAlertCircle size={16} />} color="blue" variant="light">
            Week templates and phases can be edited in the JSON editor (coming soon).
          </Alert>

          <Group position="right" mt="md">
            <Button variant="subtle" onClick={() => setEditModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} loading={saving}>
              {selectedTemplate ? 'Update' : 'Create'}
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* View Modal */}
      <Modal
        opened={viewModalOpen}
        onClose={() => setViewModalOpen(false)}
        title={<Text fw={600}>{selectedTemplate?.name}</Text>}
        size="lg"
      >
        {selectedTemplate && (
          <Stack spacing="md">
            <Text>{selectedTemplate.description}</Text>

            <Divider />

            <SimpleGrid cols={2}>
              <div>
                <Text size="xs" c="dimmed" tt="uppercase">Duration</Text>
                <Text fw={500}>{selectedTemplate.duration} weeks</Text>
              </div>
              <div>
                <Text size="xs" c="dimmed" tt="uppercase">Methodology</Text>
                <Badge color={getMethodologyColor(selectedTemplate.methodology)}>
                  {selectedTemplate.methodology?.replace('_', ' ')}
                </Badge>
              </div>
              <div>
                <Text size="xs" c="dimmed" tt="uppercase">Fitness Level</Text>
                <Text fw={500}>{selectedTemplate.fitnessLevel}</Text>
              </div>
              <div>
                <Text size="xs" c="dimmed" tt="uppercase">Goal</Text>
                <Text fw={500}>{selectedTemplate.goal?.replace('_', ' ')}</Text>
              </div>
              <div>
                <Text size="xs" c="dimmed" tt="uppercase">Hours/Week</Text>
                <Text fw={500}>
                  {selectedTemplate.hoursPerWeek?.min}-{selectedTemplate.hoursPerWeek?.max}h
                </Text>
              </div>
              <div>
                <Text size="xs" c="dimmed" tt="uppercase">Weekly TSS</Text>
                <Text fw={500}>
                  {selectedTemplate.weeklyTSS?.min}-{selectedTemplate.weeklyTSS?.max}
                </Text>
              </div>
            </SimpleGrid>

            {selectedTemplate.phases && selectedTemplate.phases.length > 0 && (
              <>
                <Divider />
                <div>
                  <Text size="sm" fw={500} mb="xs">Training Phases</Text>
                  <Stack spacing={4}>
                    {selectedTemplate.phases.map((phase, i) => (
                      <Card key={i} padding="xs" withBorder>
                        <Group position="apart">
                          <Text fw={500} size="sm">{phase.phase}</Text>
                          <Badge size="xs">Weeks {phase.weeks?.join(', ')}</Badge>
                        </Group>
                        <Text size="xs" c="dimmed">{phase.focus}</Text>
                      </Card>
                    ))}
                  </Stack>
                </div>
              </>
            )}

            {selectedTemplate.expectedGains && Object.keys(selectedTemplate.expectedGains).length > 0 && (
              <>
                <Divider />
                <div>
                  <Text size="sm" fw={500} mb="xs">Expected Gains</Text>
                  <SimpleGrid cols={2}>
                    {Object.entries(selectedTemplate.expectedGains).map(([key, value]) => (
                      <div key={key}>
                        <Text size="xs" c="dimmed" tt="capitalize">{key}</Text>
                        <Text size="sm">{value}</Text>
                      </div>
                    ))}
                  </SimpleGrid>
                </div>
              </>
            )}
          </Stack>
        )}
      </Modal>

      {/* Delete Confirmation */}
      <Modal
        opened={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        title={<Text fw={600} c="red">Delete Template</Text>}
        size="sm"
      >
        <Stack>
          <Text>
            Are you sure you want to delete <strong>{selectedTemplate?.name}</strong>?
          </Text>
          <Text size="sm" c="dimmed">
            This action will deactivate the template. It can be restored later if needed.
          </Text>
          <Group position="right" mt="md">
            <Button variant="subtle" onClick={() => setDeleteConfirmOpen(false)}>
              Cancel
            </Button>
            <Button color="red" onClick={handleDelete} loading={saving}>
              Delete
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
