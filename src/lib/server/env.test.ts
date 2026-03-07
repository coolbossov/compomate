describe('validateEnv', () => {
  // Save original env and restore after each test
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    // Start with minimum required vars
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key-minimum-length';
    process.env.FAL_KEY = 'test-fal-key';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  async function getValidateEnv() {
    const mod = await import('./env');
    return mod.validateEnv;
  }

  async function getGetR2Env() {
    const mod = await import('./env');
    return mod.getR2Env;
  }

  it('does not throw when all required vars are set', async () => {
    const validateEnv = await getValidateEnv();
    expect(() => validateEnv()).not.toThrow();
  });

  it('returns config object with correct values', async () => {
    const validateEnv = await getValidateEnv();
    const config = validateEnv();
    expect(config.SUPABASE_URL).toBe('https://test.supabase.co');
    expect(config.SUPABASE_SERVICE_ROLE_KEY).toBe('test-service-role-key-minimum-length');
    expect(config.FAL_KEY).toBe('test-fal-key');
  });

  it('throws when SUPABASE_URL is missing', async () => {
    delete process.env.SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    const validateEnv = await getValidateEnv();
    expect(() => validateEnv()).toThrow(/SUPABASE_URL/);
  });

  it('accepts NEXT_PUBLIC_SUPABASE_URL as fallback for SUPABASE_URL', async () => {
    delete process.env.SUPABASE_URL;
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://alt.supabase.co';
    const validateEnv = await getValidateEnv();
    const config = validateEnv();
    expect(config.SUPABASE_URL).toBe('https://alt.supabase.co');
  });

  it('throws when FAL_KEY is missing', async () => {
    delete process.env.FAL_KEY;
    const validateEnv = await getValidateEnv();
    expect(() => validateEnv()).toThrow(/FAL_KEY/);
  });

  it('throws when SUPABASE_SERVICE_ROLE_KEY is missing', async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const validateEnv = await getValidateEnv();
    expect(() => validateEnv()).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
  });

  it('lists all missing vars in a single error', async () => {
    delete process.env.SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.FAL_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const validateEnv = await getValidateEnv();
    try {
      validateEnv();
      expect.fail('Should have thrown');
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toContain('SUPABASE_URL');
      expect(msg).toContain('FAL_KEY');
      expect(msg).toContain('SUPABASE_SERVICE_ROLE_KEY');
    }
  });

  it('detects placeholder value <placeholder>', async () => {
    process.env.FAL_KEY = '<placeholder>';
    const validateEnv = await getValidateEnv();
    expect(() => validateEnv()).toThrow(/FAL_KEY/);
  });

  it('detects placeholder value your-key-here', async () => {
    process.env.FAL_KEY = 'your-key-here';
    const validateEnv = await getValidateEnv();
    expect(() => validateEnv()).toThrow(/FAL_KEY/);
  });

  it('detects placeholder value changeme', async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'changeme';
    const validateEnv = await getValidateEnv();
    expect(() => validateEnv()).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
  });

  it('detects placeholder value CHANGEME (case insensitive)', async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'CHANGEME';
    const validateEnv = await getValidateEnv();
    expect(() => validateEnv()).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
  });
});

describe('getR2Env', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    // Keep required vars so the module can load
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
    process.env.FAL_KEY = 'test-fal-key';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('returns R2 config when all R2 vars are set', async () => {
    process.env.R2_ACCESS_KEY_ID = 'test-access-key';
    process.env.R2_SECRET_ACCESS_KEY = 'test-secret-key';
    process.env.R2_BUCKET_NAME = 'test-bucket';
    process.env.R2_ENDPOINT = 'https://r2.example.com';

    const mod = await import('./env');
    const result = mod.getR2Env();
    expect(result).not.toBeNull();
    expect(result!.R2_ACCESS_KEY_ID).toBe('test-access-key');
    expect(result!.R2_SECRET_ACCESS_KEY).toBe('test-secret-key');
    expect(result!.R2_BUCKET_NAME).toBe('test-bucket');
    expect(result!.R2_ENDPOINT).toBe('https://r2.example.com');
  });

  it('returns null when R2 vars are missing', async () => {
    delete process.env.R2_ACCESS_KEY_ID;
    delete process.env.R2_SECRET_ACCESS_KEY;
    delete process.env.R2_BUCKET_NAME;
    delete process.env.R2_ENDPOINT;

    const mod = await import('./env');
    const result = mod.getR2Env();
    expect(result).toBeNull();
  });

  it('returns null when R2 access key is a placeholder', async () => {
    process.env.R2_ACCESS_KEY_ID = '<your-access-key>';
    process.env.R2_SECRET_ACCESS_KEY = 'real-secret';
    process.env.R2_BUCKET_NAME = 'test-bucket';
    process.env.R2_ENDPOINT = 'https://r2.example.com';

    const mod = await import('./env');
    const result = mod.getR2Env();
    expect(result).toBeNull();
  });

  it('returns null when R2 endpoint is missing', async () => {
    process.env.R2_ACCESS_KEY_ID = 'test-key';
    process.env.R2_SECRET_ACCESS_KEY = 'test-secret';
    process.env.R2_BUCKET_NAME = 'test-bucket';
    delete process.env.R2_ENDPOINT;

    const mod = await import('./env');
    const result = mod.getR2Env();
    expect(result).toBeNull();
  });
});
