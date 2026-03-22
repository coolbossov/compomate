import { DB_TABLES } from "@/lib/constants";
import { getSupabaseAdminClient, isSupabaseConfigured } from "@/lib/server/supabase-admin";

export type R2ObjectPurpose = "subject" | "backdrop" | "export";

function getSupabaseClientOrThrow() {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase is not configured.");
  }

  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    throw new Error("Supabase admin client unavailable.");
  }

  return supabase;
}

export async function recordR2ObjectOwnership(
  key: string,
  sessionId: string,
  purpose: R2ObjectPurpose,
): Promise<void> {
  const supabase = getSupabaseClientOrThrow();

  const ttlMs = purpose === "export" ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();

  const { error } = await supabase
    .from(DB_TABLES.R2_OBJECTS)
    .insert({
      key,
      session_id: sessionId,
      purpose,
      expires_at: expiresAt,
    });

  if (error) {
    throw error;
  }
}

export async function verifyR2ObjectOwnership(key: string, sessionId: string): Promise<boolean> {
  const supabase = getSupabaseClientOrThrow();

  const { data, error } = await supabase
    .from(DB_TABLES.R2_OBJECTS)
    .select("key")
    .eq("key", key)
    .eq("session_id", sessionId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return Boolean(data?.key);
}

export async function removeR2ObjectOwnership(key: string, sessionId: string): Promise<void> {
  const supabase = getSupabaseClientOrThrow();

  const { error } = await supabase
    .from(DB_TABLES.R2_OBJECTS)
    .delete()
    .eq("key", key)
    .eq("session_id", sessionId);

  if (error) {
    throw error;
  }
}
