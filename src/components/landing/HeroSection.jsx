import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Container, Title, Text, Button, Stack, Group, Box, Badge } from '@mantine/core';
import { IconChevronRight, IconChevronDown } from '@tabler/icons-react';

export default function HeroSection() {
  const [hasScrolled, setHasScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 100) {
        setHasScrolled(true);
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <Box
      className="landing-hero"
      py={{ base: 80, md: 140 }}
      px={{ base: 'md', md: 'xl' }}
      style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', position: 'relative' }}
    >
      {/* Subtle terracotta radial glow */}
      <Box
        style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(ellipse at 50% 30%, rgba(158, 90, 60, 0.08) 0%, transparent 60%)',
          pointerEvents: 'none',
        }}
      />

      <Container size="sm" style={{ position: 'relative', zIndex: 1 }}>
        <Stack gap="xl" align="center" ta="center">
          <Badge color="terracotta" variant="light" size="lg">
            Now in Private Beta
          </Badge>

          <Title
            order={1}
            style={{
              fontSize: 'clamp(1.8rem, 4.5vw, 3.2rem)',
              color: 'var(--tribos-text-primary)',
              lineHeight: 1.15,
              maxWidth: 600,
            }}
          >
            You have the plan. You have the gear.{' '}
            <span style={{ color: 'var(--tribos-terracotta-500)' }}>
              But who tells you what to ride today?
            </span>
          </Title>

          <Text
            size="lg"
            style={{
              color: 'var(--tribos-text-secondary)',
              maxWidth: 520,
              lineHeight: 1.6,
            }}
          >
            Watch what happens when your cycling data meets an AI that actually understands training.
          </Text>

          <Button
            component={Link}
            to="/auth"
            size="lg"
            color="terracotta"
            rightSection={<IconChevronRight size={18} />}
          >
            Create Free Account
          </Button>

          {/* Secondary scroll CTA */}
          <Box
            component="a"
            href="#connect"
            onClick={(e) => {
              e.preventDefault();
              document.getElementById('connect')?.scrollIntoView({ behavior: 'smooth' });
            }}
            style={{ textDecoration: 'none', cursor: 'pointer' }}
          >
            <Text
              size="sm"
              style={{
                color: 'var(--tribos-text-muted)',
                fontFamily: "'DM Mono', monospace",
                letterSpacing: '1px',
              }}
            >
              See how it works
            </Text>
          </Box>
        </Stack>
      </Container>

      {/* Scroll prompt — positioned relative to hero Box */}
      <Box
        className={`scroll-prompt ${hasScrolled ? 'hidden' : ''}`}
        style={{
          position: 'absolute',
          bottom: 32,
          left: '50%',
          textAlign: 'center',
          cursor: 'pointer',
        }}
        onClick={() => {
          document.getElementById('connect')?.scrollIntoView({ behavior: 'smooth' });
        }}
      >
        <IconChevronDown size={24} color="var(--tribos-text-muted)" />
      </Box>
    </Box>
  );
}
