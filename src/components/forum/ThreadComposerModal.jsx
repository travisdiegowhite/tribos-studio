/**
 * ThreadComposerModal — create (or edit) a forum thread with a
 * markdown Write/Preview toggle.
 */

import { useState, useEffect } from 'react';
import {
  Modal,
  Stack,
  TextInput,
  Textarea,
  Select,
  Button,
  Group,
  SegmentedControl,
  Box,
  Text,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import ForumMarkdown from './ForumMarkdown';

const MODAL_STYLES = {
  header: { backgroundColor: 'var(--color-bg-secondary)' },
  content: { backgroundColor: 'var(--color-bg-secondary)' },
  title: { color: 'var(--color-text-primary)', fontWeight: 600 },
};

function ThreadComposerModal({ opened, onClose, categories, onSubmit, initialThread = null }) {
  const isEdit = !!initialThread;
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [categoryId, setCategoryId] = useState(null);
  const [mode, setMode] = useState('write');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (opened) {
      setTitle(initialThread?.title || '');
      setBody(initialThread?.body || '');
      setCategoryId(initialThread?.category_id || categories[0]?.id || null);
      setMode('write');
    }
  }, [opened, initialThread, categories]);

  const handleSubmit = async () => {
    if (title.trim().length < 3) {
      notifications.show({ title: 'Title too short', message: 'Titles need at least 3 characters.', color: 'red' });
      return;
    }
    if (body.trim().length < 10) {
      notifications.show({ title: 'Body too short', message: 'Say a bit more — at least 10 characters.', color: 'red' });
      return;
    }
    if (!categoryId) {
      notifications.show({ title: 'Pick a board', message: 'Choose a category for your thread.', color: 'red' });
      return;
    }

    setSubmitting(true);
    try {
      const ok = await onSubmit({ title: title.trim(), body: body.trim(), category_id: categoryId });
      if (ok) onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={isEdit ? 'Edit Thread' : 'Start a Thread'}
      size="lg"
      styles={MODAL_STYLES}
    >
      <Stack gap="md">
        <TextInput
          label="Title"
          placeholder="What do you want to talk about?"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          required
          styles={{ input: { backgroundColor: 'var(--color-bg-secondary)' } }}
        />

        <Select
          label="Board"
          value={categoryId}
          onChange={setCategoryId}
          data={categories.map(c => ({ value: c.id, label: c.name }))}
          required
          styles={{ input: { backgroundColor: 'var(--color-bg-secondary)' } }}
        />

        <Box>
          <Group justify="space-between" mb={4}>
            <Text size="sm" fw={500}>Body</Text>
            <SegmentedControl
              size="xs"
              value={mode}
              onChange={setMode}
              data={[
                { value: 'write', label: 'Write' },
                { value: 'preview', label: 'Preview' },
              ]}
            />
          </Group>

          {mode === 'write' ? (
            <Textarea
              placeholder="Share the details. Markdown works: **bold**, lists, > quotes, [links](url). Mention riders with @DisplayName (no spaces)."
              value={body}
              onChange={(e) => setBody(e.target.value)}
              minRows={6}
              autosize
              maxLength={20000}
              styles={{ input: { backgroundColor: 'var(--color-bg-secondary)' } }}
            />
          ) : (
            <Box
              p="sm"
              style={{
                minHeight: 140,
                backgroundColor: 'var(--color-bg-secondary)',
                border: '1px solid var(--color-bg-secondary)',
                borderRadius: 4,
              }}
            >
              {body.trim() ? (
                <ForumMarkdown>{body}</ForumMarkdown>
              ) : (
                <Text size="sm" c="dimmed">Nothing to preview yet.</Text>
              )}
            </Box>
          )}
        </Box>

        <Group justify="flex-end">
          <Button variant="subtle" onClick={onClose}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            loading={submitting}
            style={{ backgroundColor: 'var(--color-teal)', color: 'var(--color-bg)' }}
          >
            {isEdit ? 'Save Changes' : 'Post Thread'}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

export default ThreadComposerModal;
