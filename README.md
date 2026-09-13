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
| Full Crash Data | **Full crash data** — every field, editable, OH-1 links, CSV/xlsx export |
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

## Full crash data is editable, live

Every field the parser decodes — about 85 columns, including both units' full
detail — is editable directly in the **Full Crash Data** sheet. There's no separate
"corrected copy": an edit mutates the actual crash record, so every other sheet
(Quick Summary, Crash Analysis, RSI, Proportions, Emphasis Area, Crash Tree) and the
collision diagram recompute from it immediately. Change a crash's severity to fatal
and its diagram symbol turns red on the next render; change its crash type and it
moves to a new zone. Row and Document Number stay read-only — they identify the crash.

Coded fields (Severity, Crash Type, Traffic Control, Object Struck, and so on) are
dropdowns built from the same `RefTables` lookups the rest of the app uses, so only
legal values can be entered; editing Severity or Crash Type also updates the derived
codes those drive (severity code/FI classification, crash-type code/single-vehicle
vs. multi-vehicle) so the recomputation stays correct. Text inputs commit on blur or
Enter, not on every keystroke — the spreadsheet convention, and what keeps a live
recompute across nine sheets from running on every character typed.

Editable fields render in blue (the common spreadsheet-modeling convention for
hardcoded inputs); a field you've actually changed turns yellow. Edits are tracked
per row, not per screen, so changing the year filter or maintenance authority never
discards them, and **Reset changes** reverts everything to the loaded values.

This design follows `HowToCompleteCrashDataCleanup.pdf` — ODOT's separate process for
reporting bad crash data back for correction — which asks for the CAM Tool with
changed fields highlighted. Of the ~85 editable columns here, that process only
accepts ten (Crash Type, County Cd, ODOT Crash Location, NLFID, County True Log, On
Road, At Road, ODOT Latitude, ODOT Longitude, ODOT FIPS Code); a note under the table
names them. **Download highlighted .xlsx**, on the sheet itself, writes
a real `.xlsx` of the full table with every changed cell shaded yellow, matching that
instruction. `assets/xlsx.js` builds this by hand rather than through a library: the
free build of SheetJS (the common browser-side `.xlsx` writer) can't set cell fill
colors on write, which is the one thing this file needs to do. It packages a handful
of OOXML parts with [JSZip](https://cdnjs.cloudflare.com/ajax/libs/jszip/) instead —
no other dependency. This tool can't produce the macro-enabled CAM Tool workbook the
PDF describes, so the `.xlsx` is a substitute serving the same purpose for the same
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

**Known gap, inherited from the workbook:** the zone/rotation tables for turning
crashes (letters `C`/`D` angle, `M` left turn, `N`/`O` right turn) only cover pairs of
units approaching from *opposite* legs — North↔South, East↔West, or their diagonal
equivalents (NE↔SW, NW↔SE). A turning conflict between units on *adjacent* legs (for
example, one approaching from the north and the other from the west) matches none of
those table entries and falls through to the same zone-11 default used for
unclassified angle crashes, rather than the quadrant it geometrically belongs in.
This isn't specific to the port: the original `CollisionDiagram` VBA's `ORotate`/
`NRotate`/etc. labels have the identical opposite-leg-only conditions and the same
`Else` fallback, so the workbook has always placed these crashes the same way. A
concrete example from the bundled sample: Document 20252197125 (unit 1 North→West
right turn, unit 2 West→North left turn) is crash type "Right Turn" with differing
exit directions, so it resolves to letter `O`; `O_TABLE` has no North/West entry, so
it lands in zone 11 at 0° instead of the northwest quadrant (zone 9) the movement
suggests. Fixing this would mean extending `C_TABLE`/`M_TABLE`/`N_TABLE`/`O_TABLE` in
`assets/diagram.js` with the four adjacent-leg combinations (and their reverses) —
not done here, so as not to diverge from the workbook's own placement behavior
without being asked to.

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
