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
