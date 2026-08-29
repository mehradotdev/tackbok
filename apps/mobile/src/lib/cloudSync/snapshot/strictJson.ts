import { SNAPSHOT_CAPS, invalid } from './caps';

export function decodeUtf8Strict(bytes: Uint8Array): string {
  const parts: string[] = [];
  const units: number[] = [];
  const flush = () => {
    if (units.length > 0) {
      parts.push(String.fromCharCode(...units));
      units.length = 0;
    }
  };
  for (let index = 0; index < bytes.length;) {
    const first = bytes[index++];
    let codePoint: number;
    let remaining: number;
    let minimum: number;
    if (first <= 0x7f) {
      codePoint = first; remaining = 0; minimum = 0;
    } else if (first >= 0xc2 && first <= 0xdf) {
      codePoint = first & 0x1f; remaining = 1; minimum = 0x80;
    } else if (first >= 0xe0 && first <= 0xef) {
      codePoint = first & 0x0f; remaining = 2; minimum = 0x800;
    } else if (first >= 0xf0 && first <= 0xf4) {
      codePoint = first & 0x07; remaining = 3; minimum = 0x10000;
    } else {
      invalid('invalid-utf8', `Invalid UTF-8 lead byte at ${index - 1}`);
    }
    if (index + remaining > bytes.length) {
      invalid('invalid-utf8', 'Truncated UTF-8 sequence');
    }
    for (let offset = 0; offset < remaining; offset++) {
      const next = bytes[index++];
      if ((next & 0xc0) !== 0x80) {
        invalid('invalid-utf8', `Invalid UTF-8 continuation byte at ${index - 1}`);
      }
      codePoint = (codePoint << 6) | (next & 0x3f);
    }
    if (codePoint < minimum || codePoint > 0x10ffff ||
        (codePoint >= 0xd800 && codePoint <= 0xdfff)) {
      invalid('invalid-utf8', `Invalid UTF-8 scalar ending at ${index - 1}`);
    }
    if (codePoint <= 0xffff) {
      units.push(codePoint);
    } else {
      const scalar = codePoint - 0x10000;
      units.push(0xd800 + (scalar >>> 10), 0xdc00 + (scalar & 0x3ff));
    }
    if (units.length >= 4096) flush();
  }
  flush();
  return parts.join('');
}

class StrictJsonParser {
  private index = 0;
  private nodes = 0;
  private readonly numberPattern = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;

  constructor(private readonly source: string) {}

  parse(): unknown {
    this.skipWhitespace();
    const value = this.parseValue(1);
    this.skipWhitespace();
    if (this.index !== this.source.length) {
      invalid('invalid-json', `Unexpected trailing JSON at ${this.index}`);
    }
    return value;
  }

  private countNode(): void {
    this.nodes++;
    if (this.nodes > SNAPSHOT_CAPS.jsonNodes) {
      invalid('json-node-cap', 'JSON node cap exceeded');
    }
  }

  private parseValue(depth: number): unknown {
    if (depth > SNAPSHOT_CAPS.jsonDepth) {
      invalid('json-depth-cap', 'JSON nesting depth cap exceeded');
    }
    this.countNode();
    const char = this.source[this.index];
    if (char === '{') return this.parseObject(depth);
    if (char === '[') return this.parseArray(depth);
    if (char === '"') return this.parseString();
    if (char === 't') return this.parseLiteral('true', true);
    if (char === 'f') return this.parseLiteral('false', false);
    if (char === 'n') return this.parseLiteral('null', null);
    if (char === '-' || (char >= '0' && char <= '9')) return this.parseNumber();
    invalid('invalid-json', `Unexpected token at ${this.index}`);
  }

  private parseObject(depth: number): Record<string, unknown> {
    this.index++;
    const result: Record<string, unknown> = Object.create(null);
    const keys = new Set<string>();
    this.skipWhitespace();
    if (this.source[this.index] === '}') {
      this.index++;
      return result;
    }
    while (true) {
      if (this.source[this.index] !== '"') {
        invalid('invalid-json', `Expected object key at ${this.index}`);
      }
      const key = this.parseString();
      this.countNode();
      if (keys.has(key)) invalid('duplicate-key', `Duplicate JSON key ${key}`);
      keys.add(key);
      this.skipWhitespace();
      if (this.source[this.index++] !== ':') {
        invalid('invalid-json', `Expected colon at ${this.index - 1}`);
      }
      this.skipWhitespace();
      result[key] = this.parseValue(depth + 1);
      this.skipWhitespace();
      const separator = this.source[this.index++];
      if (separator === '}') return result;
      if (separator !== ',') invalid('invalid-json', `Expected comma at ${this.index - 1}`);
      this.skipWhitespace();
    }
  }

  private parseArray(depth: number): unknown[] {
    this.index++;
    const result: unknown[] = [];
    this.skipWhitespace();
    if (this.source[this.index] === ']') {
      this.index++;
      return result;
    }
    while (true) {
      result.push(this.parseValue(depth + 1));
      this.skipWhitespace();
      const separator = this.source[this.index++];
      if (separator === ']') return result;
      if (separator !== ',') invalid('invalid-json', `Expected comma at ${this.index - 1}`);
      this.skipWhitespace();
    }
  }

  private parseString(): string {
    this.index++;
    let output = '';
    let segmentStart = this.index;
    while (this.index < this.source.length) {
      const code = this.source.charCodeAt(this.index);
      if (code === 0x22) {
        output += this.source.slice(segmentStart, this.index);
        this.index++;
        return output;
      }
      if (code < 0x20) invalid('invalid-json', `Unescaped control at ${this.index}`);
      if (code === 0x5c) {
        output += this.source.slice(segmentStart, this.index);
        this.index++;
        const escape = this.source[this.index++];
        const escaped: Record<string, string> = {
          '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t',
        };
        if (escape === 'u') {
          const hex = this.source.slice(this.index, this.index + 4);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) {
            invalid('invalid-json', `Invalid Unicode escape at ${this.index}`);
          }
          output += String.fromCharCode(Number.parseInt(hex, 16));
          this.index += 4;
        } else if (Object.hasOwn(escaped, escape)) {
          output += escaped[escape];
        } else {
          invalid('invalid-json', `Invalid string escape at ${this.index - 1}`);
        }
        segmentStart = this.index;
      } else {
        this.index++;
      }
    }
    invalid('invalid-json', 'Unterminated JSON string');
  }

  private parseLiteral<T>(token: string, value: T): T {
    if (this.source.slice(this.index, this.index + token.length) !== token) {
      invalid('invalid-json', `Invalid literal at ${this.index}`);
    }
    this.index += token.length;
    return value;
  }

  private parseNumber(): number {
    this.numberPattern.lastIndex = this.index;
    const match = this.numberPattern.exec(this.source);
    if (!match) invalid('invalid-json', `Invalid number at ${this.index}`);
    this.index += match[0].length;
    const value = Number(match[0]);
    if (!Number.isFinite(value)) invalid('invalid-number', 'Non-finite JSON number');
    return value;
  }

  private skipWhitespace(): void {
    while (/\s/.test(this.source[this.index] ?? '') &&
      [' ', '\t', '\r', '\n'].includes(this.source[this.index])) {
      this.index++;
    }
  }
}

export function parseJsonStrict(source: string): unknown {
  return new StrictJsonParser(source).parse();
}
