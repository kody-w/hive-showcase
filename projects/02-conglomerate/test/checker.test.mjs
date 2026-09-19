import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { inspectCsv, parseCsv, MAX_BYTES, MAX_RECORDS, MAX_FINDINGS } from "../csv-checker.mjs";

const options = { key: "id", required: ["id", "note"] };
const codes = report => report.findings.map(f => f.code);

test("actual frozen fixture exposes its duplicated key at record 5, column 2", () => {
  const fixture = readFileSync(new URL("../data/csv-intake.csv", import.meta.url));
  const before = Buffer.from(fixture);
  const report = inspectCsv(fixture, { key: "invoice-id", required: ["invoice-id", "amount-usd"] });
  assert.equal(report.status, "findings");
  assert.equal(report.dataRecords, 5);
  assert.equal(report.findingCount, 1);
  assert.deepEqual(report.findings[0], {
    code: "duplicate-key", message: "Key repeats an earlier record after trimming; compare the two source records.",
    record: 5, line: 5, column: 2, relatedRecord: 4
  });
  assert.deepEqual(fixture, before);
  assert.ok(!JSON.stringify(report).includes("sample-003"));
});

test("clean UTF-8 comma CSV with BOM and CRLF passes without changing bytes", () => {
  const input = new TextEncoder().encode('\uFEFFid,note\r\n1,"café, drawer"\r\n2,"a ""quoted"" note"\r\n');
  const before = Uint8Array.from(input);
  const report = inspectCsv(input, options);
  assert.equal(report.status, "pass");
  assert.equal(report.dataRecords, 2);
  assert.deepEqual(input, before);
});

test("quoted multiline fields maintain logical record and physical line locations", () => {
  const report = inspectCsv('id,note\r\nA,"one\r\ntwo"\r\nA,"comma, ""quote"""\r\n', options);
  assert.equal(report.findingCount, 1);
  assert.deepEqual([report.findings[0].record, report.findings[0].line, report.findings[0].relatedRecord], [3, 4, 2]);
  assert.deepEqual(parseCsv('a,b\n1,"x,y"\n')[1].cells, ["1", "x,y"]);
});

test("headers, required columns, widths and empty values get distinct finding codes", () => {
  const headerReport = inspectCsv("id,id,\nA,A,x\n", { key: "missing", required: ["missing"] });
  assert.deepEqual(codes(headerReport), ["duplicate-header", "blank-header", "required-column-missing", "key-column-missing"]);
  const rowReport = inspectCsv("id,note\nA\n,hello,extra\n", options);
  assert.deepEqual(codes(rowReport), ["row-width", "required-value-missing", "row-width", "required-value-missing"]);
});

test("duplicate comparisons trim keys, remain case-sensitive and tolerate unusual strings", () => {
  const report = inspectCsv("id,note\n __proto__,a\n__proto__,b\nAlpha,c\nalpha,d\n", options);
  assert.deepEqual(codes(report), ["duplicate-key"]);
  assert.equal(report.findings[0].record, 3);
  assert.equal(inspectCsv("id,note\n,a\n", { key: "id", required: [] }).findings[0].code, "empty-key");
});

test("formula-like cells are never evaluated or echoed; negatives are conservatively flagged", () => {
  const report = inspectCsv('id,note\n1, =PRIVATE_MARKER()\n2,-12.50\n3,+x\n4,@x\n5,<script>PRIVATE_MARKER</script>\n', options);
  assert.equal(report.findingCount, 4);
  assert.ok(report.findings.every(f => f.code === "formula-like"));
  assert.ok(!JSON.stringify(report).includes("PRIVATE_MARKER"));
});

test("malformed quoting is refused instead of silently mis-parsed", () => {
  for (const text of ['id,note\n1,"unfinished', 'id,note\n1,ba"d\n', 'id,note\n1,"closed"tail\n', 'id,note\n1,"closed" \n']) {
    const report = inspectCsv(text, options);
    assert.equal(report.status, "refused");
    assert.deepEqual(codes(report), ["malformed-csv"]);
  }
});

test("empty and binary input, invalid UTF-8 and invalid options are refused", () => {
  for (const [input, code] of [
    ["", "empty-input"], ["\uFEFF", "empty-input"], ["id\n\u0000", "binary-input"],
    [Uint8Array.of(0xc3, 0x28), "invalid-utf8"], [null, "invalid-input"]
  ]) {
    const report = inspectCsv(input);
    assert.equal(report.status, "refused");
    assert.equal(report.findings[0].code, code);
  }
  assert.equal(inspectCsv("id\n1\n", { required: [null] }).findings[0].code, "invalid-options");
});

test("1 MiB byte limit is exact, including multibyte UTF-8", () => {
  const exact = `id\n${"a".repeat(MAX_BYTES - 3)}`;
  assert.equal(inspectCsv(exact, { key: "id", required: [] }).status, "pass");
  assert.equal(inspectCsv(`${exact}a`).findings[0].code, "size-limit");
  assert.equal(inspectCsv(new Uint8Array(MAX_BYTES + 1)).findings[0].code, "size-limit");
  assert.equal(inspectCsv(`id\n${"é".repeat(MAX_BYTES / 2)}`).findings[0].code, "size-limit");
});

test("10,000 data-record limit excludes the header and handles a final newline", () => {
  const exact = `id\n${Array.from({ length: MAX_RECORDS }, (_, index) => index).join("\n")}\n`;
  assert.equal(inspectCsv(exact, { key: "id", required: [] }).dataRecords, 10000);
  const over = inspectCsv(`${exact}10000\n`, { key: "id", required: [] });
  assert.equal(over.status, "refused");
  assert.equal(over.findings[0].code, "record-limit");
});

test("reports cap displayed findings but retain an honest total and truncation flag", () => {
  const input = `id,note\n${Array.from({ length: 205 }, (_, i) => `${i},=x`).join("\n")}`;
  const report = inspectCsv(input, options);
  assert.equal(report.findingCount, 205);
  assert.equal(report.findings.length, MAX_FINDINGS);
  assert.equal(report.truncated, true);
});

test("disabled key and required checks are explicit; header-only input is not a clean dataset", () => {
  assert.equal(inspectCsv("id,note\nA,\nA,\n", { key: "", required: [] }).status, "pass");
  assert.deepEqual(codes(inspectCsv("id,note\n", options)), ["empty-data"]);
  assert.deepEqual(parseCsv("a,b\r1,2\r3,\r").map(row => row.cells), [["a", "b"], ["1", "2"], ["3", ""]]);
});
