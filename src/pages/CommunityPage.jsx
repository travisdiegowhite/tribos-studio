/**
 * CommunityPage
 * "The Cafe" — the tribos community hub.
 *
 * The primary surface is the community-wide forum (boards, threads,
 * search, notifications). The original small-group accountability
 * experience (weekly check-ins, cafe matching) lives under "My Cafe".
 */

import { Container, Tabs } from '@mantine/core';
import { useSearchParams } from 'react-router-dom';
import { ChatsCircle, Coffee } from '@phosphor-icons/react';
import { useAuth } from '../contexts/AuthContext';
import AppShell from '../components/AppShell';
import PageHeader from '../components/PageHeader';
import { ForumHome } from '../components/forum';
import { CafeCorner } from '../components/community';

function CommunityPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  // ?tab=cafe opens the small-group corner; the forum is the default.
  // An open thread (?thread=) always means the forum tab.
  const tab = searchParams.get('thread')
    ? 'forum'
    : (searchParams.get('tab') === 'cafe' ? 'cafe' : 'forum');

  const handleTabChange = (value) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (value === 'cafe') {
        next.set('tab', 'cafe');
        next.delete('thread');
      } else {
        next.delete('tab');
      }
      return next;
    });
  };

  return (
    <AppShell>
      <Container size="lg" py="xl">
        <PageHeader
          title="The Cafe"
          subtitle="Talk shop with the whole tribos community"
        />

        <Tabs value={tab} onChange={handleTabChange} keepMounted={false}>
          <Tabs.List mb="md">
            <Tabs.Tab value="forum" leftSection={<ChatsCircle size={16} />}>
              Forum
            </Tabs.Tab>
            <Tabs.Tab value="cafe" leftSection={<Coffee size={16} />}>
              My Cafe
            </Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="forum">
            <ForumHome userId={user?.id} />
          </Tabs.Panel>

          <Tabs.Panel value="cafe">
            <CafeCorner />
          </Tabs.Panel>
        </Tabs>
      </Container>
    </AppShell>
  );
}

export default CommunityPage;
