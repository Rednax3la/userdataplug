import assert from "node:assert/strict";
import { test } from "node:test";
import { extractFromTable, parseCSV, parseExcel } from "../src/lib/extraction/pipeline";
import { normalizePhone, normalizeEmail } from "../src/lib/extraction/normalizers";
import { findDuplicates } from "../src/lib/extraction/deduplicator";
import * as XLSX from "xlsx";
import type { Contact } from "../src/types";

const rows = [["Name", "Email", "Phone"], ["Jane Doe", "JANE@example.test", "0712345678"]];
test("table extraction recognizes contact columns", () => {
  const entities = extractFromTable(rows);
  assert.equal(entities.length, 1);
  assert.equal(entities[0].full_name, "Jane Doe");
});
test("CSV parsing retains more than 1000 contacts", async () => {
  const csv = "Name,Email\n" + Array.from({ length: 1501 }, (_, i) => `Person ${i},p${i}@example.test`).join("\n");
  const result = await parseCSV(new TextEncoder().encode(csv).buffer);
  assert.equal(result.length, 1501);
});
test("Excel parsing reads contact rows", async () => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "Contacts");
  const entities = await parseExcel(XLSX.write(wb, { type: "array", bookType: "xlsx" }));
  assert.equal(entities.length, 1);
  assert.equal(entities[0].email?.toLowerCase(), "jane@example.test");
});
test("normalization and duplicate matching recognize equivalent contact details", () => {
  assert.equal(normalizePhone("0712 345 678"), "+254712345678");
  assert.equal(normalizeEmail(" JANE@EXAMPLE.TEST "), "jane@example.test");
  const matches = findDuplicates({ email: "JANE@example.test", confidence_score: 0.9 }, [
    { id: "existing", email: "jane@example.test" } as Contact,
  ]);
  assert.equal(matches[0].contact_id, "existing");
});