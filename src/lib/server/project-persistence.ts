import { isSupabaseConfigured } from "@/lib/server/supabase-admin";

export const INSECURE_PROJECT_PERSISTENCE_ENV =
  "COMPOMATE_ALLOW_UNAUTHENTICATED_PROJECT_PERSISTENCE";

export function getProjectPersistenceStatus(): {
  available: boolean;
  reason?: string;
} {
  if (!isSupabaseConfigured()) {
    return {
      available: false,
      reason: "Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    };
  }

  if (process.env[INSECURE_PROJECT_PERSISTENCE_ENV] !== "true") {
    return {
      available: false,
      reason:
        `Remote project persistence is disabled until auth is implemented. ` +
        `Set ${INSECURE_PROJECT_PERSISTENCE_ENV}=true only for trusted internal environments.`,
    };
  }

  return { available: true };
}
