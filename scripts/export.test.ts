import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchAllRows } from "../src/lib/supabase/pagination";

for (const count of [0, 999, 1000, 1001, 2507, 100001]) {
  test(`exports all ${count} records without duplicates or omissions`, async () => {
    const source = Array.from({ length: count }, (_, id) => ({ id }));
    const result = await fetchAllRows((from, to) => Promise.resolve({
      data: source.slice(from, Math.min(to + 1, from + 1000)), error: null,
    }));
    assert.equal(result.error, null);
    assert.deepEqual(result.data, source);
  });
}

test("continues when the server returns fewer rows than the requested page size", async () => {
  const source = Array.from({ length: 1234 }, (_, id) => ({ id }));
  const starts: number[] = [];
  const result = await fetchAllRows((from) => {
    starts.push(from);
    return Promise.resolve({ data: source.slice(from, from + 400), error: null });
  });
  assert.deepEqual(result.data, source);
  assert.deepEqual(starts, [0, 400, 800, 1200, 1234]);
});

test("does not return a partial export when a later page fails", async () => {
  const error = { message: "Database unavailable" };
  const result = await fetchAllRows((from) => Promise.resolve(
    from === 0 ? { data: [{ id: 1 }], error: null } : { data: null, error },
  ));
  assert.deepEqual(result, { data: [], error });
});

test("propagates a rejected page request", async () => {
  await assert.rejects(fetchAllRows(() => Promise.reject(new Error("Network error"))), /Network error/);
});