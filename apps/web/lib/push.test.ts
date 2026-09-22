import { describe, expect, it } from "vitest";
import { MAX_ROWS, ROW_TOKEN_CAP, parsePeriodStart, parseWholeHour, rowTokenCap, validatePush } from "./push";

const NOW = new Date("2026-09-22T13:20:00Z");

function row(over: Record<string, unknown> = {}) {
  return {
    v: 1,
    ts: "2026-09-22T12:00:00Z",
    source: "claude",
    model: "claude-opus-5-5",
    input: 10,
    cache_read: 20,
    cache_write_5m: 30,
    cache_write_1h: 0,
    output: 40,
    reasoning: 0,
    requests: 1,
    conversations: 1,
    ...over,
  };
}

const body = (rows: unknown[], extra: Record<string, unknown> = {}) => ({ v: 1, deviceId: "0b7c8a52-7d1e-4a55-9a53-1f3f5f1c2d11", ...extra, rows });

describe("parseWholeHour", () => {
  it("accepts whole UTC hours in any ISO spelling and canonicalises them", () => {
    expect(parseWholeHour("2026-09-22T13:00:00Z")).toBe("2026-09-22T13:00:00.000Z");
    expect(parseWholeHour("2026-09-22T13:00:00.000Z")).toBe("2026-09-22T13:00:00.000Z");
    expect(parseWholeHour("2026-09-22T15:00:00+02:00")).toBe("2026-09-22T13:00:00.000Z");
  });

  it("rejects anything that is not on the hour", () => {
    expect(parseWholeHour("2026-09-22T13:30:00Z")).toBeNull();
    expect(parseWholeHour("2026-09-22T13:00:01Z")).toBeNull();
    expect(parseWholeHour("2026-09-22T13:00:00.001Z")).toBeNull();
    // +05:30 turns a local whole hour into a UTC half hour
    expect(parseWholeHour("2026-09-22T13:00:00+05:30")).toBeNull();
  });

  it("rejects timestamps without a zone or in other formats", () => {
    expect(parseWholeHour("2026-09-22T13:00:00")).toBeNull();
    expect(parseWholeHour("2026-09-22 13:00:00Z")).toBeNull();
    expect(parseWholeHour("1758546000")).toBeNull();
    expect(parseWholeHour("not a date")).toBeNull();
  });
});

describe("validatePush envelope", () => {
  it("accepts a well-formed body", () => {
    const res = validatePush(body([row()]), NOW);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0].ts).toBe("2026-09-22T12:00:00.000Z");
    expect(res.rejected).toEqual([]);
  });

  it("rejects a wrong version, missing deviceId or non-array rows", () => {
    expect(validatePush({ v: 2, deviceId: "x", rows: [] }, NOW).ok).toBe(false);
    expect(validatePush({ v: 1, rows: [] }, NOW).ok).toBe(false);
    expect(validatePush({ v: 1, deviceId: "x", rows: {} }, NOW).ok).toBe(false);
    expect(validatePush(null, NOW).ok).toBe(false);
  });

  it(`rejects more than ${MAX_ROWS} rows`, () => {
    const rows = Array.from({ length: MAX_ROWS + 1 }, () => row());
    expect(validatePush(body(rows), NOW).ok).toBe(false);
    expect(validatePush(body(rows.slice(0, MAX_ROWS)), NOW).ok).toBe(true);
  });
});

