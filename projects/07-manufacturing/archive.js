(function (root) {
  "use strict";

  const SEED_NOTICE = `Inert seed data attribution — micro-manufacturing-company
Source: https://kody-w.github.io/hive-hub/
Source byte hashes and local data paths: data/source-provenance.json in the project.
Geometry, generator, previews, interface, ZIP writer, and tests are original local work.

MIT License

Copyright (c) 2026 Hive Hub contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`;

  function crc32(bytes) {
    let crc = 0xffffffff;
    for (const byte of bytes) {
      crc ^= byte;
      for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function concat(chunks) {
    const out = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
    let cursor = 0;
    for (const chunk of chunks) { out.set(chunk, cursor); cursor += chunk.length; }
    return out;
  }

  function header(size, signature) {
    const bytes = new Uint8Array(size);
    const view = new DataView(bytes.buffer);
    view.setUint32(0, signature, true);
    return { bytes, view };
  }

  // Stored (uncompressed) ZIP entries; fixed DOS date makes the archive reproducible.
  function zip(files) {
    const encoder = new TextEncoder();
    const local = [], central = [], seen = new Set();
    let offset = 0;
    for (const [name, content] of Object.entries(files)) {
      if (!/^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/.test(name) || name.split("/").includes("..") || seen.has(name)) {
        throw new RangeError("Unsafe or duplicate ZIP entry.");
      }
      seen.add(name);
      const filename = encoder.encode(name);
      const body = typeof content === "string" ? encoder.encode(content) : content;
      const crc = crc32(body);
      const l = header(30, 0x04034b50);
      l.view.setUint16(4, 20, true);
      l.view.setUint16(6, 0x0800, true);
      l.view.setUint16(12, 33, true);
      l.view.setUint32(14, crc, true);
      l.view.setUint32(18, body.length, true);
      l.view.setUint32(22, body.length, true);
      l.view.setUint16(26, filename.length, true);
      local.push(l.bytes, filename, body);
      const c = header(46, 0x02014b50);
      c.view.setUint16(4, 20, true);
      c.view.setUint16(6, 20, true);
      c.view.setUint16(8, 0x0800, true);
      c.view.setUint16(14, 33, true);
      c.view.setUint32(16, crc, true);
      c.view.setUint32(20, body.length, true);
      c.view.setUint32(24, body.length, true);
      c.view.setUint16(28, filename.length, true);
      c.view.setUint32(42, offset, true);
      central.push(c.bytes, filename);
      offset += l.bytes.length + filename.length + body.length;
    }
    const directory = concat(central);
    const end = header(22, 0x06054b50);
    end.view.setUint16(8, seen.size, true);
    end.view.setUint16(10, seen.size, true);
    end.view.setUint32(12, directory.length, true);
    end.view.setUint32(16, offset, true);
    return concat([...local, directory, end.bytes]);
  }

  function reviewFiles(engine, model) {
    return {
      "tray.stl": engine.stl(model, "tray"),
      "insert.stl": engine.stl(model, "insert"),
      "drawing.svg": engine.drawingSVG(model),
      "preview.svg": engine.previewSVG(model),
      "parameters.json": engine.parameterJSON(model),
      "bom.csv": engine.bomCSV(model),
      "inspection.csv": engine.inspectionCSV(model),
      "assembly.txt": engine.assemblyText(model),
      "review.json": JSON.stringify(engine.report(model), null, 2) + "\n",
      "THIRD-PARTY-NOTICES.txt": SEED_NOTICE,
      "READ-FIRST.txt": [
        "DIGITAL REVIEW ONLY — NOT APPROVED FOR FABRICATION",
        "Units: nominal millimetres. STL has no units: explicitly import as mm.",
        "One tray + one insert; separate local origins at [0,0,0]. Do not fuse or scale them.",
        "See parameters.json for assembly translation, assumptions, and physical limitations.",
        "drawing.svg is a dimensioned drawing, not a cut path or machine instruction.",
        "All mass, cost, payload-fit, and effort outputs are models, not physical evidence.",
        "Original generator source is also directly downloadable as engine.js from the configurator.",
        "Preset bundles include source/; live custom bundles require the separate source download.",
        "Verified seed data attribution: Copyright (c) 2026 Hive Hub contributors, MIT.",
        "No ordering, fabrication, downloaded starter execution, machine operation, or external activity occurred.",
        ""
      ].join("\n")
    };
  }

  root.StacklineArchive = Object.freeze({ crc32, zip, reviewFiles });
})(globalThis);
