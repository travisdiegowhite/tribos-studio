/**
 * Compact relative-time formatting for feed/forum surfaces.
 * (Same behavior as the previously-inline helper in DiscussionList.)
 */
export function timeAgo(dateString: string | Date, now: Date = new Date()): string {
  const date = dateString instanceof Date ? dateString : new Date(dateString);
  if (Number.isNaN(date.getTime())) return '';

  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;

  return date.toLocaleDateString();
}

export default timeAgo;
