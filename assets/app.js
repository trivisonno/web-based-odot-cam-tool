/* UI controller: renders every CAM Tool worksheet from the parsed records. */
(function () {
  "use strict";
  var A = window.CAMAnalysis, P = window.CAMParse, D = window.CAMDiagram;

  var state = {
    records: [],
    all: [],
    fileName: "",
    heading: "",
    filters: { yearFrom: null, yearTo: null, authority: "All" },
    site: { district: "STW", urban: "Yes", freeway: "No", siteType: "" },
    diagram: {
      labels: ["rowid"], scope: "all", ewStreet: "", nsStreet: "", control: "auto", selected: null
    }
  };

  /* ---------- editable field registry ----------
     Every field the parser decodes is editable here; a "u1."/"u2." prefixed
     key reaches into that unit's sub-object. Edits mutate the live record
     directly (the same object referenced by state.all/state.records), so
     every other sheet and the collision diagram pick them up on the next
     render — there is no separate "corrected" copy of the data. */
  function sortedByCode(obj) {
    return Object.keys(obj).map(Number).sort(function (a, b) { return a - b; }).map(function (k) { return obj[String(k)]; });
  }
  function getField(r, key) {
    var i = key.indexOf(".");
    var v = i < 0 ? r[key] : r[key.slice(0, i)][key.slice(i + 1)];
    return v === undefined || v === null ? "" : v;
  }
  function setField(r, key, val) {
    var i = key.indexOf(".");
    if (i < 0) r[key] = val; else r[key.slice(0, i)][key.slice(i + 1)] = val;
  }
  /* Fields whose text drives another field's code; kept in sync after an edit. */
  function applySideEffects(r, key) {
    if (key === "severity") {
      var m = /\((\d)\)/.exec(r.severity);
      r.severityCode = m ? +m[1] : 0;
      r.fi = r.severityCode >= 1 && r.severityCode <= 4 ? "FI" : "PDO";
      r.injuryCrash = r.fi === "FI";
    } else if (key === "crashType") {
      var idx = A.CRASH_TYPES.indexOf(r.crashType);
      r.crashTypeCode = idx < 0 ? undefined : idx;
      r.mvsv = P.MV_TYPES[r.crashTypeCode] ? "MV" : "SV";
    } else if (key === "monthName") {
      var mi = P.MONTHS.indexOf(r.monthName);
      r.month = mi < 0 ? 0 : mi + 1;
    } else if (key === "u1.unitSpeed") {
      r.u1.speedBand = P.speedBand(r.u1.unitSpeed);
    } else if (key === "u2.unitSpeed") {
      r.u2.speedBand = P.speedBand(r.u2.unitSpeed);
    }
  }
  function yesNo() { return ["Yes", "No"]; }
  var UNIT_FIELDS = [
    { key: "dirFrom", label: "Direction From", type: "select", options: function () { return sortedByCode(window.CAMREF.dirFrom); } },
    { key: "dirTo", label: "Direction To", type: "select", options: function () { return sortedByCode(window.CAMREF.dirTo); } },
    { key: "turn", label: "Turn", type: "select", options: function () { return Object.values(window.CAMREF.turn); } },
    { key: "trafficControl", label: "Traffic Control", type: "select", options: function () { return sortedByCode(window.CAMREF.trafficControl); } },
    { key: "unitType", label: "Type of Unit", type: "select", options: function () { return sortedByCode(window.CAMREF.unitType); } },
    { key: "specialFunction", label: "Special Function", type: "select", options: function () { return sortedByCode(window.CAMREF.specialFunction); } },
    { key: "precrash", label: "Pre-Crash Action", type: "select", options: function () { return sortedByCode(window.CAMREF.precrashAction); } },
    { key: "contrib", label: "Contributing Circumstance", type: "select", options: function () { return sortedByCode(window.CAMREF.contribCirc); } },
    { key: "objectStruck", label: "Object Struck", type: "select", options: function () { return sortedByCode(window.CAMREF.objectStruck); } },
    { key: "nonMotorist", label: "Non-Motorist Location", type: "select", options: function () { return sortedByCode(window.CAMREF.nonMotoristLoc); } },
    { key: "distractedBy", label: "Distracted By", type: "select", options: function () { return sortedByCode(window.CAMREF.distractedBy); } },
    { key: "gender", label: "Gender", type: "select", options: function () { return Object.values(window.CAMREF.gender); } },
    { key: "age", label: "Age", type: "text", width: 8 },
    { key: "postedSpeed", label: "Posted Speed", type: "text", width: 10 },
    { key: "unitSpeed", label: "Estimated Speed", type: "text", width: 10 }
  ];
  function unitColumns(unit, label) {
    return UNIT_FIELDS.map(function (f) {
      return {
        key: unit + "." + f.key, label: label + " " + f.label, type: f.type,
        options: f.options, width: f.width || 16
      };
    });
  }
  var FULL_COLUMNS = [
    { key: "i", label: "Row", type: "readonly", width: 6 },
    { key: "docNbr", label: "Document Number", type: "readonly", bold: true, width: 16 },
    { key: "localReport", label: "Local Report Number", type: "text", width: 18 },
    { key: "year", label: "Year", type: "text", width: 8 },
    { key: "monthName", label: "Month", type: "select", options: function () { return P.MONTHS; }, width: 12 },
    { key: "date", label: "Crash Date", type: "text", width: 14 },
    { key: "hour", label: "Hour", type: "text", width: 6 },
    { key: "dayOfWeek", label: "Day in Week", type: "select", options: function () { return sortedByCode(window.CAMREF.dayOfWeek); }, width: 14 },
    { key: "severity", label: "Severity", type: "select", options: function () { return A.SEVERITIES; }, width: 22 },
    { key: "crashType", label: "Crash Type", type: "select", options: function () { return A.CRASH_TYPES; }, width: 18 },
    { key: "fatal", label: "Fatalities", type: "text", width: 8 },
    { key: "serious", label: "Serious Injuries", type: "text", width: 8 },
    { key: "minor", label: "Non-Serious Injuries", type: "text", width: 8 },
    { key: "possible", label: "Possible Injuries", type: "text", width: 8 },
    { key: "noInjury", label: "No Injuries", type: "text", width: 8 },
    { key: "unrestrained", label: "Unrestrained Occupants", type: "text", width: 8 },
    { key: "units", label: "Number of Units", type: "text", width: 8 },
    { key: "district", label: "ODOT District", type: "text", width: 8 },
    { key: "county", label: "County Cd", type: "text", upper: true, maxlength: 3, width: 10 },
    { key: "areaCode", label: "Area Code", type: "text", width: 12 },
    { key: "freeway", label: "Freeway", type: "select", options: yesNo, width: 8 },
    { key: "interstate", label: "Interstate", type: "select", options: yesNo, width: 8 },
    { key: "funcClass", label: "Functional Class", type: "select", options: function () { return sortedByCode(window.CAMREF.funcClass); }, width: 22 },
    { key: "facilityType", label: "Facility Type", type: "select", options: function () { return sortedByCode(window.CAMREF.facilityType); }, width: 18 },
    { key: "crashLocation", label: "ODOT Crash Location", type: "select", options: function () { return sortedByCode(window.CAMREF.crashLocation); }, width: 22 },
    { key: "intersectionRelated", label: "Intersection Related", type: "select", options: yesNo, width: 8 },
    { key: "roadwayDeparture", label: "Roadway Departure", type: "select", options: yesNo, width: 8 },
    { key: "alcohol", label: "Alcohol Related", type: "select", options: yesNo, width: 8 },
    { key: "drug", label: "Drug Related", type: "select", options: yesNo, width: 8 },
    { key: "marijuana", label: "Marijuana Related", type: "select", options: yesNo, width: 8 },
    { key: "schoolZone", label: "School Zone Related", type: "select", options: yesNo, width: 8 },
    { key: "motorcycle", label: "Motorcycle Involved", type: "select", options: yesNo, width: 8 },
    { key: "speedRelated", label: "Speed Related", type: "select", options: yesNo, width: 8 },
    { key: "seniorDriver", label: "Senior Driver (65+)", type: "select", options: yesNo, width: 8 },
    { key: "youngDriver", label: "Young Driver (15-25)", type: "select", options: yesNo, width: 8 },
    { key: "workZone", label: "Work Zone Related", type: "select", options: yesNo, width: 8 },
    { key: "distracted", label: "Distracted Driver", type: "select", options: yesNo, width: 8 },
    { key: "weather", label: "Weather Condition", type: "select", options: function () { return sortedByCode(window.CAMREF.weather); }, width: 20 },
    { key: "roadCond", label: "Road Condition", type: "select", options: function () { return sortedByCode(window.CAMREF.roadCond); }, width: 20 },
    { key: "lightCond", label: "Light Condition", type: "select", options: function () { return sortedByCode(window.CAMREF.lightCond); }, width: 22 },
    { key: "roadContour", label: "Road Contour", type: "select", options: function () { return sortedByCode(window.CAMREF.roadContour); }, width: 14 },
    { key: "divided", label: "Divided Hwy", type: "select", options: function () { return ["Divided", "Undivided", "Unknown"]; }, width: 10 },
    { key: "lanes", label: "Number of Lanes", type: "text", width: 8 },
    { key: "maintAuthority", label: "Maintenance Authority", type: "select", options: function () { return sortedByCode(window.CAMREF.maintAuthority); }, width: 22 },
    { key: "nlfid", label: "NLFID", type: "text", width: 22 },
    { key: "logPoint", label: "County True Log", type: "text", width: 10 },
    { key: "lat", label: "ODOT Latitude", type: "text", width: 12 },
    { key: "lon", label: "ODOT Longitude", type: "text", width: 12 },
    { key: "fips", label: "ODOT FIPS Code", type: "text", width: 10 },
    { key: "onRoad", label: "On Road", type: "text", width: 20 },
    { key: "atRoad", label: "At Road", type: "text", width: 20 },
    { key: "offset", label: "Miles from Reference", type: "text", width: 10 },
    { key: "offsetDir", label: "Direction from Reference", type: "select", options: function () { return sortedByCode(window.CAMREF.dirFrom); }, width: 12 },
    { key: "intersectionId", label: "Intersection ID", type: "text", width: 22 }
  ].concat(unitColumns("u1", "U1"), unitColumns("u2", "U2"));
  /* The subset ODOT's own crash data cleanup process accepts (see
     HowToCompleteCrashDataCleanup.pdf, Table 1) — flagged for the note
     under the table, not a separate editable set. */
  var ODOT_CLEANUP_KEYS = ["crashType", "county", "crashLocation", "nlfid", "logPoint", "onRoad", "atRoad", "lat", "lon", "fips"];

  function isEdited(r, key) { return !!(r._edited && r._edited[key]); }
  function markEdited(r, key, before) {
    if (!r._orig) r._orig = {};
    if (!(key in r._orig)) r._orig[key] = before;
    if (!r._edited) r._edited = {};
    if (String(getField(r, key)) === String(r._orig[key])) {
      delete r._edited[key];
      if (!Object.keys(r._edited).length) delete r._edited;
    } else {
      r._edited[key] = true;
    }
  }
  function editCount() {
    var n = 0;
    state.all.forEach(function (r) { if (r._edited) n += Object.keys(r._edited).length; });
    return n;
  }
  function resetEdits() {
    state.all.forEach(function (r) {
      if (!r._orig) return;
      Object.keys(r._orig).forEach(function (key) {
        setField(r, key, r._orig[key]);
        applySideEffects(r, key);
      });
      delete r._orig; delete r._edited;
    });
  }

  /* ---------- helpers ---------- */
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(s) {
    return String(s === null || s === undefined ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function pct(v, d) {
    if (v === null || v === undefined || !isFinite(v)) return "-";
    return (v * 100).toFixed(d === undefined ? 1 : d) + "%";
  }
  function money(v) { return "$" + Math.round(v).toLocaleString("en-US"); }
  function num(v, d) {
    if (v === null || v === undefined || !isFinite(v)) return "-";
    return Number(v).toLocaleString("en-US", { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 });
  }

  function plate(title, meta, inner, cls) {
    return '<section class="plate ' + (cls || "") + '"><h4>' + esc(title) +
      (meta ? "<em>" + esc(meta) + "</em>" : "") + '</h4><div class="scroll">' + inner + "</div></section>";
  }

  /* Count/percent table — the shape of nearly every CAM pivot. */
  function countTable(res, labelHead, opts) {
    opts = opts || {};
    var max = res.rows.reduce(function (m, r) { return Math.max(m, r.count); }, 0);
    var h = '<table><thead><tr><th>' + esc(labelHead) + '</th><th class="n">Crashes</th><th class="n">%</th>';
    if (opts.harm) h += '<th class="n">Fatal</th><th class="n">Ser. Inj.</th>';
    h += "</tr></thead><tbody>";
    res.rows.forEach(function (r) {
      h += '<tr><td class="lbl">' + esc(opts.fmt ? opts.fmt(r.label) : r.label) +
        (opts.bars !== false ? '<span class="bar" style="width:' + (max ? (r.count / max) * 100 : 0) + '%"></span>' : "") +
        '</td><td class="n">' + num(r.count) + '</td><td class="n">' + pct(r.pct) + "</td>";
      if (opts.harm) h += '<td class="n">' + num(r.fatal) + '</td><td class="n">' + num(r.serious) + "</td>";
      h += "</tr>";
    });
    h += '<tr class="total"><td>Grand Total</td><td class="n">' + num(res.total) + '</td><td class="n">100.0%</td>';
    if (opts.harm) {
      h += '<td class="n">' + num(res.rows.reduce(function (t, r) { return t + r.fatal; }, 0)) +
        '</td><td class="n">' + num(res.rows.reduce(function (t, r) { return t + r.serious; }, 0)) + "</td>";
    }
    h += "</tr></tbody></table>";
    return h;
  }

  /* Single-series bar chart. One hue; values live in the paired table. */
  function barChart(items, opts) {
    opts = opts || {};
    var w = 620, padL = 34, padR = 12, padT = 10, padB = 30;
    var n = items.length || 1;
    var h = opts.height || 170;
    var max = items.reduce(function (m, d) { return Math.max(m, d.value); }, 0) || 1;
    var step = 4;
    var niceMax = Math.ceil(max / step) * step;
    var bw = (w - padL - padR) / n;
    var s = '<svg viewBox="0 0 ' + w + " " + h + '" role="img" aria-label="' + esc(opts.title || "chart") + '">';
    /* baseline + two gridlines */
    [0, 0.5, 1].forEach(function (f) {
      var y = padT + (h - padT - padB) * (1 - f);
      s += '<line class="ax" x1="' + padL + '" y1="' + y + '" x2="' + (w - padR) + '" y2="' + y + '"/>';
      s += '<text class="tick" x="' + (padL - 6) + '" y="' + (y + 3) + '" text-anchor="end">' +
        Math.round(niceMax * f) + "</text>";
    });
    items.forEach(function (d, i) {
      var bh = (h - padT - padB) * (d.value / niceMax);
      var x = padL + i * bw + bw * 0.16, y = padT + (h - padT - padB) - bh;
      var bwv = Math.max(2, bw * 0.68);
      s += '<g><title>' + esc(d.label + ": " + d.value) + "</title>" +
        '<rect class="b" x="' + x + '" y="' + y + '" width="' + bwv + '" height="' + Math.max(bh, 1) +
        '" rx="3"/></g>';
      if (n <= 26 || i % Math.ceil(n / 24) === 0) {
        s += '<text class="tick" x="' + (x + bwv / 2) + '" y="' + (h - padB + 14) +
          '" text-anchor="middle">' + esc(d.short === undefined ? d.label : d.short) + "</text>";
      }
    });
    s += '<text class="lab" x="' + padL + '" y="' + (h - 4) + '">' + esc(opts.xlabel || "") + "</text>";
    s += "</svg>";
    return '<div class="chart">' + s + "</div>";
  }

  /* ---------- filtering ---------- */
  function applyFilters() {
    var f = state.filters;
    state.records = state.all.filter(function (r) {
      if (f.yearFrom !== null && r.year < f.yearFrom) return false;
      if (f.yearTo !== null && r.year > f.yearTo) return false;
      if (f.authority !== "All" && r.maintAuthority !== f.authority) return false;
      return true;
    });
  }

  /* ---------- sheets ---------- */
  function renderSetup() {
    var host = $("#sheet-setup .body");
    if (!state.all.length) { host.innerHTML = ""; return; }
    var hd = A.headline(state.records);
    var yrs = A.yearsOf(state.all);
    var auths = Array.from(new Set(state.all.map(function (r) { return r.maintAuthority; }))).sort();
    var yopts = "";
    for (var y = yrs.min; y <= yrs.max; y++) yopts += '<option value="' + y + '">' + y + "</option>";

    host.innerHTML =
      '<div class="controls">' +
      '<label class="field" style="grid-column:1/-1"><span>Site / intersection name</span>' +
      '<input type="text" id="f-heading" value="' + esc(state.heading) +
      '" placeholder="e.g. Denison Ave at W 65th St" autocomplete="off"></label>' +
      "</div>" +

      '<div class="stats">' +
      stat("Crashes", num(hd.crashes)) +
      stat("Years analysed", yrs.min === yrs.max ? String(yrs.min) : yrs.min + "-" + yrs.max) +
      stat("Crashes / year", hd.perYear.toFixed(2)) +
      stat("Fatalities", num(hd.fatalities), "fatal") +
      stat("Serious injuries", num(hd.serious), "serious") +
      stat("Fatal &amp; all injury", num(hd.fiCrashes)) +
      stat("Percent injury", pct(hd.pctInjury)) +
      stat("EPDO index", hd.epdo.toFixed(2)) +
      "</div>" +

      '<div class="controls">' +
      '<label class="field"><span>Year from</span><select id="f-yfrom">' + yopts + "</select></label>" +
      '<label class="field"><span>Year to</span><select id="f-yto">' + yopts + "</select></label>" +
      '<label class="field"><span>Maintenance authority</span><select id="f-auth"><option>All</option>' +
      auths.map(function (a) { return "<option>" + esc(a) + "</option>"; }).join("") + "</select></label>" +
      "</div>" +

      '<div class="controls">' +
      '<label class="field"><span>ODOT district (RSI)</span><select id="f-district"><option value="STW">Statewide</option>' +
      window.CAMREF.rsiDistricts.map(function (d) { return '<option value="' + d + '">District ' + d + "</option>"; }).join("") +
      "</select></label>" +
      '<label class="field"><span>Urban area (RSI)</span><select id="f-urban"><option>Yes</option><option>No</option></select></label>' +
      '<label class="field"><span>Freeway (RSI)</span><select id="f-freeway"><option>No</option><option>Yes</option></select></label>' +
      '<label class="field" style="grid-column:1/-1"><span>Site type (Proportions)</span><select id="f-site">' +
      window.CAMREF.siteTypes.map(function (s) { return '<option value="' + esc(s) + '">' + esc(s) + "</option>"; }).join("") +
      "</select></label>" +
      "</div>" +
      '<p class="note">These four inputs replace the manual entries the spreadsheet asks for on the ' +
      '<strong>RelativeSeverityIndex</strong> and <strong>Proportions</strong> sheets. They are pre-filled from the ' +
      "file where the data allows it - check them before quoting the numbers.</p>";

    $("#f-yfrom").value = String(state.filters.yearFrom);
    $("#f-yto").value = String(state.filters.yearTo);
    $("#f-auth").value = state.filters.authority;
    $("#f-district").value = state.site.district;
    $("#f-urban").value = state.site.urban;
    $("#f-freeway").value = state.site.freeway;
    $("#f-site").value = state.site.siteType;

    $("#f-heading").oninput = function () {
      state.heading = this.value;
      setTitle(this.value);
    };
    $("#f-yfrom").onchange = function () { state.filters.yearFrom = +this.value; refresh(); };
    $("#f-yto").onchange = function () { state.filters.yearTo = +this.value; refresh(); };
    $("#f-auth").onchange = function () { state.filters.authority = this.value; refresh(); };
    $("#f-district").onchange = function () { state.site.district = this.value; refresh(); };
    $("#f-urban").onchange = function () { state.site.urban = this.value; refresh(); };
    $("#f-freeway").onchange = function () { state.site.freeway = this.value; refresh(); };
    $("#f-site").onchange = function () { state.site.siteType = this.value; refresh(); };
  }
  function stat(label, value, cls) {
    return '<div class="stat ' + (cls || "") + '"><span>' + label + "</span><strong>" + value + "</strong></div>";
  }

  /* Print-only stand-in for the Setup sheet: carries the site name and the
     basic identifying info into the printed report now that Setup itself
     is excluded (it's data-entry chrome, not report content). */
  function renderPrintHeader() {
    var nameEl = $("#ph-name"), metaEl = $("#ph-meta"), statsEl = $("#ph-stats");
    if (!state.all.length) { nameEl.textContent = ""; metaEl.textContent = ""; statsEl.innerHTML = ""; return; }
    var hd = A.headline(state.records);
    var yrs = A.yearsOf(state.all);
    var yearsTxt = yrs.min === yrs.max ? String(yrs.min) : yrs.min + "-" + yrs.max;
    var districtTxt = state.site.district === "STW" ? "Statewide" : "District " + state.site.district;

    nameEl.textContent = state.heading || "Untitled site";
    metaEl.textContent = [
      "Years analysed: " + yearsTxt,
      "ODOT district: " + districtTxt,
      "Urban area: " + state.site.urban,
      "Freeway: " + state.site.freeway,
      "Site type: " + state.site.siteType,
      state.filters.authority !== "All" ? "Maintenance authority: " + state.filters.authority : null
    ].filter(Boolean).join(" · ");

    statsEl.innerHTML =
      stat("Crashes", num(hd.crashes)) +
      stat("Crashes / year", hd.perYear.toFixed(2)) +
      stat("Fatalities", num(hd.fatalities), "fatal") +
      stat("Serious injuries", num(hd.serious), "serious") +
      stat("Fatal &amp; all injury", num(hd.fiCrashes)) +
      stat("Percent injury", pct(hd.pctInjury)) +
      stat("EPDO index", hd.epdo.toFixed(2));
  }

  function renderSummary() {
    var q = A.quickSummary(state.records);
    var h = "";
    h += '<div class="grid">';
    h += plate("Crash severity", null, countTable(q.severity, "Severity"));
    h += plate("Year", null, countTable(q.year, "Year"));
    h += plate("Crash type", null, countTable(q.crashType, "Crash type"));
    h += plate("Day of week", null, countTable(q.dayOfWeek, "Day"));
    h += plate("Month", null, countTable(q.month, "Month", { fmt: function (m) { return P.MONTHS[m - 1] || m; } }));
    h += plate("Hour of day", null, countTable(q.hour, "Hour", {
      fmt: function (x) { return String(x).padStart(2, "0") + ":00"; }
    }));
    h += plate("Weather condition", null, countTable(q.weather, "Weather"));
    h += plate("Road condition", null, countTable(q.roadCond, "Road condition"));
    h += plate("Light condition", null, countTable(q.lightCond, "Light condition"));
    h += plate("ODOT location", null, countTable(q.location, "Location"));
    h += plate("Road contour", null, countTable(q.contour, "Contour"));
    h += plate("Number of units", null, countTable(q.units, "Units"));
    h += "</div>";

    h += '<h4 style="margin:22px 0 10px;font-size:13px;letter-spacing:.08em;text-transform:uppercase">Contributing conditions</h4>';
    h += '<div class="grid">';
    [["Roadway departure", q.roadwayDeparture], ["Intersection related", q.intersectionRel],
    ["Work zone related", q.workZone], ["Alcohol related", q.alcohol],
    ["Drug related (incl. marijuana)", q.drug], ["Marijuana related", q.marijuana],
    ["Speed related", q.speed], ["Distracted driver", q.distracted],
    ["Older driver (65+)", q.older], ["Young driver (15-25)", q.young],
    ["Motorcycle involved", q.motorcycle]].forEach(function (p) {
      h += plate(p[0], null, countTable(p[1], p[0], { bars: false }));
    });
    h += "</div>";

    h += '<h4 style="margin:22px 0 10px;font-size:13px;letter-spacing:.08em;text-transform:uppercase">Unit 1 summary</h4>';
    h += '<div class="grid">';
    h += plate("Unit 1 pre-crash action", null, countTable(q.u1Precrash, "Action"));
    h += plate("Unit 1 contributing factor", null, countTable(q.u1Contrib, "Factor"));
    h += plate("Unit 1 object struck", null, countTable(q.u1Object, "Object"));
    h += plate("Unit 1 traffic control", null, countTable(q.u1Control, "Control"));
    h += plate("Unit 1 type", null, countTable(q.u1Type, "Unit type"));
    h += plate("Unit 1 special function", null, countTable(q.u1Special, "Special function"));
    h += plate("Unit 1 posted speed", null, countTable(q.u1Posted, "Posted speed", { bars: false }));
    h += plate("Unit 1 estimated speed", null, countTable(q.u1Est, "Estimated speed", { bars: false }));
    h += plate("Unit 1 direction from", null, countTable(q.u1From, "From"));
    h += plate("Unit 1 direction to", null, countTable(q.u1To, "To"));
    h += "</div>";
    $("#sheet-summary .body").innerHTML = h;
  }

  function renderAnalysis() {
    var c = A.crashAnalysis(state.records);
    var h = "";

    /* crash type x severity matrix */
    var m = '<table><thead><tr><th>Crash type</th>' +
      c.matrix.cols.map(function (s) { return '<th class="n">' + esc(s.replace(/^\(\d\)\s*/, "")) + "</th>"; }).join("") +
      '<th class="n">Total</th></tr></thead><tbody>';
    c.matrix.rows.forEach(function (row) {
      m += '<tr><td class="lbl">' + esc(row.label) + "</td>" +
        row.cells.map(function (v, i) {
          return '<td class="n' + (v ? " k-" + ["fatal", "serious", "injury", "injury", "pdo"][i] : "") + '">' +
            (v || "·") + "</td>";
        }).join("") + '<td class="n">' + row.total + "</td></tr>";
    });
    m += '<tr class="total"><td>Grand Total</td>' +
      c.matrix.totals.map(function (v) { return '<td class="n">' + v + "</td>"; }).join("") +
      '<td class="n">' + c.matrix.grand + "</td></tr></tbody></table>";

    h += '<div class="grid wide">';
    h += plate("Crash type by injury level", "counts", m, "span");
    h += plate("Crashes by year", null,
      barChart(c.byYear.rows.map(function (r) { return { label: r.label, value: r.count }; }), { title: "Crashes by year" }) +
      countTable(c.byYear, "Year", { harm: true, bars: false }));
    h += plate("Crashes by hour of day", null,
      barChart(c.hour.rows.map(function (r) {
        return { label: String(r.label).padStart(2, "0") + ":00", short: r.label, value: r.count };
      }), { title: "Crashes by hour", xlabel: "hour beginning" }) +
      countTable(c.hour, "Hour", { bars: false, fmt: function (x) { return String(x).padStart(2, "0") + ":00"; } }));
    h += plate("Crashes by month", null,
      barChart(c.month.rows.map(function (r) { return { label: r.label, short: r.label.slice(0, 3), value: r.count }; }),
        { title: "Crashes by month" }) + countTable(c.month, "Month", { bars: false }));
    h += plate("Crash type", null,
      barChart(c.matrix.rows.map(function (r) { return { label: r.label, short: r.label.slice(0, 6), value: r.total }; }),
        { title: "Crashes by type", height: 190 }));
    h += plate("Road condition", null, countTable(c.roadCond, "Road condition", { harm: true }));
    h += plate("Light condition", null, countTable(c.lightCond, "Light condition", { harm: true }));
    h += plate("Weather", null, countTable(c.weather, "Weather", { harm: true }));
    h += plate("ODOT location", null, countTable(c.location, "Location", { harm: true }));
    h += plate("Single vs. multi-vehicle", "HSM grouping",
      '<table><thead><tr><th>Group</th><th class="n">Crashes</th><th class="n">Fatal &amp; injury</th><th class="n">% injury</th></tr></thead><tbody>' +
      ["SV", "MV"].map(function (k) {
        var d = c.svmv[k];
        return "<tr><td>" + (k === "SV" ? "Single vehicle" : "Multi-vehicle") + '</td><td class="n">' +
          d.total + '</td><td class="n">' + d.fi + '</td><td class="n">' +
          pct(d.total ? d.fi / d.total : null) + "</td></tr>";
      }).join("") + "</tbody></table>");
    h += "</div>";
    $("#sheet-analysis .body").innerHTML = h;
  }

  function renderUnit1() {
    var u = A.unit1(state.records);
    var h = '<div class="grid">';
    [["Type of unit", u.unitType, "Unit type"], ["Traffic control", u.trafficControl, "Control"],
    ["Special function", u.specialFunction, "Function"], ["Object struck", u.objectStruck, "Object"],
    ["Pre-crash action", u.precrash, "Action"], ["Contributing circumstances", u.contrib, "Circumstance"],
    ["Direction from", u.dirFrom, "From"], ["Direction to", u.dirTo, "To"],
    ["Posted speed", u.posted, "Posted speed"], ["Estimated speed", u.estimated, "Estimated speed"],
    ["Driver gender", u.gender, "Gender"], ["Distracted by", u.distractedBy, "Distraction"]].forEach(function (p) {
      h += plate(p[0], null, countTable(p[1], p[2], { harm: true }));
    });
    h += "</div>";
    h += '<p class="note">Unit 1 is normally the at-fault vehicle in the ODPS report. ' +
      "Fatality and serious-injury counts are crash totals, not the occupants of unit 1.</p>";
    $("#sheet-unit1 .body").innerHTML = h;
  }

  function renderRSI() {
    var s = state.site;
    var r = A.rsi(state.records, { district: s.district, urban: s.urban, freeway: s.freeway });
    var t = '<table><thead><tr><th>Crash type</th><th class="n">Crashes</th>' +
      '<th class="n">RSI multiplier</th><th class="n">Crash type severity</th></tr></thead><tbody>';
    r.lines.forEach(function (l) {
      t += "<tr><td>" + esc(l.type) + '</td><td class="n">' + (l.count || "·") +
        '</td><td class="n">' + (l.mult ? money(l.mult) : "-") +
        '</td><td class="n">' + (l.cost ? money(l.cost) : "·") + "</td></tr>";
    });
    t += '<tr class="total"><td>Totals</td><td class="n">' + r.totalCrashes +
      '</td><td class="n"></td><td class="n">' + money(r.totalCost) + "</td></tr></tbody></table>";

    var h = '<div class="stats">' +
      stat("RSI value", r.totalCrashes ? money(r.value) : "-") +
      stat("Total crash cost", money(r.totalCost)) +
      stat("Crashes", num(r.totalCrashes)) +
      stat("Basis", s.district === "STW" ? "Statewide" : "District " + s.district) +
      "</div>";
    h += '<div class="grid wide">' + plate("Relative severity index calculation",
      (s.urban === "Yes" ? "urban" : "rural") + " · " + (s.freeway === "Yes" ? "freeway" : "non-freeway"),
      t, "span") + "</div>";
    h += '<p class="note">Multipliers are average crash cost per crash for the selected district, urban/rural and ' +
      "freeway setting, taken from the CAM Tool's <strong>RSI_Data</strong> table. A crash type with no multiplier " +
      "shown has no matching statewide sample. Change the district, urban and freeway inputs on the Setup sheet.</p>";
    $("#sheet-rsi .body").innerHTML = h;
  }

  function cellClass(site, sw) {
    if (site === null) return "";
    if (!sw) return site > 0 ? "cell-bad" : "cell-good";
    var r = site / sw;
    if (r >= 1.5) return "cell-bad";
    if (r >= 1.1) return "cell-warn";
    if (r <= 0.9) return "cell-good";
    return "";
  }

  function propTable(rows, head) {
    var h = '<table><thead><tr><th>' + esc(head) + '</th><th class="n">Site total %</th>' +
      '<th class="n">Statewide total %</th><th class="n">Site F&amp;I %</th><th class="n">Statewide F&amp;I %</th>' +
      "</tr></thead><tbody>";
    rows.forEach(function (r) {
      h += "<tr><td>" + esc(r.label) + '</td>' +
        '<td class="n ' + cellClass(r.siteTotal, r.swTotal) + '">' + pct(r.siteTotal, 2) + "</td>" +
        '<td class="n">' + pct(r.swTotal, 2) + "</td>" +
        '<td class="n ' + cellClass(r.siteFI, r.swFI) + '">' + pct(r.siteFI, 2) + "</td>" +
        '<td class="n">' + pct(r.swFI, 2) + "</td></tr>";
    });
    h += "</tbody></table>";
    return h;
  }

  function renderProportions() {
    if (!state.site.siteType) { $("#sheet-proportions .body").innerHTML = ""; return; }
    var p = A.proportions(state.records, state.site.siteType);
    var sev = '<table><thead><tr><th>Crash severity</th><th class="n">Site crashes</th>' +
      '<th class="n">Site %</th><th class="n">Statewide %</th></tr></thead><tbody>';
    p.severity.forEach(function (r) {
      sev += "<tr><td>" + esc(r.label) + '</td><td class="n">' + r.count +
        '</td><td class="n ' + cellClass(r.sitePct, r.swPct) + '">' + pct(r.sitePct, 2) +
        '</td><td class="n">' + pct(r.swPct, 2) + "</td></tr>";
    });
    sev += '<tr class="total"><td>Total</td><td class="n">' + p.severityTotal +
      '</td><td class="n"></td><td class="n"></td></tr></tbody></table>';

    var h = '<div class="controls"><label class="field" style="grid-column:1/-1"><span>Site type</span>' +
      '<select id="p-site">' + window.CAMREF.siteTypes.map(function (s) {
        return '<option value="' + esc(s) + '"' + (s === state.site.siteType ? " selected" : "") + ">" + esc(s) + "</option>";
      }).join("") + "</select></label></div>";
    h += '<div class="grid wide">';
    h += plate("Crashes by severity", null, sev);
    h += plate("Crashes by crash type", null, propTable(p.crashType, "Crash type"), "span");
    h += plate("Crashes by light conditions", null, propTable(p.light, "Light condition"));
    h += plate("Crashes by road conditions", null, propTable(p.surface, "Road condition"));
    h += "</div>";
    h += '<p class="note">Shading compares the site with the statewide average for the selected site type: ' +
      '<span class="cell-bad" style="padding:1px 5px">1.5× or more</span> ' +
      '<span class="cell-warn" style="padding:1px 5px">1.1-1.5×</span> ' +
      '<span class="cell-good" style="padding:1px 5px">at or below 0.9×</span>. ' +
      "Statewide figures are the 2021-2025 proportions shipped with the CAM Tool.</p>";
    $("#sheet-proportions .body").innerHTML = h;
    $("#p-site").onchange = function () {
      state.site.siteType = this.value;
      var f = $("#f-site"); if (f) f.value = this.value;
      renderProportions();
      gridifyAll();
    };
  }

  function emphasisTable(block, years, unit) {
    var h = '<table><thead><tr><th>Target group</th>' +
      years.map(function (y) { return '<th class="n">' + y + "</th>"; }).join("") + "</tr></thead><tbody>";
    block.forEach(function (row) {
      h += "<tr" + (row.total ? ' class="total"' : "") + "><td>" +
        esc(row.total ? "Total " + unit + " by year" : row.name) + "</td>" +
        row.cells.map(function (v, i) {
          var p = row.pcts[i];
          return '<td class="n">' + v + (row.total || p === null || !v ? "" :
            ' <span style="color:var(--ink-3);font-size:10px">' + pct(p, 0) + "</span>") + "</td>";
        }).join("") + "</tr>";
    });
    h += "</tbody></table>";
    return h;
  }

  function renderEmphasis() {
    var e = A.emphasis(state.records, state.filters.authority);
    var h = '<div class="grid wide">';
    h += plate("Ohio SHSP emphasis areas - fatalities", e.authority,
      emphasisTable(e.fatalities, e.years, "fatalities"), "span");
    h += plate("Ohio SHSP emphasis areas - serious injuries", e.authority,
      emphasisTable(e.serious, e.years, "serious injuries"), "span");
    h += "</div>";
    h += '<p class="note">Counts are people, not crashes: each cell sums the fatalities (or serious injuries) ' +
      "in crashes that carry the target-group flag. Percentages are of that year's total. " +
      "Use the maintenance-authority filter on the Setup sheet to scope to one agency.</p>";
    $("#sheet-emphasis .body").innerHTML = h;
  }

  function tnode(n, root) {
    var h = '<div class="tnode' + (root ? " root" : "") + '"><h5>' + esc(n.label) + "</h5>" +
      '<div class="nums"><div><span>Crashes</span><strong>' + n.crashes + "</strong></div>" +
      '<div><span>Fatal</span><strong>' + n.fatalities + "</strong></div>" +
      '<div><span>Ser. inj.</span><strong>' + n.serious + "</strong></div></div>";
    if (n.top.length) {
      h += "<ol>" + n.top.map(function (t) {
        return "<li><b>" + esc(t.type) + "</b> <em>" + t.crashes + "c · " + t.fatalities + "f · " + t.serious + "s</em></li>";
      }).join("") + "</ol>";
    } else {
      h += '<ol style="list-style:none;padding-left:11px"><li>No crashes</li></ol>';
    }
    return h + "</div>";
  }

  function renderTree() {
    var t = A.crashTree(state.records, state.filters.authority, state.filters.yearFrom, state.filters.yearTo);
    var h = '<div class="tree">' + tnode(t.total, true) +
      '<div class="tconn"></div><div class="tconn wide"></div><div class="tconn"></div>' +
      '<div class="tree-row">' + tnode(t.nonIntersection) + tnode(t.intersection) + "</div>" +
      '<div class="tconn"></div><div class="tconn wide"></div><div class="tconn"></div>' +
      '<div class="tree-row">' + tnode(t.roadwayDeparture) + tnode(t.nonIntOther) +
      tnode(t.signalized) + tnode(t.unsignalized) + tnode(t.intOther) + "</div></div>";
    h += '<p class="note">Each branch lists its three highest-ranked crash types. Ranking follows the CAM Tool: ' +
      "crashes first, then fatalities, then serious injuries, with the spreadsheet's own crash-type tie-break. " +
      "Intersection branches are split by unit 1's traffic control - signal, sign or flasher, or none.</p>";
    $("#sheet-tree .body").innerHTML = h;
  }

  /* ---------- collision diagram ---------- */
  function diagramRecords() {
    var d = state.diagram;
    if (d.scope === "int") return state.records.filter(function (r) { return r.intersectionRelated === "Yes"; });
    if (d.scope === "intloc") {
      return state.records.filter(function (r) {
        return r.intersectionRelated === "Yes" || /Intersection|Roundabout|point/i.test(r.crashLocation);
      });
    }
    return state.records;
  }

  function guessStreets() {
    function mode(list) {
      var m = new Map();
      list.forEach(function (v) { if (v) m.set(v, (m.get(v) || 0) + 1); });
      var best = "", n = 0;
      m.forEach(function (c, k) { if (c > n) { n = c; best = k; } });
      return best;
    }
    var on = mode(state.records.map(function (r) { return r.onRoad; }));
    var at = mode(state.records.map(function (r) { return r.atRoad; }));
    /* If both names appear in both slots, the pair is a real intersection. */
    return { ew: on, ns: at };
  }

  function guessControl() {
    var m = new Map();
    state.records.forEach(function (r) {
      var c = r.u1.trafficControl;
      if (!c || c === "No Control") return;
      m.set(c, (m.get(c) || 0) + 1);
    });
    var best = "None", n = 0;
    m.forEach(function (c, k) { if (c > n) { n = c; best = k; } });
    return best;
  }

  function renderDiagram() {
    var d = state.diagram;
    var recs = diagramRecords();
    var control = d.control === "auto" ? guessControl() : d.control;
    var res = D.render(recs, {
      labels: d.labels, ewStreet: d.ewStreet, nsStreet: d.nsStreet, control: control
    });

    var labelChecks = D.LABEL_FIELDS.map(function (f) {
      return '<label class="chk"><input type="checkbox" data-lbl="' + f.id + '"' +
        (d.labels.indexOf(f.id) >= 0 ? " checked" : "") + "> " + esc(f.name) + "</label>";
    }).join("");

    var legend = D.legendItems().map(function (it) {
      return "<div>" + '<svg viewBox="-26 -26 52 52" aria-hidden="true">' + it.svg + "</svg>" +
        "<span>" + esc(it.name) + "</span></div>";
    }).join("");

    var h =
      '<div class="controls">' +
      '<label class="field"><span>Street running east-west</span>' +
      '<span class="print-val" id="d-ew-print">' + esc(d.ewStreet || "-") + '</span>' +
      '<input type="text" id="d-ew" value="' + esc(d.ewStreet) + '"></label>' +
      '<label class="field"><span>Street running north-south</span>' +
      '<span class="print-val" id="d-ns-print">' + esc(d.nsStreet || "-") + '</span>' +
      '<input type="text" id="d-ns" value="' + esc(d.nsStreet) + '"></label>' +
      '<label class="field"><span>Crashes shown</span><select id="d-scope">' +
      '<option value="all">All crashes in file</option>' +
      '<option value="int">Intersection-related only</option>' +
      '<option value="intloc">Intersection-related or at an intersection</option>' +
      "</select></label>" +
      '<label class="field"><span>Traffic control drawn</span><select id="d-ctl">' +
      ["auto", "Signal", "Stop Sign", "Yield Sign", "Flasher", "None"].map(function (c) {
        return '<option value="' + c + '">' + (c === "auto" ? "From the data (" + control + ")" : c) + "</option>";
      }).join("") + "</select></label>" +
      '<div class="field no-print" style="grid-column:1/-1"><span style="font-family:var(--cond);font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-2)">Diagram label options</span>' +
      '<div style="display:grid;gap:0 14px;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));margin-top:4px">' +
      labelChecks + "</div></div>" +
      "</div>" +

      '<div class="toolbar">' +
      '<span class="pill">' + res.placed + " plotted</span>" +
      (res.overflow ? '<span class="pill" style="color:var(--serious);border-color:var(--serious)">' +
        res.overflow + " in overflow zone</span>" : "") +
      '<span class="pill">' + res.total + " crashes in scope</span>" +
      '<button class="btn" id="d-svg">Download SVG</button>' +
      '<button class="btn" id="d-print">Print / save PDF</button>' +
      "</div>" +

      '<div class="cd-layout">' +
      '<div class="cd-wrap"><div class="scroll" id="cdhost">' + res.svg + "</div></div>" +
      "<div>" +
      '<section class="plate"><h4>Severity</h4><div class="sev-key">' +
      '<span><b style="background:var(--fatal)"></b>Fatal</span>' +
      '<span><b style="background:var(--injury)"></b>Injury</span>' +
      '<span><b style="background:var(--pdo)"></b>PDO</span></div></section>' +
      '<section class="plate" style="margin-top:14px"><h4>Diagram label key</h4><div class="legend">' + legend + "</div></section>" +
      '<section class="plate detail no-print" style="margin-top:14px" id="d-detail"><h4>Crash detail</h4>' +
      '<dl><dt>Select</dt><dd>Click any symbol on the diagram.</dd></dl></section>' +
      "</div></div>" +

      '<p class="note no-print">Symbols are positioned by the at-fault unit’s crash type and its from/to directions, ' +
      "using the same zone and rotation rules as the spreadsheet. Where a movement has more crashes than its " +
      "zone can hold, the extras go to the <strong>Crash Overflow Zone</strong> - as in the CAM Tool, those " +
      "need a hand. The most accurate diagram still comes from reading the OH-1 reports and correcting the " +
      "crash type and direction fields before plotting.</p>";

    $("#sheet-diagram .body").innerHTML = h;
    $("#d-scope").value = d.scope;
    $("#d-ctl").value = d.control;

    $("#d-ew").oninput = function () {
      d.ewStreet = this.value;
      this.setAttribute("value", this.value);
      $("#d-ew-print").textContent = this.value || "-";
      redrawSvg();
    };
    $("#d-ns").oninput = function () {
      d.nsStreet = this.value;
      this.setAttribute("value", this.value);
      $("#d-ns-print").textContent = this.value || "-";
      redrawSvg();
    };
    $("#d-scope").onchange = function () { d.scope = this.value; renderDiagram(); };
    $("#d-ctl").onchange = function () { d.control = this.value; renderDiagram(); };
    $$("[data-lbl]").forEach(function (cb) {
      cb.onchange = function () {
        var id = this.getAttribute("data-lbl");
        var i = d.labels.indexOf(id);
        if (this.checked && i < 0) d.labels.push(id);
        if (!this.checked && i >= 0) d.labels.splice(i, 1);
        redrawSvg();
      };
    });
    $("#d-print").onclick = function () { window.print(); };
    $("#d-svg").onclick = function () { saveSVG(); };
    wireSymbols();
  }

  function redrawSvg() {
    var d = state.diagram;
    var control = d.control === "auto" ? guessControl() : d.control;
    var res = D.render(diagramRecords(), {
      labels: d.labels, ewStreet: d.ewStreet, nsStreet: d.nsStreet, control: control
    });
    $("#cdhost").innerHTML = res.svg;
    wireSymbols();
  }

  function wireSymbols() {
    $$("#cdhost .sym").forEach(function (g) {
      var pick = function () {
        $$("#cdhost .sym.sel").forEach(function (o) { o.classList.remove("sel"); });
        g.classList.add("sel");
        showDetail(+g.getAttribute("data-i"));
      };
      g.addEventListener("click", pick);
      g.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); }
      });
    });
  }

  function showDetail(i) {
    var r = state.records.filter(function (x) { return x.i === i; })[0];
    if (!r) return;
    var p = D.place(r);
    var rows = [
      ["Row ID", r.i], ["Document", r.docNbr], ["Local report", r.localReport],
      ["Date / hour", (r.date || "") + (r.hour === "" ? "" : "  " + String(r.hour).padStart(2, "0") + ":00")],
      ["Severity", r.severity], ["Crash type", r.crashType],
      ["Symbol", D.LETTER_NAME[p.letter] + " (" + p.letter + "), zone " + p.zone + ", " + p.rotation + "°"],
      ["On / at", (r.onRoad || "?") + " at " + (r.atRoad || "?")],
      ["Location", r.crashLocation], ["Int. related", r.intersectionRelated],
      ["Light / road", r.lightCond + " / " + r.roadCond],
      ["Unit 1", [r.u1.unitType, r.u1.dirFrom && r.u1.dirFrom + "→" + r.u1.dirTo, r.u1.turn].filter(Boolean).join(" · ")],
      ["U1 factor", r.u1.contrib], ["U1 control", r.u1.trafficControl],
      ["Unit 2", [r.u2.unitType, r.u2.dirFrom && r.u2.dirFrom + "→" + r.u2.dirTo].filter(Boolean).join(" · ") || "-"],
      ["Harm", r.fatal + " fatal · " + r.serious + " serious · " + r.minor + " minor · " + r.possible + " possible"]
    ];
    var h = "<h4>Crash detail</h4><dl>" + rows.map(function (p2) {
      return "<dt>" + esc(p2[0]) + "</dt><dd>" + esc(p2[1] === "" || p2[1] === undefined ? "-" : p2[1]) + "</dd>";
    }).join("");
    if (r.reportLink) {
      h += '<dt>OH-1</dt><dd><a href="' + esc(r.reportLink) + '" target="_blank" rel="noopener">Open crash report</a></dd>';
    }
    h += "</dl>";
    $("#d-detail").innerHTML = h;
  }

  /* ---------- full crash data ---------- */
  /* ---------- full crash data: every field, every field editable ---------- */
  function fieldControl(r, f, opts, selWidth) {
    if (f.type === "readonly") {
      return '<span class="readonly-cell' + (f.bold ? " doc-cell" : "") + '">' + esc(getField(r, f.key)) + "</span>";
    }
    var val = getField(r, f.key);
    var edited = isEdited(r, f.key);
    var hl = edited ? " hl" : "";
    var attrs = ' class="cell-in' + hl + '" data-row="' + r.i + '" data-field="' + f.key + '"';
    /* Printed pages show this plain-text value instead of the live control --
       see the @media print rules for why. */
    var printVal = '<span class="print-val' + (edited ? " hl" : "") + '">' +
      esc(val === "" ? "-" : val) + "</span>";
    if (f.type === "select") {
      if (val !== "" && opts.indexOf(val) < 0) opts = opts.concat([val]);
      return printVal + '<select' + attrs + ' style="width:' + selWidth + 'px">' + opts.map(function (o) {
        return '<option value="' + esc(o) + '"' + (o === val ? " selected" : "") + ">" + esc(o) + "</option>";
      }).join("") + "</select>";
    }
    var extra = f.maxlength ? ' maxlength="' + f.maxlength + '"' : "";
    return printVal + '<input type="text"' + attrs + extra + ' value="' + esc(val) + '" autocomplete="off" spellcheck="false">';
  }

  function renderData() {
    var rows = state.records;
    var byId = new Map(rows.map(function (r) { return [r.i, r]; }));
    var n = editCount();
    var host = $("#sheet-data .body");
    var scrollBox = $(".datatable", host);
    var scrollTop = scrollBox ? scrollBox.scrollTop : 0, scrollLeft = scrollBox ? scrollBox.scrollLeft : 0;

    /* Resolve each select column's option list (and a rough pixel width from
       its longest label) once per render, not once per cell. */
    var optsCache = {}, widthCache = {};
    FULL_COLUMNS.forEach(function (f) {
      if (f.type !== "select") return;
      var opts = f.options();
      optsCache[f.key] = opts;
      var maxLen = opts.reduce(function (m, o) { return Math.max(m, String(o).length); }, 4);
      widthCache[f.key] = Math.max(70, Math.min(230, maxLen * 6.5 + 26));
    });

    var h =
      '<section class="plate"><div class="edit-legend">' +
      '<span class="swatch no-print"><span class="box input"></span>Editable field</span>' +
      '<span class="swatch"><span class="box hl"></span>Changed from the loaded value</span>' +
      "</div></section>" +
      '<div class="toolbar" style="margin-top:12px">' +
      '<button class="btn" id="x-csv">Download CSV</button>' +
      '<button class="btn primary" id="x-xlsx">Download highlighted .xlsx</button>' +
      '<button class="btn" id="x-reset"' + (n ? "" : " disabled") + '>Reset changes</button>' +
      '<span class="pill"' + (n ? ' style="color:var(--hl-ink);border-color:var(--hl-ink)"' : "") + ">" +
      n + " cell" + (n === 1 ? "" : "s") + " changed</span>" +
      '<span class="pill">' + rows.length + " rows</span>" +
      "</div>";

    h += '<div class="plate"><div class="datatable"><table><thead><tr><th>OH-1</th>' +
      FULL_COLUMNS.map(function (f) { return "<th>" + esc(f.label) + "</th>"; }).join("") + "</tr></thead><tbody>";
    rows.forEach(function (r) {
      h += "<tr><td>" + (r.reportLink && r.year > 2010
        ? '<a href="' + esc(r.reportLink) + '" target="_blank" rel="noopener">Report</a>'
        : '<span style="color:var(--ink-3)">-</span>') + "</td>" +
        FULL_COLUMNS.map(function (f) {
          return "<td>" + fieldControl(r, f, optsCache[f.key], widthCache[f.key]) + "</td>";
        }).join("") + "</tr>";
    });
    h += "</tbody></table></div></div>";

    h += '<p class="note no-print">Every field the parser decodes is editable here (except Row and Document Number, which ' +
      "identify the crash). Changing a field updates every other sheet and the collision diagram immediately. " +
      "ODOT&rsquo;s own crash data cleanup process only accepts a subset &mdash; <strong>Crash Type, County Cd, " +
      "ODOT Crash Location, NLFID, County True Log, On Road, At Road, ODOT Latitude, ODOT Longitude and ODOT FIPS " +
      "Code</strong> (see <em>HowToCompleteCrashDataCleanup.pdf</em>, Table 1) &mdash; and for each row wants either " +
      "NLFID and County True Log, or ODOT Latitude and ODOT Longitude. Submit corrections to the ODOT Safety Team: " +
      '<a href="https://odot.formstack.com/forms/crashdatacleanup" target="_blank" rel="noopener">' +
      "odot.formstack.com/forms/crashdatacleanup</a>. This tool can't produce the macro-enabled CAM Tool workbook " +
      "the instructions describe, so <strong>Download highlighted .xlsx</strong> is a plain-format substitute: " +
      "Document Number identifies each crash, and every field you've changed is shaded yellow.</p>";

    host.innerHTML = h;
    var box = $(".datatable", host);
    if (box) { box.scrollTop = scrollTop; box.scrollLeft = scrollLeft; }

    $$(".cell-in", host).forEach(function (el) {
      var key = el.getAttribute("data-field");
      var f = FULL_COLUMNS.filter(function (x) { return x.key === key; })[0];
      var commit = function () {
        var r = byId.get(+el.getAttribute("data-row"));
        if (!r) return;
        var val = el.value;
        if (f.upper) { val = val.toUpperCase(); el.value = val; }
        var before = getField(r, key);
        setField(r, key, val);
        applySideEffects(r, key);
        markEdited(r, key, before);
        refresh();
      };
      el.addEventListener("change", commit);
      if (el.tagName !== "SELECT") {
        el.addEventListener("keydown", function (e) { if (e.key === "Enter") el.blur(); });
      }
    });
    $("#x-csv").onclick = exportCSV;
    $("#x-xlsx").onclick = exportHighlightedXlsx;
    $("#x-reset").onclick = function () { resetEdits(); refresh(); };
  }

  function exportHighlightedXlsx() {
    if (!window.CAMXlsx || !window.JSZip) { msg("The .xlsx writer didn't load - check your connection and reload.", "err"); return; }
    var headers = ["OH-1"].concat(FULL_COLUMNS.map(function (f) { return f.label; }));
    var widths = [8].concat(FULL_COLUMNS.map(function (f) { return f.width || 16; }));
    var rows = state.records.map(function (r) {
      var row = [r.reportLink || ""];
      FULL_COLUMNS.forEach(function (f) {
        var v = getField(r, f.key);
        var edited = isEdited(r, f.key);
        if (typeof v === "number") { /* keep numeric */ } else if (v !== "" && /^-?\d+(\.\d+)?$/.test(v)) v = parseFloat(v);
        row.push(edited ? { v: v, hl: true } : v);
      });
      return row;
    });
    var name = (state.heading || "crash-data").replace(/[^\w-]+/g, "_") + "_corrected.xlsx";
    window.CAMXlsx.build({ sheetName: "Full Crash Data", headers: headers, rows: rows, widths: widths })
      .then(function (blob) { download(name, blob); })
      .catch(function () { msg("Could not build the .xlsx file.", "err"); });
  }

  /* ---------- export ---------- */
  function download(filename, data) {
    if (!window.claude || !window.claude.use) return fallbackDownload(filename, data);
    window.claude.use("downloads").then(function (dl) {
      if (!dl) return fallbackDownload(filename, data);
      dl.save({ filename: filename, data: data }).catch(function (e) {
        if (e && e.code === "declined") return;
        fallbackDownload(filename, data);
      });
    }).catch(function () { fallbackDownload(filename, data); });
  }
  function fallbackDownload(filename, data) {
    try {
      var blob = data instanceof Blob ? data : new Blob([data], { type: "text/plain;charset=utf-8" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url; a.download = filename; document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1500);
    } catch (e) { /* sandboxed viewers block page-initiated saves */ }
  }
  function exportCSV() {
    var head = ["OH1_Link"].concat(FULL_COLUMNS.map(function (f) { return f.label; }));
    var q = function (v) {
      v = v === undefined || v === null ? "" : String(v);
      return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
    };
    var lines = [head.map(q).join(",")];
    state.records.forEach(function (r) {
      lines.push([r.reportLink].concat(FULL_COLUMNS.map(function (f) { return getField(r, f.key); })).map(q).join(","));
    });
    download((state.heading || "cam-analysis").replace(/[^\w\-]+/g, "_") + ".csv", lines.join("\n"));
  }
  function saveSVG() {
    var svg = $("#cdhost svg");
    if (!svg) return;
    var clone = svg.cloneNode(true);
    /* Inline the token colours so the file stands alone. */
    var cs = getComputedStyle(document.documentElement);
    var css = "";
    ["--sheet", "--pave", "--curb", "--yellow", "--ink", "--ink-2", "--ink-3",
      "--fatal", "--injury", "--pdo", "--good"].forEach(function (k) {
        css += k + ":" + cs.getPropertyValue(k).trim() + ";";
      });
    var sheetCSS = Array.prototype.slice.call(document.styleSheets).map(function (s) {
      try {
        return Array.prototype.slice.call(s.cssRules)
          .filter(function (r) { return r.selectorText && r.selectorText.indexOf("svg.cd") >= 0; })
          .map(function (r) { return r.cssText; }).join("\n");
      } catch (e) { return ""; }
    }).join("\n");
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("style", css);
    clone.insertAdjacentHTML("afterbegin", "<style>" + sheetCSS.replace(/svg\.cd/g, "svg") + "</style>");
    download((state.heading || "collision-diagram").replace(/[^\w\-]+/g, "_") + ".svg",
      '<?xml version="1.0" encoding="UTF-8"?>\n' + clone.outerHTML);
  }

  /* ---------- window/tab title ---------- */
  function setTitle(heading) {
    var name = (heading || "Untitled site") + " - CAM Tool Web";
    $("#titlebar-name").textContent = name;
    document.title = name;
  }

  /* ---------- orchestration ---------- */
  function refresh() {
    applyFilters();
    var hd = A.headline(state.records);
    var yearsTxt = hd.years.min === hd.years.max ? String(hd.years.min) : hd.years.min + "-" + hd.years.max;

    setTitle(state.heading);
    $("#sb-crashes").textContent = num(hd.crashes);
    $("#sb-fi").textContent = num(hd.fiCrashes);
    $("#sb-years").textContent = yearsTxt;
    $("#sb-file").textContent = state.fileName || "-";

    renderPrintHeader();
    renderSetup(); renderSummary(); renderAnalysis(); renderUnit1();
    renderRSI(); renderProportions(); renderEmphasis(); renderTree();
    renderDiagram(); renderData();
    gridifyAll();
  }

  /* ---------- spreadsheet chrome: column letters + row numbers ---------- */
  function colLetter(n) {
    var s = ""; n += 1;
    while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
    return s;
  }
  function gridify(table) {
    if (table.dataset.gridified) return;
    table.dataset.gridified = "1";
    var headRow = table.tHead && table.tHead.rows[0];
    var bodyRows = table.tBodies[0] ? Array.prototype.slice.call(table.tBodies[0].rows) : [];
    var rows = (headRow ? [headRow] : []).concat(bodyRows);
    if (!rows.length) return;
    var maxCols = rows.reduce(function (m, r) { return Math.max(m, r.cells.length); }, 0);
    var ruler = document.createElement("tr");
    ruler.className = "xl-colhead";
    var corner = document.createElement("th");
    corner.className = "xl-corner";
    ruler.appendChild(corner);
    for (var c = 0; c < maxCols; c++) {
      var th = document.createElement("th");
      th.className = "xl-colletter";
      th.textContent = colLetter(c);
      ruler.appendChild(th);
    }
    if (!table.tHead) table.insertBefore(document.createElement("thead"), table.firstChild);
    table.tHead.insertBefore(ruler, table.tHead.firstChild);
    var rn = 1;
    rows.forEach(function (r) {
      var cell = document.createElement(r.parentNode.tagName === "THEAD" ? "th" : "td");
      cell.className = "xl-rownum";
      cell.textContent = rn++;
      r.insertBefore(cell, r.firstChild);
    });
  }
  function gridifyAll() { $$(".sheet-area table").forEach(gridify); }

  function load(text, name) {
    var recs;
    try { recs = P.build(text); }
    catch (e) { msg(e.message, "err"); return; }
    state.all = recs;
    state.fileName = name || "";
    var y = A.yearsOf(recs);
    state.filters = { yearFrom: y.min, yearTo: y.max, authority: "All" };

    var urban = recs.filter(function (r) { return r.isUrban; }).length >= recs.length / 2;
    var freeway = recs.filter(function (r) { return r.freeway === "Yes"; }).length >= recs.length / 2;
    var dists = {};
    recs.forEach(function (r) { if (r.district) dists[r.district] = (dists[r.district] || 0) + 1; });
    var dist = Object.keys(dists).sort(function (a, b) { return dists[b] - dists[a]; })[0] || "STW";
    state.site = {
      district: window.CAMREF.rsiDistricts.indexOf(dist) >= 0 ? dist : "STW",
      urban: urban ? "Yes" : "No",
      freeway: freeway ? "Yes" : "No",
      siteType: defaultSiteType(recs, urban)
    };

    applyFilters();
    var st = guessStreets();
    state.diagram.ewStreet = st.ew;
    state.diagram.nsStreet = st.ns;
    state.heading = st.ew && st.ns ? st.ew + " at " + st.ns : (name || "Crash analysis");

    document.body.classList.add("loaded");
    msg("Loaded " + recs.length + " crashes from " + (name || "the file") + ".", "ok");
    refresh();
  }

  function loadAndShow(text, name) { load(text, name); show("summary"); }

  /* Pick the closest shipped site subtype for the Proportions comparison. */
  function defaultSiteType(recs, urban) {
    var types = window.CAMREF.siteTypes;
    var intRel = recs.filter(function (r) { return r.intersectionRelated === "Yes"; }).length;
    var isInt = intRel >= recs.length * 0.25;
    var divided = recs.filter(function (r) { return r.divided === "Divided"; }).length > recs.length / 2;
    var four = recs.filter(function (r) { return /Four-Way/.test(r.crashLocation); }).length >=
      recs.filter(function (r) { return /T-Intersection/.test(r.crashLocation); }).length;
    var ctl = {};
    recs.forEach(function (r) { if (r.u1.trafficControl) ctl[r.u1.trafficControl] = (ctl[r.u1.trafficControl] || 0) + 1; });
    var signal = (ctl["Signal"] || 0) > 0;
    var want;
    if (isInt) {
      want = new RegExp("^Int; " + (urban ? "Urban" : "Rural") + ", " + (divided ? "Divided" : "Undivided") +
        ".*" + (signal ? "Signal" : "Stop") + ".*" + (four ? "4-Leg" : "3-Leg") + "$");
    } else {
      want = new RegExp("^Seg; " + (urban ? "Urban" : "Rural") + ", NonFreeway");
    }
    var hit = types.filter(function (t) { return want.test(t); })[0];
    return hit || types[0];
  }

  function msg(text, kind) {
    var m = $("#msg");
    m.className = "msg " + (kind || "");
    m.textContent = text;
    m.style.display = text ? "block" : "none";
  }

  var SHEETS = [
    { id: "setup", label: "Setup", group: "neutral", cell: "Setup" },
    { id: "data", label: "Full Crash Data", group: "blue", cell: "Data" },
    { id: "summary", label: "Quick Summary", group: "gold", cell: "QuickSumm" },
    { id: "analysis", label: "Crash Analysis", group: "gold", cell: "CrashAnl" },
    { id: "unit1", label: "Unit 1 Analysis", group: "gold", cell: "Unit1" },
    { id: "rsi", label: "RelativeSeverityIndex", group: "gold", cell: "RSI" },
    { id: "proportions", label: "Proportions", group: "gold", cell: "Propn" },
    { id: "emphasis", label: "Emphasis Area", group: "gold", cell: "Emphasis" },
    { id: "tree", label: "CrashTree", group: "gold", cell: "CrashTree" },
    { id: "diagram", label: "Collision Diagram", group: "green", cell: "ColDiag" }
  ];

  function buildTabs() {
    var strip = $("#tabstrip");
    strip.innerHTML = SHEETS.map(function (s) {
      return '<button class="tab ' + s.group + '" data-go="' + s.id + '" role="tab" aria-selected="false">' +
        esc(s.label) + "</button>";
    }).join("");
    $$(".tab", strip).forEach(function (b) {
      b.onclick = function () { show(b.getAttribute("data-go")); };
    });
    $("#tabs-left").onclick = function () { strip.scrollBy({ left: -160, behavior: "smooth" }); };
    $("#tabs-right").onclick = function () { strip.scrollBy({ left: 160, behavior: "smooth" }); };
  }

  function show(id) {
    if (!$("#sheet-" + id)) id = "setup";
    $$(".sheet").forEach(function (s) { s.classList.toggle("on", s.id === "sheet-" + id); });
    $$(".tab").forEach(function (b) {
      var on = b.getAttribute("data-go") === id;
      b.setAttribute("aria-selected", on ? "true" : "false");
      if (on) b.scrollIntoView({ block: "nearest", inline: "nearest" });
    });
    if (window.location.hash.slice(1) !== id) {
      try { history.replaceState(null, "", "#" + id); } catch (e) { /* sandboxed */ }
    }
    var ws = $(".worksheet");
    if (ws) ws.scrollTop = 0;
  }

  /* ---------- boot ---------- */
  document.addEventListener("DOMContentLoaded", function () {
    buildTabs();

    $("#file").onchange = function () {
      var f = this.files && this.files[0];
      if (!f) return;
      var fr = new FileReader();
      fr.onload = function () { loadAndShow(String(fr.result), f.name); };
      fr.readAsText(f);
    };
    $("#pick").onclick = function () { $("#file").click(); };
    $("#sample").onclick = function () { loadAndShow(window.CAMSAMPLE, window.CAMSAMPLENAME); };
    $("#print-btn").onclick = function () { window.print(); };

    var dz = $("#dropzone");
    ["dragenter", "dragover"].forEach(function (e) {
      dz.addEventListener(e, function (ev) { ev.preventDefault(); dz.classList.add("hot"); });
    });
    ["dragleave", "drop"].forEach(function (e) {
      dz.addEventListener(e, function (ev) { ev.preventDefault(); dz.classList.remove("hot"); });
    });
    dz.addEventListener("drop", function (ev) {
      var f = ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files[0];
      if (!f) return;
      var fr = new FileReader();
      fr.onload = function () { loadAndShow(String(fr.result), f.name); };
      fr.readAsText(f);
    });

    /* Open on the bundled site so the tool shows what it does. */
    load(window.CAMSAMPLE, window.CAMSAMPLENAME);
    msg("Showing the bundled sample export - Denison Ave at W 65th St, Cleveland. Load your own GCAT file to replace it.", "ok");
    show(window.location.hash.slice(1) || "setup");
    window.addEventListener("hashchange", function () { show(window.location.hash.slice(1) || "setup"); });
  });
})();
