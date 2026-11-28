/**
 * Optional note a donor can attach to a donation. It is sent to the developer
 * through tackbok.org only after the store reports the payment as completed;
 * the server checks the purchase with RevenueCat before forwarding it.
 */

export const DONOR_NOTE_ENDPOINT = 'https://tackbok.org/api/donor-note';
export const DONOR_NOTE_MAX_MESSAGE_LENGTH = 1000;
const MAX_EMAIL_LENGTH = 254;
// Light check that matches the server: one @, no spaces, a dot in the domain.
const EMAIL_PATTERN =
  /^[^\s@<>()[\]",;:\\]+@[^\s@<>()[\]",;:\\.]+(?:\.[^\s@<>()[\]",;:\\.]+)+$/;

export type DonorNote = { message: string; email: string };

/** Trims both fields; returns null when the donor left both empty. */
export function normalizeDonorNote(note: DonorNote): DonorNote | null {
  const message = note.message.trim().slice(0, DONOR_NOTE_MAX_MESSAGE_LENGTH);
  const email = note.email.trim();
  return message || email ? { message, email } : null;
}

export function isValidDonorEmail(email: string): boolean {
  const trimmed = email.trim();
  return (
    trimmed === '' || (trimmed.length <= MAX_EMAIL_LENGTH && EMAIL_PATTERN.test(trimmed))
  );
}

/**
 * - `sent`: delivered, or the server already has a note for this donation.
 * - `rejected`: the server will never accept this note; stop trying.
 * - `retry`: try again later (offline, payment not visible yet, server busy).
 */
export type DonorNoteSendResult = 'sent' | 'rejected' | 'retry';

export async function sendDonorNote(
  payload: { appUserId: string; transactionId: string | null } & DonorNote,
  fetcher: (url: string, init: RequestInit) => Promise<Response> = fetch,
): Promise<DonorNoteSendResult> {
  let response: Response;
  try {
    response = await fetcher(DONOR_NOTE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    return 'retry';
  }
  if (response.ok || response.status === 409) return 'sent';
  // 403: RevenueCat may not list a just-completed payment yet.
  if (response.status === 403 || response.status === 429 || response.status >= 500) {
    return 'retry';
  }
  return 'rejected';
}