describe("validatePush rows", () => {
  function rejectedReasons(rows: unknown[]) {
    const res = validatePush(body(rows), NOW);
    if (!res.ok) throw new Error("envelope should be valid");
    return res;
  }

  it("rejects rows that are not on the hour, with their index", () => {
    const res = rejectedReasons([row(), row({ ts: "2026-09-22T12:30:00Z" })]);
    expect(res.rows).toHaveLength(1);
    expect(res.rejected).toEqual([{ index: 1, reason: expect.stringContaining("whole UTC hour") }]);
  });

  it("allows 5 minutes of clock skew into the future and no more", () => {
    // 13:00 is 20 minutes in the past relative to NOW; 14:00 is 40 minutes ahead
    const now = new Date("2026-09-22T13:56:00Z");
    const ok = validatePush(body([row({ ts: "2026-09-22T14:00:00Z" })]), now);
    expect(ok.ok && ok.rejected).toEqual([]);
    const late = validatePush(body([row({ ts: "2026-09-22T14:00:00Z" })]), new Date("2026-09-22T13:54:00Z"));
    expect(late.ok && late.rejected[0].reason).toContain("future");
  });

  it("rejects unknown sources", () => {
    const res = rejectedReasons([row({ source: "copilot" })]);
    expect(res.rejected[0].reason).toMatch(/^source/);
  });

  it("rejects negative, fractional and non-numeric counts", () => {
    const res = rejectedReasons([row({ input: -1 }), row({ output: 1.5 }), row({ cache_read: "10" }), row({ requests: 2 ** 31 })]);
    expect(res.rows).toHaveLength(0);
    expect(res.rejected.map((r) => r.index)).toEqual([0, 1, 2, 3]);
  });

  it(`rejects rows over ${ROW_TOKEN_CAP} tokens per hour and keeps the rest`, () => {
    const res = rejectedReasons([
      row({ cache_read: ROW_TOKEN_CAP }),
      row({ ts: "2026-09-22T11:00:00Z", cache_read: ROW_TOKEN_CAP - 100, input: 0, cache_write_5m: 0, output: 0 }),
    ]);
    expect(res.rejected).toEqual([{ index: 0, reason: expect.stringContaining("cap") }]);
    expect(res.rows).toHaveLength(1);
  });

  it("does not count reasoning toward the cap (it is already inside output)", () => {
    const res = rejectedReasons([row({ reasoning: ROW_TOKEN_CAP * 2 })]);
    expect(res.rejected).toEqual([]);
  });

  it("defaults the optional counters and keeps the last row per key", () => {
    const { v: _v, reasoning: _r, requests: _q, conversations: _c, ...bare } = row();
    const res = rejectedReasons([bare, row({ output: 999 })]);
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0].output).toBe(999);
    const single = rejectedReasons([bare]);
    expect(single.rows[0]).toMatchObject({ reasoning: 0, requests: 0, conversations: 0 });
  });

  it("rejects empty or oversized model names", () => {
    const res = rejectedReasons([row({ model: "" }), row({ model: "x".repeat(129) })]);
    expect(res.rejected).toHaveLength(2);
  });
});

describe("parsePeriodStart", () => {
  // 2026-09-21 is a Monday
  it("hour accepts any whole hour", () => {
    expect(parsePeriodStart("2026-09-22T13:00:00Z", "hour")).toBe("2026-09-22T13:00:00.000Z");
    expect(parsePeriodStart("2026-09-22T13:30:00Z", "hour")).toBeNull();
  });

  it("day accepts 00:00 UTC only", () => {
    expect(parsePeriodStart("2026-09-22T00:00:00Z", "day")).toBe("2026-09-22T00:00:00.000Z");
    expect(parsePeriodStart("2026-09-22T02:00:00+02:00", "day")).toBe("2026-09-22T00:00:00.000Z");
    expect(parsePeriodStart("2026-09-22T13:00:00Z", "day")).toBeNull();
    // local midnight is not UTC midnight
    expect(parsePeriodStart("2026-09-22T00:00:00+02:00", "day")).toBeNull();
  });

  it("week accepts Monday 00:00 UTC only", () => {
    expect(parsePeriodStart("2026-09-21T00:00:00Z", "week")).toBe("2026-09-21T00:00:00.000Z");
    expect(parsePeriodStart("2026-09-22T00:00:00Z", "week")).toBeNull(); // Tuesday
    expect(parsePeriodStart("2026-09-20T00:00:00Z", "week")).toBeNull(); // Sunday
    expect(parsePeriodStart("2026-09-21T01:00:00Z", "week")).toBeNull();
  });
});

