// ============================================================
// CompoMate — Server Environment Validation
// ============================================================
// Call validateEnv() or getEnv() at the top of each API route.
// Fails fast with a descriptive error listing all missing vars.

export interface EnvConfig {
  // Supabase
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  // R2
  R2_ACCOUNT_ID: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  R2_BUCKET_NAME: string;
  R2_ENDPOINT: string;
  // AI
  FAL_KEY: string;
  GEMINI_API_KEY?: string; // optional
}

const REQUIRED_VARS = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET_NAME",
  "R2_ENDPOINT",
  "FAL_KEY",
] as const;

// Detect placeholder values that were never replaced
const PLACEHOLDER_PATTERNS = [/^<.+>$/, /^your-.+$/, /^changeme$/i];

function isPlaceholder(value: string): boolean {
  return PLACEHOLDER_PATTERNS.some((re) => re.test(value.trim()));
}

/**
 * Validates all required environment variables.
 * Throws a descriptive Error listing every missing or placeholder var.
 */
export function validateEnv(): EnvConfig {
  const missing: string[] = [];

  for (const key of REQUIRED_VARS) {
    const value = process.env[key];
    if (!value || isPlaceholder(value)) {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing or unconfigured environment variables:\n  ${missing.join("\n  ")}\n` +
        `Add these to .env.local (development) or your deployment environment (production).`,
    );
  }

  return {
    SUPABASE_URL: process.env.SUPABASE_URL!,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY!,
    R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID!,
    R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID!,
    R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY!,
    R2_BUCKET_NAME: process.env.R2_BUCKET_NAME!,
    R2_ENDPOINT: process.env.R2_ENDPOINT!,
    FAL_KEY: process.env.FAL_KEY!,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  };
}

/**
 * Cached env validation — only validates once per process.
 * Use this in hot paths (API routes called on every request).
 */
let _cached: EnvConfig | null = null;

export function getEnv(): EnvConfig {
  if (!_cached) {
    _cached = validateEnv();
  }
  return _cached;
}

/**
 * R2-only validation — checks only R2 credentials.
 * Returns null if unconfigured (graceful 503 path) rather than throwing.
 */
export function getR2Env(): Pick<
  EnvConfig,
  "R2_ACCESS_KEY_ID" | "R2_SECRET_ACCESS_KEY" | "R2_BUCKET_NAME" | "R2_ENDPOINT"
> | null {
  const id = process.env.R2_ACCESS_KEY_ID;
  const secret = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET_NAME;
  const endpoint = process.env.R2_ENDPOINT;

  if (
    !id ||
    !secret ||
    !bucket ||
    !endpoint ||
    isPlaceholder(id) ||
    isPlaceholder(secret)
  ) {
    return null;
  }

  return {
    R2_ACCESS_KEY_ID: id,
    R2_SECRET_ACCESS_KEY: secret,
    R2_BUCKET_NAME: bucket,
    R2_ENDPOINT: endpoint,
  };
}
