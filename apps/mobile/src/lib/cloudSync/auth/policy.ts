export function maskGoogleAccountEmail(email: string): string {
  const [local, domain, ...rest] = email.trim().split('@');
  if (!local || !domain || rest.length > 0) return 'Google Drive';
  const maskedLocal = `${local[0]}•••`;
  const labels = domain.split('.');
  const host = labels[0] ? `${labels[0][0]}•••` : '•••';
  const suffix = labels.length > 1 ? `.${labels.slice(1).join('.')}` : '';
  return `${maskedLocal}@${host}${suffix}`;
}

export function isTerminalGoogleRefreshError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const value = error as {
    code?: unknown;
    status?: unknown;
    error?: unknown;
    params?: { error?: unknown };
  };
  return (
    value.code === 'invalid_grant' ||
    value.error === 'invalid_grant' ||
    value.params?.error === 'invalid_grant' ||
    value.status === 401
  );
}
