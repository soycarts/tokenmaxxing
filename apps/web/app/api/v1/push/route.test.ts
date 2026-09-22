import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The push route against a fake service-role client: which write path a request takes, and
 * that `replaceDevice` is honoured on the request that carries it and on no other.
 */
type Call = { op: string; table?: string; fn?: string; args?: unknown; rows?: unknown[] };
const calls: Call[] = [];
let rpcError: { message: string } | null = null;

const fake = {
  from(table: string) {
    const q = {
      select: () => q,
      eq: () => q,
      maybeSingle: async () => ({ data: { token_hash: "h", user_id: "user-1", device_id: "device-1" }, error: null }),
      upsert: async (rows: unknown[]) => {
        calls.push({ op: "upsert", table, rows });
        return { error: null };
      },
      update: (v: unknown) => {
        calls.push({ op: "update", table, args: v });
        return { eq: async () => ({ error: null }) };
      },
    };
    return q;
  },
  rpc: async (fn: string, args: { p_rows: unknown[] }) => {
    calls.push({ op: "rpc", fn, args });
    return rpcError ? { data: null, error: rpcError } : { data: args.p_rows.length, error: null };
  },
};

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => fake }));

const { POST } = await import("./route");

function row(ts: string, over: Record<string, unknown> = {}) {
  return { ts, source: "claude", model: "claude-opus-5-5", input: 1, cache_read: 2, cache_write_5m: 3, cache_write_1h: 0, output: 4, ...over };
}

function push(body: unknown, token = "tmx_test") {
  return POST(
    new Request("http://localhost/api/v1/push", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  calls.length = 0;
  rpcError = null;
});

describe("POST /api/v1/push", () => {
  it("upserts hourly rows with granularity hour when the envelope has none (pre-0.2 CLI)", async () => {
    const res = await push({ v: 1, deviceId: "d", rows: [row("2020-01-01T10:00:00Z")] });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ accepted: 1, rejected: [] });
    const up = calls.find((c) => c.op === "upsert")!;
    expect(up.rows).toEqual([expect.objectContaining({ granularity: "hour", user_id: "user-1", device_id: "device-1" })]);
    expect(calls.some((c) => c.op === "rpc")).toBe(false);
  });

  it("replaceDevice: one RPC with the device from the token, no upsert", async () => {
    const res = await push({
      v: 1,
      deviceId: "someone-elses-device",
      granularity: "week",
      replaceDevice: true,
      rows: [row("2020-01-06T00:00:00Z"), row("2020-01-07T00:00:00Z")],
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.accepted).toBe(1);
    expect(body.replaced).toBe(true);
    expect(body.rejected).toEqual([{ index: 1, reason: expect.stringContaining("Monday") }]);
    const rpc = calls.filter((c) => c.op === "rpc");
    expect(rpc).toHaveLength(1);
    expect(rpc[0].fn).toBe("replace_device_buckets");
    expect(rpc[0].args).toEqual({
      p_device: "device-1",
      p_rows: [expect.objectContaining({ ts: "2020-01-06T00:00:00.000Z", granularity: "week" })],
    });
    // rows sent to the RPC never carry a user or device of their own
    expect((rpc[0].args as { p_rows: object[] }).p_rows[0]).not.toHaveProperty("user_id");
    expect(calls.some((c) => c.op === "upsert")).toBe(false);
    expect(calls.filter((c) => c.op === "update").map((c) => c.table).sort()).toEqual(["api_tokens", "devices"]);
  });

  it("a follow-up batch without replaceDevice upserts and deletes nothing", async () => {
    await push({ v: 1, deviceId: "d", granularity: "day", rows: [row("2020-01-06T00:00:00Z")] });
    expect(calls.some((c) => c.op === "rpc")).toBe(false);
    expect(calls.find((c) => c.op === "upsert")!.rows).toEqual([expect.objectContaining({ granularity: "day" })]);
  });

  it("replaceDevice: false is an ordinary upsert", async () => {
    await push({ v: 1, deviceId: "d", replaceDevice: false, rows: [row("2020-01-01T10:00:00Z")] });
    expect(calls.some((c) => c.op === "rpc")).toBe(false);
    expect(calls.some((c) => c.op === "upsert")).toBe(true);
  });

  it("a failed replace is a 500 and does not touch last_push_at", async () => {
    rpcError = { message: "boom" };
    const res = await push({ v: 1, deviceId: "d", replaceDevice: true, rows: [row("2020-01-01T10:00:00Z")] });
    expect(res.status).toBe(500);
    expect(calls.some((c) => c.op === "update")).toBe(false);
  });

  it("a bad envelope is a 400 before anything is written, even with replaceDevice", async () => {
    const res = await push({ v: 1, deviceId: "d", granularity: "fortnight", replaceDevice: true, rows: [] });
    expect(res.status).toBe(400);
    expect(calls.filter((c) => c.op !== "update")).toEqual([]);
  });

  it("needs a bearer token", async () => {
    const res = await POST(new Request("http://localhost/api/v1/push", { method: "POST", body: "{}" }));
    expect(res.status).toBe(401);
  });
});
