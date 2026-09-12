# CAM Tool Web

A browser rebuild of ODOT's **Crash Analysis Module (CAM) Tool** (`CAMTool.xlsm`).
It takes the same AASHTOWare Safety **GCAT Format** CSV export the spreadsheet takes and
produces the same worksheets, including the collision diagram.

It exists because the workbook needs Excel, macro execution and an external data
connection — three things many agency and consultant machines will not allow. This
version is static HTML, CSS and vanilla JS. Nothing is uploaded; the CSV is read with
`FileReader` and analysed in the page.

## Running it

Open `index.html` in a browser. That's it — no build step, no server, no dependencies.
It works from `file://`, from a shared drive, or behind any static host.

The page opens on a bundled sample export (Denison Ave at W 65th St, Cleveland,
2021–2026) so the tool shows what it does before you load anything.

## What it reproduces

| Sheet in the workbook | Here |
|---|---|
| Full Crash Data | **Full crash data** — decoded table, OH-1 links, CSV export |
| Quick Summary | **Quick summary** — ~30 count/percent tables |
| Crash Analysis | **Crash analysis** — crash type × severity matrix, harm by condition, charts |
| Unit 1 Analysis | **Unit 1 analysis** |
| RelativeSeverityIndex | **Relative severity index** |
| Proportions | **Proportions** — site vs. statewide, 44 site subtypes |
| Emphasis Area | **Emphasis area** — Ohio SHSP target groups by year |
| CrashTree | **Crash tree** |
| Collision Diagram | **Collision diagram** |

Not carried over: the workbook's aerial-image import, Pathweb/roadview links,
CRF table and the hidden HSIP submission sheets. Crash-DRAW is a separate ODOT tool
and is out of scope.

## Crash data cleanup

A tenth sheet, **Crash Data Cleanup**, follows `HowToCompleteCrashDataCleanup.pdf`
rather than the CAM Tool itself: it's ODOT's separate process for reporting bad crash
data back for correction. Only the ten fields that PDF's Table 1 says are correctable
are editable — Crash Type and ODOT Crash Location are dropdowns built from that PDF's
Table 2 and Table 3 so only valid values can be entered; County Cd, NLFID, County True
Log, On Road, At Road, ODOT Latitude, ODOT Longitude and ODOT FIPS Code are free text.
Document Number is always shown and never editable, per the PDF's own rule that it's
required on every submission.

Editable fields render in blue (the common spreadsheet-modeling convention for
hardcoded inputs); a field you actually change turns yellow, matching the PDF's own
instruction to "highlight any changed fields." Editing follows filters like every
other sheet, so switching years or maintenance authority doesn't discard your edits —
they're tracked by row, not by what's currently on screen.

**Download corrected file (.xlsx)** — on the sheet itself, or **Corrected XLSX** in
the ribbon — writes a real `.xlsx` with the changed cells shaded yellow. `assets/xlsx.js`
builds this by hand rather than through a library: the free build of SheetJS (the
common browser-side `.xlsx` writer) can't set cell fill colors on write, which is
the one thing this file needs to do. It packages a handful of OOXML parts with
[JSZip](https://cdnjs.cloudflare.com/ajax/libs/jszip/) instead — no other dependency.
This tool can't produce the macro-enabled CAM Tool workbook the PDF describes, so the
`.xlsx` is a substitute serving the same purpose for the same
[submission form](https://odot.formstack.com/forms/crashdatacleanup).

## Collision diagram

`assets/diagram.js` ports three things from the workbook's `CollisionDiagram` VBA
module so a crash lands where the spreadsheet would put it:

- **Crash-type letters A–O.** Angle splits into `C`/`D` on whether both units share a
  from-direction; Right Turn splits into `N`/`O` on whether both units share a
  to-direction.
- **Zone assignment 1–12.** Zones 1–8 are the eight approach half-legs, chosen from
  unit 1's from-direction; zones 9–12 are the intersection quadrants, chosen from the
  from/to pair tables for angle and turning crashes.
- **Rotation.** The base symbol shows unit 1 travelling east; rotation is clockwise,
  0° for a from-west approach.

Geometry and symbol artwork are redrawn as SVG rather than copied from the workbook's
grouped shapes. Symbol colour follows the VBA: red fatal, blue injury, black PDO.
When a zone fills up, the extras go to the **Crash Overflow Zone**, as in the CAM Tool.

Controls: street names, crash scope, traffic control drawn, and the same
diagram-label checkboxes the CAM toolbar offers. Click a symbol for the crash behind
it, including which symbol, zone and rotation it was assigned.

## Reference data

`assets/camref.js` is generated from the workbook, not hand-written:

- **Code lookups** from the `RefTables` sheet, sliced by the same row ranges the
  `Full Crash Data` formulas use (`SEVERITY_BY_TYPE_CD`, `CRASH_TYPE_CD`,
  `U1_OBJECT_STRUCK`, …) — 30 tables.
- **EPDO multipliers** (KA 43.6, B 6.55, C 4.44, O 1.0) from `RefTables!M2:Q3`.
- **RSI cost table** from `RSI_Data`, pre-aggregated to
  `district|urban|freeway|crashType → [totalCost, crashCount]`, plus a `STW` rollup.
  The multiplier is `round(totalCost / crashCount)`, matching the sheet's `SUMIFS` pair.
- **Statewide proportions** from `ProportionsReference` (Tables 11–14): severity,
  crash type, lighting and surface percentages for 44 site subtypes. Data set:
  AASHTOWare Safety 2021–2025, updated June 2026.

To regenerate after a new CAM Tool release, unzip the `.xlsm` and re-read
`xl/worksheets/` for the `RefTables`, `RSI_Data` and `ProportionsReference` sheets.

## Files

```
index.html          page markup (canonical)
assets/app.css      design tokens, light + dark
assets/parse.js     GCAT CSV → normalized crash records
assets/analysis.js  every worksheet's tabulation
assets/diagram.js   collision diagram: zones, rotation, SVG symbols
assets/xlsx.js      hand-written .xlsx writer (highlighted cells, no library)
assets/app.js       UI controller
assets/camref.js    generated reference tables
assets/sample.js    bundled sample export
build.mjs           strips the document skeleton into build/page.html for publishing
```

## Known differences from the workbook

- **Maintenance authority** for code `80` is derived from the NLFID jurisdiction
  letter, a simplification of the spreadsheet's nested `IF` over route type.
- **Site type** for the Proportions sheet is guessed from the data (urban/rural,
  divided, control, leg count) and is a dropdown you should check — the workbook makes
  you pick it by hand every time.
- **Proportions shading** uses ratio bands (≥1.5×, 1.1–1.5×, ≤0.9×) rather than
  Excel's continuous colour scale.
- **Estimated-speed bands** follow the Quick Summary's `<15 / 15-19 / … / 65-70 / >70`
  grouping; the workbook derives these in a hidden helper column.

Independent re-implementation. Not published by, or endorsed by, the Ohio Department
of Transportation.
