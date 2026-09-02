import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/supabase-admin", () => ({
  isSupabaseConfigured: vi.fn().mockReturnValue(true),
  getSupabaseAdminClient: vi.fn(),
}));

import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";
import { retainR2Objects } from "./r2-ownership";

function mockRetention(rows: Array<{ key: string }>, error: unknown = null) {
  const select = vi.fn().mockResolvedValue({ data: rows, error });
  const inKeys = vi.fn().mockReturnValue({ select });
  const eq = vi.fn().mockReturnValue({ in: inKeys });
  const update = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ update });
  vi.mocked(getSupabaseAdminClient).mockReturnValue({ from } as never);
  return { from, update, eq, inKeys, select };
}

describe("retainR2Objects", () => {
  beforeEach(() => vi.clearAllMocks());

  it("clears expiry only for unique assets owned by the current session", async () => {
    const db = mockRetention([{ key: "backdrops/a.jpg" }, { key: "backdrops/b.jpg" }]);

    await retainR2Objects(
      ["backdrops/a.jpg", "backdrops/b.jpg", "backdrops/a.jpg"],
      "session-123",
    );

    expect(db.update).toHaveBeenCalledWith({ expires_at: null });
    expect(db.eq).toHaveBeenCalledWith("session_id", "session-123");
    expect(db.inKeys).toHaveBeenCalledWith("key", ["backdrops/a.jpg", "backdrops/b.jpg"]);
    expect(db.select).toHaveBeenCalledWith("key");
  });

  it("rejects when any requested asset is not owned by the session", async () => {
    mockRetention([{ key: "backdrops/a.jpg" }]);

    await expect(
      retainR2Objects(["backdrops/a.jpg", "backdrops/b.jpg"], "session-123"),
    ).rejects.toThrow(/not owned by this session/i);
  });

  it("does not query storage ownership when the project has no R2 assets", async () => {
    await retainR2Objects([], "session-123");

    expect(getSupabaseAdminClient).not.toHaveBeenCalled();
  });
});
