/** Seeded PRNG (mulberry32): the same seed always replays the same case. */
export class Random {
  private state: number;

  constructor(readonly seed: number) {
    this.state = seed >>> 0;
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let value = this.state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  }

  int(min: number, maxInclusive: number): number {
    return min + Math.floor(this.next() * (maxInclusive - min + 1));
  }

  chance(probability: number): boolean {
    return this.next() < probability;
  }

  pick<T>(values: readonly T[]): T {
    if (values.length === 0) throw new Error('pick from an empty list');
    return values[Math.floor(this.next() * values.length)];
  }

  weighted<T>(choices: readonly (readonly [T, number])[]): T {
    const total = choices.reduce((sum, [, weight]) => sum + weight, 0);
    let roll = this.next() * total;
    for (const [value, weight] of choices) {
      roll -= weight;
      if (roll < 0) return value;
    }
    return choices[choices.length - 1][0];
  }

  shuffle<T>(values: readonly T[]): T[] {
    const result = [...values];
    for (let index = result.length - 1; index > 0; index--) {
      const other = Math.floor(this.next() * (index + 1));
      [result[index], result[other]] = [result[other], result[index]];
    }
    return result;
  }
}

/** Seeds for a run: a fixed list in CI, more with SYNC_SIM_SCALE locally. */
export function seedRange(base: number, count: number): number[] {
  const scale = Math.max(1, Number(process.env.SYNC_SIM_SCALE ?? '1') || 1);
  return Array.from({ length: Math.round(count * scale) }, (_, index) => base + index);
}
