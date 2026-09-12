/* Minimal .xlsx (OOXML SpreadsheetML) writer.
   Built by hand rather than pulled from a library, because the one thing this
   format needs to do — shade an edited cell yellow, the way the CAM Tool's own
   cleanup instructions ask for — is exactly what the common browser-side xlsx
   writers (the free build of SheetJS included) cannot do: cell fill styling on
   write is a paid-tier feature there. JSZip (CDN, zip container only) plus a
   few hand-written XML parts covers it. */
(function (global) {
  "use strict";

  function colLetter(n) {
    var s = ""; n += 1;
    while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
    return s;
  }
  function esc(s) {
    return String(s === null || s === undefined ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/\r?\n/g, " ");
  }

  var CONTENT_TYPES =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    "</Types>";

  var ROOT_RELS =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
    "</Relationships>";

  var WORKBOOK_RELS =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
    "</Relationships>";

  var STYLES =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font>' +
    '<font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
    '<fills count="3"><fill><patternFill patternType="none"/></fill>' +
    '<fill><patternFill patternType="gray125"/></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FFFFF2AC"/><bgColor indexed="64"/></patternFill></fill></fills>' +
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="3">' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
    '<xf numFmtId="0" fontId="0" fillId="2" borderId="0" xfId="0" applyFill="1"/>' +
    "</cellXfs>" +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
    "</styleSheet>";

  function workbookXml(sheetName) {
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<sheets><sheet name="' + esc(sheetName).slice(0, 31) + '" sheetId="1" r:id="rId1"/></sheets>' +
      "</workbook>";
  }

  /* cell: a plain string/number/"" (not highlighted), or {v, hl:true}. */
  function cellXml(ref, cell) {
    var v = cell, hl = false;
    if (cell && typeof cell === "object") { v = cell.v; hl = !!cell.hl; }
    if (v === "" || v === null || v === undefined) return hl ? '<c r="' + ref + '" s="2"/>' : "";
    var s = hl ? ' s="2"' : "";
    if (typeof v === "number" && isFinite(v)) return '<c r="' + ref + '"' + s + '><v>' + v + "</v></c>";
    return '<c r="' + ref + '" t="inlineStr"' + s + "><is><t>" + esc(v) + "</t></is></c>";
  }

  function sheetXml(headers, rows, widths) {
    var out = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'];
    if (widths && widths.length) {
      out.push("<cols>");
      widths.forEach(function (w, i) {
        out.push('<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>');
      });
      out.push("</cols>");
    }
    out.push('<sheetViews><sheetView tabSelected="1" workbookViewId="0">' +
      '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>');
    out.push("<sheetData>");
    out.push("<row r=\"1\">" + headers.map(function (h, c) {
      return '<c r="' + colLetter(c) + '1" t="inlineStr" s="1"><is><t>' + esc(h) + "</t></is></c>";
    }).join("") + "</row>");
    rows.forEach(function (row, r) {
      var rn = r + 2;
      out.push('<row r="' + rn + '">' + row.map(function (cell, c) {
        return cellXml(colLetter(c) + rn, cell);
      }).join("") + "</row>");
    });
    out.push("</sheetData></worksheet>");
    return out.join("");
  }

  /* build({sheetName, headers, rows, widths}) -> Promise<Blob>
     rows: array of arrays, each entry a value or {v, hl:true} for a
     yellow-highlighted cell (the CAM Tool cleanup convention). */
  function build(opts) {
    if (!global.JSZip) return Promise.reject(new Error("JSZip did not load"));
    var zip = new global.JSZip();
    zip.file("[Content_Types].xml", CONTENT_TYPES);
    zip.file("_rels/.rels", ROOT_RELS);
    zip.file("xl/workbook.xml", workbookXml(opts.sheetName || "Sheet1"));
    zip.file("xl/_rels/workbook.xml.rels", WORKBOOK_RELS);
    zip.file("xl/styles.xml", STYLES);
    zip.file("xl/worksheets/sheet1.xml", sheetXml(opts.headers, opts.rows, opts.widths));
    return zip.generateAsync({
      type: "blob",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    });
  }

  global.CAMXlsx = { build: build };
})(window);
