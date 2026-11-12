const dateTime = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' });
const timeOnly = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit' });

/** All times are shown in Manila time, whatever the device clock says. */
export const formatDateTime = (value: string | null | undefined): string => (value ? dateTime.format(new Date(value)) : '');
export const formatTime = (value: string | null | undefined): string => (value ? timeOnly.format(new Date(value)) : '');

export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}

export const categoryLabel = (category: string): string => (category === 'emergency' ? 'Emergency' : category === 'priority' ? 'Priority' : 'Regular');
