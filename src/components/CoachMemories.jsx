import { useState, useEffect } from 'react';
import {
  Modal,
  Stack,
  Group,
  Text,
  Button,
  Paper,
  ActionIcon,
  Badge,
  TextInput,
  Textarea,
  Select,
  Tabs,
  Loader,
  Alert,
  ThemeIcon,
  Divider,
} from '@mantine/core';
import {
  IconBrain,
  IconPlus,
  IconTrash,
  IconEdit,
  IconCheck,
  IconX,
  IconTarget,
  IconAlertCircle,
  IconTrophy,
  IconClock,
  IconCalendar,
  IconHeart,
  IconMoodSad,
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { useAuth } from '../contexts/AuthContext.jsx';
import { supabase } from '../lib/supabase';
import { tokens } from '../theme';

const MEMORY_CATEGORIES = [
  { value: 'goal', label: 'Goals', icon: IconTarget, color: 'blue' },
  { value: 'context', label: 'Life Context', icon: IconHeart, color: 'pink' },
  { value: 'obstacle', label: 'Obstacles', icon: IconAlertCircle, color: 'orange' },
  { value: 'pattern', label: 'Patterns', icon: IconClock, color: 'violet' },
  { value: 'win', label: 'Wins', icon: IconTrophy, color: 'lime' },
  { value: 'preference', label: 'Preferences', icon: IconCalendar, color: 'cyan' },
  { value: 'injury', label: 'Injuries', icon: IconMoodSad, color: 'red' },
  { value: 'schedule', label: 'Schedule', icon: IconCalendar, color: 'gray' },
];

const MEMORY_TYPES = [
  { value: 'short', label: 'This Week', description: 'Expires in 7 days' },
  { value: 'medium', label: 'This Month', description: 'Expires in 30 days' },
  { value: 'long', label: 'Long-term', description: 'Never expires' },
];

function CoachMemories({ opened, onClose }) {
  const { user } = useAuth();
  const [memories, setMemories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all');
  const [editingMemory, setEditingMemory] = useState(null);
  const [isAddingMemory, setIsAddingMemory] = useState(false);
  const [newMemory, setNewMemory] = useState({
    category: 'context',
    memory_type: 'long',
    content: ''
  });

  // Load memories
  useEffect(() => {
    if (opened && user?.id) {
      loadMemories();
    }
  }, [opened, user?.id]);

  const loadMemories = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('coach_memory')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setMemories(data || []);
    } catch (err) {
      console.error('Error loading memories:', err);
      notifications.show({
        title: 'Error',
        message: 'Failed to load memories',
        color: 'red'
      });
    } finally {
      setLoading(false);
    }
  };

  // Save new memory
  const handleAddMemory = async () => {
    if (!newMemory.content.trim()) return;

    try {
      const expiresAt = newMemory.memory_type === 'short'
        ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
        : newMemory.memory_type === 'medium'
          ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
          : null;

      const { data, error } = await supabase
        .from('coach_memory')
        .insert({
          user_id: user.id,
          memory_type: newMemory.memory_type,
          category: newMemory.category,
          content: newMemory.content.trim(),
          source_type: 'user_input',
          expires_at: expiresAt,
          user_modified: true,
          user_modified_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) throw error;

      setMemories(prev => [data, ...prev]);
      setNewMemory({ category: 'context', memory_type: 'long', content: '' });
      setIsAddingMemory(false);

      notifications.show({
        title: 'Memory Added',
        message: 'Your coach will remember this',
        color: 'lime'
      });
    } catch (err) {
      console.error('Error adding memory:', err);
      notifications.show({
        title: 'Error',
        message: 'Failed to add memory',
        color: 'red'
      });
    }
  };

  // Update memory
  const handleUpdateMemory = async (id, updates) => {
    try {
      const { error } = await supabase
        .from('coach_memory')
        .update({
          ...updates,
          user_modified: true,
          user_modified_at: new Date().toISOString()
        })
        .eq('id', id);

      if (error) throw error;

      setMemories(prev => prev.map(m =>
        m.id === id ? { ...m, ...updates } : m
      ));
      setEditingMemory(null);

      notifications.show({
        title: 'Memory Updated',
        message: 'Changes saved',
        color: 'lime'
      });
    } catch (err) {
      console.error('Error updating memory:', err);
      notifications.show({
        title: 'Error',
        message: 'Failed to update memory',
        color: 'red'
      });
    }
  };

  // Delete memory
  const handleDeleteMemory = async (id) => {
    try {
      const { error } = await supabase
        .from('coach_memory')
        .update({ is_active: false })
        .eq('id', id);

      if (error) throw error;

      setMemories(prev => prev.filter(m => m.id !== id));

      notifications.show({
        title: 'Memory Deleted',
        message: 'Memory has been removed',
        color: 'blue'
      });
    } catch (err) {
      console.error('Error deleting memory:', err);
      notifications.show({
        title: 'Error',
        message: 'Failed to delete memory',
        color: 'red'
      });
    }
  };

  // Get category info
  const getCategoryInfo = (category) => {
    return MEMORY_CATEGORIES.find(c => c.value === category) || MEMORY_CATEGORIES[0];
  };

  // Filter memories by category
  const filteredMemories = activeTab === 'all'
    ? memories
    : memories.filter(m => m.category === activeTab);

  // Group memories by category for display
  const memoriesByCategory = MEMORY_CATEGORIES.reduce((acc, cat) => {
    acc[cat.value] = memories.filter(m => m.category === cat.value);
    return acc;
  }, {});

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Group gap="xs">
          <ThemeIcon color="lime" variant="light">
            <IconBrain size={18} />
          </ThemeIcon>
          <Text fw={600}>What I Remember</Text>
        </Group>
      }
      size="lg"
    >
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          Here's what I know about you. You can edit or remove anything, or add new information you want me to remember.
        </Text>

        {/* Add Memory Button */}
        {!isAddingMemory ? (
          <Button
            variant="outline"
            color="lime"
            leftSection={<IconPlus size={16} />}
            onClick={() => setIsAddingMemory(true)}
          >
            Add Something
          </Button>
        ) : (
          <Paper withBorder p="md">
            <Stack gap="sm">
              <Text fw={500} size="sm">Add a new memory</Text>
              <Group grow>
                <Select
                  label="Category"
                  data={MEMORY_CATEGORIES.map(c => ({ value: c.value, label: c.label }))}
                  value={newMemory.category}
                  onChange={(v) => setNewMemory(prev => ({ ...prev, category: v }))}
                />
                <Select
                  label="Remember for"
                  data={MEMORY_TYPES.map(t => ({ value: t.value, label: t.label }))}
                  value={newMemory.memory_type}
                  onChange={(v) => setNewMemory(prev => ({ ...prev, memory_type: v }))}
                />
              </Group>
              <Textarea
                label="What should I remember?"
                placeholder="e.g., 'I have a race in March' or 'Tuesdays are always busy'"
                value={newMemory.content}
                onChange={(e) => setNewMemory(prev => ({ ...prev, content: e.target.value }))}
                autosize
                minRows={2}
              />
              <Group justify="flex-end" gap="sm">
                <Button variant="subtle" onClick={() => setIsAddingMemory(false)}>
                  Cancel
                </Button>
                <Button
                  color="lime"
                  leftSection={<IconCheck size={16} />}
                  onClick={handleAddMemory}
                  disabled={!newMemory.content.trim()}
                >
                  Save
                </Button>
              </Group>
            </Stack>
          </Paper>
        )}

        <Divider />

        {/* Category Tabs */}
        <Tabs value={activeTab} onChange={setActiveTab}>
          <Tabs.List>
            <Tabs.Tab value="all">
              All ({memories.length})
            </Tabs.Tab>
            {MEMORY_CATEGORIES.filter(c => memoriesByCategory[c.value]?.length > 0).map(cat => (
              <Tabs.Tab key={cat.value} value={cat.value}>
                {cat.label} ({memoriesByCategory[cat.value].length})
              </Tabs.Tab>
            ))}
          </Tabs.List>
        </Tabs>

        {/* Memory List */}
        {loading ? (
          <Stack align="center" py="xl">
            <Loader color="lime" />
            <Text size="sm" c="dimmed">Loading memories...</Text>
          </Stack>
        ) : filteredMemories.length === 0 ? (
          <Alert color="gray" variant="light">
            {activeTab === 'all'
              ? "I don't have any memories yet. Chat with me or add something above!"
              : `No memories in this category yet.`
            }
          </Alert>
        ) : (
          <Stack gap="xs">
            {filteredMemories.map((memory) => {
              const catInfo = getCategoryInfo(memory.category);
              const CatIcon = catInfo.icon;
              const isEditing = editingMemory === memory.id;

              return (
                <Paper key={memory.id} withBorder p="sm">
                  {isEditing ? (
                    <Stack gap="sm">
                      <Textarea
                        value={memory.content}
                        onChange={(e) => setMemories(prev =>
                          prev.map(m => m.id === memory.id
                            ? { ...m, content: e.target.value }
                            : m
                          )
                        )}
                        autosize
                        minRows={2}
                      />
                      <Group justify="flex-end" gap="xs">
                        <Button
                          size="xs"
                          variant="subtle"
                          onClick={() => {
                            setEditingMemory(null);
                            loadMemories(); // Reload to reset changes
                          }}
                        >
                          Cancel
                        </Button>
                        <Button
                          size="xs"
                          color="lime"
                          onClick={() => handleUpdateMemory(memory.id, { content: memory.content })}
                        >
                          Save
                        </Button>
                      </Group>
                    </Stack>
                  ) : (
                    <Group justify="space-between" align="flex-start" wrap="nowrap">
                      <Group gap="sm" align="flex-start" style={{ flex: 1 }}>
                        <ThemeIcon
                          size="sm"
                          variant="light"
                          color={catInfo.color}
                        >
                          <CatIcon size={14} />
                        </ThemeIcon>
                        <div style={{ flex: 1 }}>
                          <Text size="sm">{memory.content}</Text>
                          <Group gap="xs" mt={4}>
                            <Badge size="xs" variant="light" color={catInfo.color}>
                              {catInfo.label}
                            </Badge>
                            <Badge size="xs" variant="outline" color="gray">
                              {MEMORY_TYPES.find(t => t.value === memory.memory_type)?.label}
                            </Badge>
                            {memory.expires_at && (
                              <Text size="xs" c="dimmed">
                                Expires {new Date(memory.expires_at).toLocaleDateString()}
                              </Text>
                            )}
                          </Group>
                        </div>
                      </Group>
                      <Group gap={4}>
                        <ActionIcon
                          variant="subtle"
                          size="sm"
                          onClick={() => setEditingMemory(memory.id)}
                        >
                          <IconEdit size={14} />
                        </ActionIcon>
                        <ActionIcon
                          variant="subtle"
                          size="sm"
                          color="red"
                          onClick={() => handleDeleteMemory(memory.id)}
                        >
                          <IconTrash size={14} />
                        </ActionIcon>
                      </Group>
                    </Group>
                  )}
                </Paper>
              );
            })}
          </Stack>
        )}

        {/* Close Button */}
        <Group justify="flex-end">
          <Button variant="subtle" onClick={onClose}>
            Close
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

export default CoachMemories;
