export function canDeleteRetainedMedia(input: {
  referenceCount: number;
  obligations: readonly { completedAt: number | null }[];
}): boolean {
  return (
    input.referenceCount === 0 &&
    input.obligations.length > 0 &&
    input.obligations.every((obligation) => obligation.completedAt !== null)
  );
}
