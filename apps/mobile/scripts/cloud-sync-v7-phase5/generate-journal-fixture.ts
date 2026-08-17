import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const DAY_MS = 24 * 60 * 60 * 1000;
const FIRST_DAY_UTC = Date.UTC(1980, 0, 1);

export function buildPresentlyFixtureCsv(entryCount: number): string {
  if (!Number.isSafeInteger(entryCount) || entryCount < 1 || entryCount > 10_000) {
    throw new Error('entryCount must be an integer from 1 through 10000');
  }
  const rows = ['entryDate,entryContent'];
  for (let index = 0; index < entryCount; index += 1) {
    const date = new Date(FIRST_DAY_UTC + index * DAY_MS).toISOString().slice(0, 10);
    rows.push(`${date},"Synthetic V7-5 journal entry ${String(index + 1).padStart(5, '0')}"`);
  }
  return `${rows.join('\n')}\n`;
}

if (import.meta.main) {
  const [countValue, outputValue] = process.argv.slice(2);
  const count = Number(countValue);
  if (!outputValue) {
    throw new Error('Usage: generate-journal-fixture.ts <1..10000> <output.csv>');
  }
  const output = resolve(outputValue);
  writeFileSync(output, buildPresentlyFixtureCsv(count), { encoding: 'utf8', flag: 'wx' });
  console.log(`Wrote ${count} synthetic Presently rows to ${output}`);
}
