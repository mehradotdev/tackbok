import { isValidDonorEmail, normalizeDonorNote, sendDonorNote } from './donor-note';

test('normalizes a note and treats an empty one as anonymous', () => {
  expect(normalizeDonorNote({ message: '  hi  ', email: ' a@b.co ' })).toEqual({
    message: 'hi',
    email: 'a@b.co',
  });
  expect(normalizeDonorNote({ message: ' \n ', email: '  ' })).toBeNull();
  expect(
    normalizeDonorNote({ message: 'x'.repeat(1200), email: '' })?.message,
  ).toHaveLength(1000);
});

test.each([
  ['', true],
  ['donor@example.com', true],
  ['first.last+tag@mail.example.co.uk', true],
  ['donor@example', false],
  ['donor example@example.com', false],
  ['<donor@example.com>', false],
  ['a@b@example.com', false],
  [`${'a'.repeat(250)}@b.co`, false],
])('email %j is valid: %s', (email, valid) => {
  expect(isValidDonorEmail(email)).toBe(valid);
});

test.each([
  [202, 'sent'],
  [409, 'sent'],
  [403, 'retry'],
  [429, 'retry'],
  [503, 'retry'],
  [400, 'rejected'],
  [404, 'rejected'],
] as const)('maps HTTP %d to %s', async (status, expected) => {
  const fetcher = jest.fn(async () => ({ ok: status < 300, status }) as Response);
  await expect(
    sendDonorNote(
      { appUserId: 'u', transactionId: 't', message: 'm', email: '' },
      fetcher,
    ),
  ).resolves.toBe(expected);
});

test('retries when the network fails', async () => {
  const fetcher = jest.fn(async () => {
    throw new TypeError('Network request failed');
  });
  await expect(
    sendDonorNote(
      { appUserId: 'u', transactionId: null, message: 'm', email: '' },
      fetcher,
    ),
  ).resolves.toBe('retry');
});
