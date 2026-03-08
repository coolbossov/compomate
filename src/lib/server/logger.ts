type LogLevel = "info" | "warn" | "error";

const LEVEL_RANK: Record<LogLevel, number> = {
  info: 0,
  warn: 1,
  error: 2,
};

const REDACT_FIELD_NAMES = new Set(["secret", "token", "password", "apiKey", "cookie"]);
const PRESIGNED_PATTERN = /X-Amz-Signature/i;

function currentLevel(): LogLevel {
  const raw = process.env.COMPOMATE_LOG_LEVEL?.toLowerCase();
  if (raw === "info" || raw === "warn" || raw === "error") {
    return raw;
  }
  return process.env.NODE_ENV === "production" ? "warn" : "info";
}

function redactValue(key: string, value: unknown): unknown {
  if (REDACT_FIELD_NAMES.has(key)) return "[REDACTED]";
  if (typeof value === "string" && PRESIGNED_PATTERN.test(value)) {
    return "[REDACTED_PRESIGNED_URL]";
  }
  return value;
}

function redactFields(fields: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    output[key] = redactValue(key, value);
  }
  return output;
}

function write(level: LogLevel, event: string, fields?: Record<string, unknown>): void {
  if (LEVEL_RANK[level] < LEVEL_RANK[currentLevel()]) return;

  const entry = {
    level,
    event,
    ts: new Date().toISOString(),
    ...(fields ? redactFields(fields) : {}),
  };

  const line = JSON.stringify(entry);
  if (level === "error") {
    console.error(line);
    return;
  }
  if (level === "warn") {
    console.warn(line);
    return;
  }
  console.log(line);
}

export const log = {
  info: (event: string, fields?: Record<string, unknown>) => write("info", event, fields),
  warn: (event: string, fields?: Record<string, unknown>) => write("warn", event, fields),
  error: (event: string, fields?: Record<string, unknown>) => write("error", event, fields),
};
