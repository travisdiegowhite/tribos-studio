import StatusBadge from './StatusBadge';

/**
 * FtpMissingBadge - non-blocking nudge shown when the athlete has no FTP set.
 *
 * FTP-dependent numbers (TSS/RSS, intensity, form) fall back to estimates when
 * FTP is missing, which can be systematically off. This badge signals that and
 * points the athlete to Settings. Renders nothing when an FTP is present.
 *
 * @param {number|null|undefined} ftp - the athlete's FTP (watts)
 * @param {string} size - Badge size (default "sm")
 */
export default function FtpMissingBadge({ ftp, size = 'sm' }) {
  if (ftp) return null;

  return (
    <StatusBadge
      tier="muted"
      size={size}
      tooltip="No FTP set — intensity, TSS, and form values are estimated. Set your FTP in Settings for accurate metrics."
    >
      Set FTP
    </StatusBadge>
  );
}
