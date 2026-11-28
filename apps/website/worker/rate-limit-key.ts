/**
 * IPv6 clients usually control a whole /64, so rate-limit by that prefix
 * rather than by the single address.
 */
export function rateLimitKey(ip: string | null): string {
  if (!ip) return 'unknown';
  if (!ip.includes(':')) return ip;
  const [head = '', tail = ''] = ip.toLowerCase().split('::');
  const headGroups = head ? head.split(':') : [];
  const tailGroups = ip.includes('::') && tail ? tail.split(':') : [];
  const missing = Math.max(0, 8 - headGroups.length - tailGroups.length);
  const groups = [...headGroups, ...Array<string>(missing).fill('0'), ...tailGroups];
  return `${groups
    .slice(0, 4)
    .map((group) => group.replace(/^0+(?=.)/, ''))
    .join(':')}::/64`;
}
