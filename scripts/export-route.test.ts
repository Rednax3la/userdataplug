import assert from "node:assert/strict";
import { test } from "node:test";
import { NextRequest } from "next/server";
import Papa from "papaparse";
import * as XLSX from "xlsx";

const serverPath = require.resolve("../src/lib/supabase/server");
require(serverPath);
const server = { createClient: async (): Promise<any> => { throw new Error("Missing test client"); } };
require.cache[serverPath]!.exports = server;
const source = Array.from({ length: 2507 }, (_, id) => ({
  id: String(id), full_name: `Person ${id}`, first_name: `First ${id}`,
  last_name: 'Last, "Quoted"', email: `person${id}@example.test`, phone: "+254712345678",
  country: "KE", gender: "F", opted_out: false, is_duplicate: false,
  confidence_score: 0.9, created_at: "2026-01-01T00:00:00Z",
}));
const { GET } = require("../src/app/api/export/route");

for (const format of ["csv", "meta", "xlsx"]) {
  test(`${format} route exports every page and preserves filter/order settings`, async () => {
    const calls: unknown[][] = [];
    const query: Record<string, any> = {};
    for (const method of ["select", "eq", "gte", "not", "is", "order"]) {
      query[method] = (...args: unknown[]) => { calls.push([method, ...args]); return query; };
    }
    query.range = async (from: number, to: number) => {
      calls.push(["range", from, to]);
      return { data: source.slice(from, to + 1), error: null };
    };
    server.createClient = async () => ({
      auth: { getUser: async () => ({ data: { user: { id: "test-user" } } }) },
      from: () => query,
    });
    const response = await GET(new NextRequest(`http://localhost/api/export?format=${format}&country=KE&gender=F&min_confidence=0.5&has=both`));
    assert.equal(response.status, 200);
    let rows: Record<string, unknown>[];
    if (format === "xlsx") {
      const workbook = XLSX.read(Buffer.from(await response.arrayBuffer()), { type: "buffer" });
      rows = XLSX.utils.sheet_to_json(workbook.Sheets.Contacts);
    } else {
      const parsed = Papa.parse<Record<string, unknown>>(await response.text(), { header: true });
      assert.deepEqual(parsed.errors, []);
      rows = parsed.data;
    }
    assert.equal(rows.length, source.length);
    assert.equal(rows[2506].email, source[2506].email);
    assert.equal(rows[0][format === "meta" ? "ln" : "last_name"], source[0].last_name);
    for (const call of [
      ["eq", "is_duplicate", false], ["eq", "opted_out", false],
      ["eq", "country", "KE"], ["eq", "gender", "F"], ["gte", "confidence_score", 0.5],
      ["not", "email", "is", null], ["not", "phone", "is", null],
      ["order", "created_at", { ascending: false }], ["order", "id", { ascending: false }],
    ]) assert.ok(calls.some(actual => JSON.stringify(actual) === JSON.stringify(call)), JSON.stringify(call));
    assert.deepEqual(calls.filter(call => call[0] === "range"), [
      ["range", 0, 999], ["range", 1000, 1999], ["range", 2000, 2999], ["range", 2507, 3506],
    ]);
  });
}

test("export route rejects unauthenticated requests", async () => {
  server.createClient = async () => ({ auth: { getUser: async () => ({ data: { user: null } }) } });
  const response = await GET(new NextRequest("http://localhost/api/export"));
  assert.equal(response.status, 401);
});