describe("validatePush granularity", () => {
  const NOW_G = new Date("2026-09-23T10:00:00Z");

  it("defaults to hour and no replace when the envelope says nothing", () => {
    const res = validatePush(body([row()]), NOW);
    expect(res.ok && res.granularity).toBe("hour");
    expect(res.ok && res.replaceDevice).toBe(false);
    expect(res.ok && res.rows[0].granularity).toBe("hour");
  });

  it("rejects an unknown granularity or a non-boolean replaceDevice as a bad envelope", () => {
    expect(validatePush(body([row()], { granularity: "month" }), NOW).ok).toBe(false);
    expect(validatePush(body([row()], { replaceDevice: "yes" }), NOW).ok).toBe(false);
  });

  it("day: keeps rows at 00:00 UTC and rejects the rest with a reason", () => {
    const res = validatePush(
      body([row({ ts: "2026-09-22T00:00:00Z" }), row({ ts: "2026-09-22T12:00:00Z" }), row({ ts: "2026-09-23T00:00:00Z", model: "m2" })], {
        granularity: "day",
      }),
      NOW_G,
    );
    if (!res.ok) throw new Error("envelope should be valid");
    expect(res.granularity).toBe("day");
    expect(res.rows.map((r) => [r.ts, r.granularity])).toEqual([
      ["2026-09-22T00:00:00.000Z", "day"],
      ["2026-09-23T00:00:00.000Z", "day"],
    ]);
    expect(res.rejected).toEqual([{ index: 1, reason: expect.stringContaining("00:00 UTC") }]);
  });

  it("week: keeps rows on Monday 00:00 UTC only", () => {
    const res = validatePush(
      body([row({ ts: "2026-09-21T00:00:00Z" }), row({ ts: "2026-09-22T00:00:00Z" }), row({ ts: "2026-09-14T00:00:00Z" })], {
        granularity: "week",
      }),
      NOW_G,
    );
    if (!res.ok) throw new Error("envelope should be valid");
    expect(res.rows.map((r) => r.ts)).toEqual(["2026-09-21T00:00:00.000Z", "2026-09-14T00:00:00.000Z"]);
    expect(res.rejected).toEqual([{ index: 1, reason: expect.stringContaining("Monday") }]);
  });

  it("an hourly ts that is not a period start is rejected under a coarser granularity", () => {
    const res = validatePush(body([row({ ts: "2026-09-21T05:00:00Z" })], { granularity: "week" }), NOW_G);
    expect(res.ok && res.rows).toEqual([]);
  });

  it("scales the token cap: x24 for day, x168 for week", () => {
    expect(rowTokenCap("hour")).toBe(ROW_TOKEN_CAP);
    expect(rowTokenCap("day")).toBe(ROW_TOKEN_CAP * 24);
    expect(rowTokenCap("week")).toBe(ROW_TOKEN_CAP * 168);
    const big = { input: 0, cache_write_5m: 0, output: 0 };
    const day = validatePush(
      body(
        [
          row({ ts: "2026-09-22T00:00:00Z", ...big, cache_read: ROW_TOKEN_CAP * 24 - 10 }),
          row({ ts: "2026-09-21T00:00:00Z", ...big, cache_read: ROW_TOKEN_CAP * 24 + 1 }),
        ],
        { granularity: "day" },
      ),
      NOW_G,
    );
    expect(day.ok && day.rows).toHaveLength(1);
    expect(day.ok && day.rejected).toEqual([{ index: 1, reason: expect.stringContaining("per day cap") }]);
    const week = validatePush(body([row({ ts: "2026-09-21T00:00:00Z", ...big, cache_read: ROW_TOKEN_CAP * 100 })], { granularity: "week" }), NOW_G);
    expect(week.ok && week.rejected).toEqual([]);
    // the same row is far over the hourly cap
    const hour = validatePush(body([row({ ts: "2026-09-21T00:00:00Z", ...big, cache_read: ROW_TOKEN_CAP * 100 })]), NOW_G);
    expect(hour.ok && hour.rejected).toHaveLength(1);
  });

  it("carries replaceDevice through", () => {
    const res = validatePush(body([row({ ts: "2026-09-21T00:00:00Z" })], { granularity: "week", replaceDevice: true }), NOW_G);
    expect(res.ok && res.replaceDevice).toBe(true);
    const off = validatePush(body([row()], { replaceDevice: false }), NOW);
    expect(off.ok && off.replaceDevice).toBe(false);
  });

  it("accepts exactly what the CLI's push --dry-run prints for a week push", () => {
    const cli = {
      v: 1,
      deviceId: "0b7c8a52-7d1e-4a55-9a53-1f3f5f1c2d11",
      granularity: "week",
      replaceDevice: true,
      rows: [{ ...row(), ts: "2026-09-21T00:00:00Z" }],
    };
    const res = validatePush(cli, NOW_G);
    expect(res.ok && res.rejected).toEqual([]);
    expect(res.ok && res.rows[0]).toMatchObject({ ts: "2026-09-21T00:00:00.000Z", granularity: "week" });
  });
});
