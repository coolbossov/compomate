// ============================================================
// CompoMate — Server Environment Validation
// ============================================================
// Call validateEnv() or getEnv() at the top of each API route.
// Fails fast with a descriptive error listing all missing vars.

export interface EnvConfig {
  // Supabase (critical — throw if missing)
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  // AI (critical — throw if missing)
  FAL_KEY: string;
  GEMINI_API_KEY?: string;
  // R2 (optional — graceful degradation, warn if missing)
  R2_ACCOUNT_ID?: string;
  R2_ACCESS_KEY_ID?: string;
  R2_SECRET_ACCESS_KEY?: string;
  R2_BUCKET_NAME?: string;
  R2_ENDPOINT?: string;
  // Analytics (fully optional — no warning)
  NEXT_PUBLIC_SENTRY_DSN?: string;
  SENTRY_AUTH_TOKEN?: string;
  SENTRY_ORG?: string;
  SENTRY_PROJECT?: string;
  NEXT_PUBLIC_POSTHOG_KEY?: string;
  NEXT_PUBLIC_POSTHOG_HOST?: string;
}

// Critical keys — throw if any are missing or placeholder
const REQUIRED_VARS = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "FAL_KEY",
] as const;

// Supabase URL accepts either var name
function resolveSupabaseUrl(): string | null {
  return (
    process.env.SUPABASE_URL ??
    process.env.NEXT_PUBLIC_SUPABASE_URL ??
    null
  );
}

// Detect placeholder values that were never replaced
const PLACEHOLDER_PATTERNS = [/^<.+>$/, /^your-.+$/, /^changeme$/i];

function isPlaceholder(value: string): boolean {
  return PLACEHOLDER_PATTERNS.some((re) => re.test(value.trim()));
}

/**
 * Validates critical environment variables (Supabase + FAL).
 * Throws a descriptive Error listing every missing or placeholder var.
 * R2 and analytics keys are NOT validated here — use getR2Env() for R2.
 */
export function validateEnv(): EnvConfig {
  const missing: string[] = [];

  // Check Supabase URL separately (supports two var names)
  const supabaseUrl = resolveSupabaseUrl();
  if (!supabaseUrl || isPlaceholder(supabaseUrl)) {
    missing.push("SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL)");
  }

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
    SUPABASE_URL: supabaseUrl!,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY!,
    FAL_KEY: process.env.FAL_KEY!,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID,
    R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY,
    R2_BUCKET_NAME: process.env.R2_BUCKET_NAME,
    R2_ENDPOINT: process.env.R2_ENDPOINT,
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
    SENTRY_AUTH_TOKEN: process.env.SENTRY_AUTH_TOKEN,
    SENTRY_ORG: process.env.SENTRY_ORG,
    SENTRY_PROJECT: process.env.SENTRY_PROJECT,
    NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
    NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,
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
 * Returns null if unconfigured and logs a warning (graceful 503 path).
 * Cached per module instance to avoid repeated console.warn on every request.
 */
type R2EnvResult = Pick<
  EnvConfig,
  "R2_ACCESS_KEY_ID" | "R2_SECRET_ACCESS_KEY" | "R2_BUCKET_NAME" | "R2_ENDPOINT"
> | null;

let _r2EnvCache: R2EnvResult | undefined = undefined;

function _computeR2Env(): R2EnvResult {
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
    console.warn(
      "[env] R2 is not configured — asset storage disabled. " +
        "Set R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, and R2_ENDPOINT to enable.",
    );
    return null;
  }

  return {
    R2_ACCESS_KEY_ID: id,
    R2_SECRET_ACCESS_KEY: secret,
    R2_BUCKET_NAME: bucket,
    R2_ENDPOINT: endpoint,
  };
}

export function getR2Env(): R2EnvResult {
  if (_r2EnvCache === undefined) {
    _r2EnvCache = _computeR2Env();
  }
  return _r2EnvCache;
}
