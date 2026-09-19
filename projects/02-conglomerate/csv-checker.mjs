export const MAX_BYTES = 1024 * 1024;
export const MAX_RECORDS = 10000;
export const MAX_FINDINGS = 200;

class CsvRefusal extends Error {
  constructor(code, message, line = null) {
    super(message);
    this.code = code;
    this.line = line;
  }
}

export function parseCsv(text) {
  const rows = [];
  let cells = [], cell = "", state = "start", touched = false, line = 1, startLine = 1;
  const field = () => { cells.push(cell); cell = ""; state = "start"; };
  const record = () => {
    field();
    rows.push({ cells, line: startLine });
    if (rows.length > MAX_RECORDS + 1) throw new CsvRefusal("record-limit", "More than 10,000 data records; split the fictional input first.", startLine);
    cells = [];
    touched = false;
  };
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (state === "quoted") {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i += 1; }
        else state = "closed";
      } else if (ch === "\r" || ch === "\n") {
        if (ch === "\r" && text[i + 1] === "\n") i += 1;
        cell += "\n";
        line += 1;
      } else cell += ch;
      continue;
    }
    if (ch === "\r" || ch === "\n") {
      record();
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      line += 1;
      startLine = line;
    } else if (ch === ",") {
      field();
      touched = true;
    } else if (ch === '"' && state === "start") {
      state = "quoted";
      touched = true;
    } else {
      if (state === "closed" || ch === '"') throw new CsvRefusal("malformed-csv", "Unexpected character around a quoted field; strict comma-separated CSV is required.", line);
      cell += ch;
      state = "plain";
      touched = true;
    }
  }
  if (state === "quoted") throw new CsvRefusal("malformed-csv", "An opening quote has no closing quote.", line);
  if (touched || cells.length || cell.length || state !== "start") record();
  return rows;
}

export function inspectCsv(input, options = {}) {
  let byteLength = 0;
  try {
    let text;
    if (typeof input === "string") {
      byteLength = new TextEncoder().encode(input).byteLength;
      text = input;
    } else if (input instanceof Uint8Array) {
      byteLength = input.byteLength;
      if (byteLength > MAX_BYTES) throw new CsvRefusal("size-limit", "Input exceeds the 1 MiB local limit.");
      try { text = new TextDecoder("utf-8", { fatal: true }).decode(input); }
      catch { throw new CsvRefusal("invalid-utf8", "Input must be valid UTF-8 text."); }
    } else throw new CsvRefusal("invalid-input", "Provide text or UTF-8 bytes.");
    if (byteLength > MAX_BYTES) throw new CsvRefusal("size-limit", "Input exceeds the 1 MiB local limit.");
    text = text.replace(/^\uFEFF/, "");
    if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(text)) throw new CsvRefusal("binary-input", "Binary control characters are not accepted.");
    const key = options.key === undefined ? "invoice-id" : options.key;
    const required = options.required === undefined ? ["invoice-id"] : options.required;
    if (typeof key !== "string" || !Array.isArray(required) || required.some(k => typeof k !== "string" || !k.trim())) {
      throw new CsvRefusal("invalid-options", "Key must be text and required columns must be a list of nonempty names.");
    }
    const rows = parseCsv(text);
    if (!rows.length) throw new CsvRefusal("empty-input", "No header record was found.");
    const headers = rows[0].cells.map(h => h.trim());
    let findingCount = 0;
    const findings = [];
    const add = (code, message, rowIndex, column = null, relatedRecord = null) => {
      findingCount += 1;
      if (findings.length < MAX_FINDINGS) findings.push({
        code, message, record: rowIndex + 1, line: rows[rowIndex].line,
        column, ...(relatedRecord === null ? {} : { relatedRecord })
      });
    };
    const names = new Set();
    headers.forEach((header, index) => {
      if (!header) add("blank-header", "Header name is blank.", 0, index + 1);
      else if (names.has(header)) add("duplicate-header", "Header name is repeated after trimming.", 0, index + 1);
      names.add(header);
    });
    const requiredIndices = [...new Set(required.map(k => k.trim()))].map(name => {
      const index = headers.indexOf(name);
      if (index < 0) add("required-column-missing", "A configured required column is absent from the header.", 0);
      return index;
    }).filter(index => index >= 0);
    const keyIndex = key.trim() ? headers.indexOf(key.trim()) : -1;
    if (key.trim() && keyIndex < 0) add("key-column-missing", "The configured key column is absent from the header.", 0);
    const seenKeys = new Map();
    for (let i = 0; i < rows.length; i += 1) {
      const { cells } = rows[i];
      cells.forEach((value, column) => {
        if (/^\s*[=+\-@]/u.test(value)) add("formula-like", "Cell begins like a spreadsheet formula; nothing was evaluated. Negative numbers can also be flagged.", i, column + 1);
      });
      if (i === 0) continue;
      if (cells.length !== headers.length) add("row-width", `Record has ${cells.length} fields; header has ${headers.length}.`, i);
      for (const index of requiredIndices) {
        if (!(cells[index] ?? "").trim()) add("required-value-missing", "A required cell is empty or absent.", i, index + 1);
      }
      if (keyIndex >= 0) {
        const value = (cells[keyIndex] ?? "").trim();
        if (!value) {
          if (!requiredIndices.includes(keyIndex)) add("empty-key", "Key cell is empty or absent.", i, keyIndex + 1);
        } else if (seenKeys.has(value)) add("duplicate-key", "Key repeats an earlier record after trimming; compare the two source records.", i, keyIndex + 1, seenKeys.get(value));
        else seenKeys.set(value, i + 1);
      }
    }
    if (rows.length === 1) add("empty-data", "Only the header exists; no data records were checked.", 0);
    return {
      schema: "ledgerleaf-preflight/1",
      status: findingCount ? "findings" : "pass",
      bytes: byteLength, dataRecords: rows.length - 1, columns: headers.length,
      findingCount, truncated: findingCount > MAX_FINDINGS, findings,
      boundary: "Structural checks only; not import compatibility, financial correctness, sanitization or market evidence. Source values are not echoed or changed."
    };
  } catch (error) {
    if (!(error instanceof CsvRefusal)) throw error;
    return {
      schema: "ledgerleaf-preflight/1", status: "refused", bytes: byteLength,
      dataRecords: 0, columns: 0, findingCount: 1, truncated: false,
      findings: [{ code: error.code, message: error.message, record: null, line: error.line, column: null }],
      boundary: "Input was not fully checked; a refusal is not a clean result. No source values are echoed or changed."
    };
  }
}
