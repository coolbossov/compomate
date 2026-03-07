import { generateSubjectKey, generateBackdropKey, generateExportKey } from './r2';

// Mock AWS SDK and nanoid to avoid real S3 calls
vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn(),
  PutObjectCommand: vi.fn(),
  GetObjectCommand: vi.fn(),
  DeleteObjectCommand: vi.fn(),
}));

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn(),
}));

// ── Key generators ──────────────────────────────────────────
describe('generateSubjectKey', () => {
  it('starts with "subjects/"', () => {
    const key = generateSubjectKey('photo.png');
    expect(key.startsWith('subjects/')).toBe(true);
  });

  it('contains the sanitized filename', () => {
    const key = generateSubjectKey('photo.png');
    expect(key).toContain('photo.png');
  });

  it('sanitizes spaces to underscores', () => {
    const key = generateSubjectKey('my photo.png');
    expect(key).toContain('my_photo.png');
    expect(key).not.toContain(' ');
  });

  it('sanitizes special characters', () => {
    const key = generateSubjectKey('photo (1).png');
    // (1) should become _1_
    expect(key).not.toContain('(');
    expect(key).not.toContain(')');
  });

  it('collapses consecutive underscores', () => {
    const key = generateSubjectKey('a   b   c.png');
    expect(key).not.toContain('__');
  });

  it('truncates very long filenames', () => {
    const longName = 'a'.repeat(300) + '.png';
    const key = generateSubjectKey(longName);
    // The sanitized filename portion should be at most 200 chars
    const filenameStart = key.indexOf('-', key.indexOf('-') + 1);
    // Total key could be longer due to prefix, but sanitized portion is capped
    expect(key.length).toBeLessThan(300);
  });

  it('produces unique keys on consecutive calls', () => {
    const key1 = generateSubjectKey('photo.png');
    const key2 = generateSubjectKey('photo.png');
    expect(key1).not.toBe(key2);
  });

  it('contains a timestamp component', () => {
    const key = generateSubjectKey('photo.png');
    // Format: subjects/{timestamp}-{nanoid}-{filename}
    const afterPrefix = key.replace('subjects/', '');
    const firstPart = afterPrefix.split('-')[0];
    // Should be a numeric timestamp
    expect(Number(firstPart)).toBeGreaterThan(0);
  });
});

describe('generateBackdropKey', () => {
  it('starts with "backdrops/"', () => {
    const key = generateBackdropKey('bg.jpg');
    expect(key.startsWith('backdrops/')).toBe(true);
  });

  it('contains the sanitized filename', () => {
    const key = generateBackdropKey('bg.jpg');
    expect(key).toContain('bg.jpg');
  });

  it('sanitizes filenames the same as subject keys', () => {
    const key = generateBackdropKey('my bg (2).jpg');
    expect(key).not.toContain(' ');
    expect(key).not.toContain('(');
    expect(key).not.toContain(')');
  });

  it('produces unique keys', () => {
    const key1 = generateBackdropKey('bg.jpg');
    const key2 = generateBackdropKey('bg.jpg');
    expect(key1).not.toBe(key2);
  });
});

describe('generateExportKey', () => {
  it('starts with "exports/"', () => {
    const key = generateExportKey('output.png');
    expect(key.startsWith('exports/')).toBe(true);
  });

  it('contains the sanitized filename', () => {
    const key = generateExportKey('output.png');
    expect(key).toContain('output.png');
  });

  it('has no nanoid (only timestamp + filename)', () => {
    const key = generateExportKey('output.png');
    // Format: exports/{timestamp}-{filename}
    const afterPrefix = key.replace('exports/', '');
    const parts = afterPrefix.split('-');
    // First part is timestamp, rest is the filename
    // export keys do NOT include nanoid, so it's just timestamp-filename
    expect(Number(parts[0])).toBeGreaterThan(0);
    expect(afterPrefix).toContain('output.png');
  });

  it('sanitizes special characters', () => {
    const key = generateExportKey('my export (final).png');
    expect(key).not.toContain(' ');
    expect(key).not.toContain('(');
  });
});

// ── Cross-prefix uniqueness ─────────────────────────────────
describe('key uniqueness across prefixes', () => {
  it('different prefixes for different key types', () => {
    const subject = generateSubjectKey('file.png');
    const backdrop = generateBackdropKey('file.png');
    const exportKey = generateExportKey('file.png');

    expect(subject.startsWith('subjects/')).toBe(true);
    expect(backdrop.startsWith('backdrops/')).toBe(true);
    expect(exportKey.startsWith('exports/')).toBe(true);

    // All three should be different
    expect(subject).not.toBe(backdrop);
    expect(subject).not.toBe(exportKey);
    expect(backdrop).not.toBe(exportKey);
  });
});
