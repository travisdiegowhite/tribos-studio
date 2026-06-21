import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { describe, it, expect } from 'vitest';
import FtpMissingBadge from '../FtpMissingBadge';

const renderBadge = (ftp) =>
  render(
    <MantineProvider>
      <FtpMissingBadge ftp={ftp} />
    </MantineProvider>,
  );

describe('FtpMissingBadge', () => {
  it('renders the nudge when no FTP is set', () => {
    renderBadge(null);
    expect(screen.getByText('Set FTP')).toBeInTheDocument();
  });

  it('renders nothing when an FTP is present', () => {
    renderBadge(250);
    expect(screen.queryByText('Set FTP')).not.toBeInTheDocument();
  });

  it('treats 0 / undefined FTP as missing', () => {
    renderBadge(0);
    expect(screen.getByText('Set FTP')).toBeInTheDocument();
  });
});
