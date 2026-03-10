import { describe, test, expect } from "bun:test";
import { withRetry, calculateBackoff } from "../src/services/retry.ts";

describe("calculateBackoff", () => {
  test("first attempt returns base delay (plus jitter)", () => {
    const delay = calculateBackoff(0, 1000, 30000);
    // base = 1000 * 2^0 = 1000, jitter up to 100
    expect(delay).toBeGreaterThanOrEqual(1000);
    expect(delay).toBeLessThanOrEqual(1100);
  });

  test("second attempt doubles the delay", () => {
    const delay = calculateBackoff(1, 1000, 30000);
    // base = 1000 * 2^1 = 2000, jitter up to 200
    expect(delay).toBeGreaterThanOrEqual(2000);
    expect(delay).toBeLessThanOrEqual(2200);
  });

  test("respects max delay", () => {
    const delay = calculateBackoff(10, 1000, 5000);
    expect(delay).toBeLessThanOrEqual(5000);
  });
});

describe("withRetry", () => {
  test("succeeds on first attempt", async () => {
    let calls = 0;
    const { result, retries } = await withRetry(async () => {
      calls++;
      return "ok";
    });

    expect(result).toBe("ok");
    expect(retries).toBe(0);
    expect(calls).toBe(1);
  });

  test("retries on failure then succeeds", async () => {
    let calls = 0;
    const { result, retries } = await withRetry(
      async () => {
        calls++;
        if (calls < 3) throw new Error("fail");
        return "recovered";
      },
      { maxRetries: 3, baseDelayMs: 10, maxDelayMs: 100 }
    );

    expect(result).toBe("recovered");
    expect(retries).toBe(2);
    expect(calls).toBe(3);
  });

  test("throws after max retries exhausted", async () => {
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls++;
          throw new Error("persistent failure");
        },
        { maxRetries: 2, baseDelayMs: 10, maxDelayMs: 100 }
      )
    ).rejects.toThrow("persistent failure");

    // 1 initial + 2 retries = 3 calls
    expect(calls).toBe(3);
  });

  test("uses default options when none provided", async () => {
    const { result } = await withRetry(async () => "default");
    expect(result).toBe("default");
  });

  test("wraps non-Error throws", async () => {
    await expect(
      withRetry(
        async () => {
          throw "string error";
        },
        { maxRetries: 0, baseDelayMs: 10, maxDelayMs: 100 }
      )
    ).rejects.toThrow("string error");
  });
});
