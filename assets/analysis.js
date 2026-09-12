/* Analysis engine: reproduces the CAM Tool's Quick Summary, Crash Analysis,
   Unit 1 Analysis, Relative Severity Index, Proportions, Emphasis Area and
   Crash Tree worksheets. */
(function (global) {
  "use strict";
  var R = function () { return global.CAMREF; };

  var CRASH_TYPES = ["Unknown", "Head On", "Rear End", "Backing", "Sideswipe - Meeting",
    "Sideswipe - Passing", "Angle", "Parked Vehicle", "Pedestrian", "Animal", "Train",
    "Pedalcycles", "Other Non-Vehicle", "Fixed Object", "Other Object",
    "Falling From Or In Vehicle", "Overturning", "Other Non-Collision", "Left Turn", "Right Turn"];

  var SEVERITIES = ["(1) Fatal", "(2) Serious Injury Suspected", "(3) Minor Injury Suspected",
    "(4) Injury Possible", "(5) PDO/No Injury"];

  var LIGHT = ["Daylight", "Dawn/Dusk", "Dark - Lighted Roadway", "Dark - Roadway Not Lighted",
    "Dark - Unknown Roadway Lighting", "Other / Unknown"];

  var SURFACE = ["Dry", "Wet", "Snow", "Ice", "Sand, Mud, Dirt, Oil, Gravel",
    "Water (Standing, Moving)", "Slush", "Other / Unknown"];

  /* Tie-break ranks from the CrashTree sheet (column V) — higher wins a tie. */
  var TIEBREAK = {
    "Falling From Or In Vehicle": 0, "Other Non-Vehicle": 1, "Train": 2, "Unknown": 3,
    "Pedalcycles": 4, "Other Object": 5, "Overturning": 6, "Pedestrian": 7,
    "Other Non-Collision": 8, "Sideswipe - Meeting": 9, "Head On": 10, "Right Turn": 11,
    "Backing": 12, "Parked Vehicle": 13, "Animal": 14, "Angle": 15, "Left Turn": 16,
    "Sideswipe - Passing": 17, "Fixed Object": 18, "Rear End": 19
  };

  function sum(rows, f) { var t = 0; for (var i = 0; i < rows.length; i++) t += f(rows[i]) || 0; return t; }

  /* Descending-count tally, the shape every CAM pivot uses. */
  function tally(rows, key, opts) {
    opts = opts || {};
    var m = new Map();
    rows.forEach(function (r) {
      var k = key(r);
      if (k === "" || k === null || k === undefined) k = opts.blank || "";
      if (k === "" && opts.dropBlank !== false) return;
      var e = m.get(k);
      if (!e) { e = { label: k, count: 0, fatal: 0, serious: 0 }; m.set(k, e); }
      e.count++; e.fatal += r.fatal; e.serious += r.serious;
    });
    var list = Array.from(m.values());
    if (opts.order) {
      var ord = opts.order;
      list.sort(function (a, b) {
        var ia = ord.indexOf(a.label), ib = ord.indexOf(b.label);
        if (ia < 0) ia = 1e6; if (ib < 0) ib = 1e6;
        return ia - ib || String(a.label).localeCompare(String(b.label));
      });
    } else if (opts.numeric) {
      list.sort(function (a, b) { return Number(a.label) - Number(b.label); });
    } else {
      list.sort(function (a, b) { return b.count - a.count || String(a.label).localeCompare(String(b.label)); });
    }
    var total = list.reduce(function (t, e) { return t + e.count; }, 0);
    list.forEach(function (e) { e.pct = total ? e.count / total : 0; });
    return { rows: list, total: total };
  }

  function yearsOf(rows) {
    var ys = rows.map(function (r) { return r.year; }).filter(function (y) { return y > 0; });
    if (!ys.length) return { min: 0, max: 0, span: 1 };
    var min = Math.min.apply(null, ys), max = Math.max.apply(null, ys);
    return { min: min, max: max, span: max - min + 1 };
  }

  function headline(rows) {
    var y = yearsOf(rows);
    var n = rows.length;
    var pdo = rows.filter(function (r) { return r.fi === "PDO"; }).length;
    var e = R().epdo;
    var counts = {};
    SEVERITIES.forEach(function (s) { counts[s] = 0; });
    rows.forEach(function (r) { if (counts[r.severity] !== undefined) counts[r.severity]++; });
    var epdo = n ? ((counts[SEVERITIES[0]] + counts[SEVERITIES[1]]) * e.KA
      + counts[SEVERITIES[2]] * e.B + counts[SEVERITIES[3]] * e.C + counts[SEVERITIES[4]] * e.O) / n : 0;
    return {
      crashes: n,
      years: y,
      perYear: y.span ? n / y.span : 0,
      fatalities: sum(rows, function (r) { return r.fatal; }),
      serious: sum(rows, function (r) { return r.serious; }),
      otherInjuries: sum(rows, function (r) { return r.minor; }) + sum(rows, function (r) { return r.possible; }),
      fiCrashes: n - pdo,
      pctInjury: n ? 1 - pdo / n : 0,
      epdo: epdo
    };
  }

  /* ---------- Quick Summary ---------- */
  function quickSummary(rows) {
    var t = function (key, opts) { return tally(rows, key, opts); };
    return {
      headline: headline(rows),
      severity: t(function (r) { return r.severity; }, { order: SEVERITIES }),
      year: t(function (r) { return r.year; }, { numeric: true }),
      dayOfWeek: t(function (r) { return r.dayOfWeek; }, { order: R().dayOfWeek ? Object.values(R().dayOfWeek) : null }),
      crashType: t(function (r) { return r.crashType; }),
      hour: t(function (r) { return r.hour; }, { numeric: true }),
      month: t(function (r) { return r.month; }, { numeric: true }),
      weather: t(function (r) { return r.weather; }),
      roadCond: t(function (r) { return r.roadCond; }),
      lightCond: t(function (r) { return r.lightCond; }),
      units: t(function (r) { return r.units; }, { numeric: true }),
      location: t(function (r) { return r.crashLocation; }),
      contour: t(function (r) { return r.roadContour; }),
      workZone: t(function (r) { return r.workZone; }, { order: ["No", "Yes"] }),
      alcohol: t(function (r) { return r.alcohol; }, { order: ["No", "Yes"] }),
      drug: t(function (r) { return r.drug === "Yes" || r.marijuana === "Yes" ? "Yes" : "No"; }, { order: ["No", "Yes"] }),
      marijuana: t(function (r) { return r.marijuana; }, { order: ["No", "Yes"] }),
      roadwayDeparture: t(function (r) { return r.roadwayDeparture; }, { order: ["No", "Yes"] }),
      older: t(function (r) { return r.seniorDriver; }, { order: ["No", "Yes"] }),
      intersectionRel: t(function (r) { return r.intersectionRelated; }, { order: ["Yes", "No"] }),
      young: t(function (r) { return r.youngDriver; }, { order: ["No", "Yes"] }),
      speed: t(function (r) { return r.speedRelated; }, { order: ["No", "Yes"] }),
      motorcycle: t(function (r) { return r.motorcycle; }, { order: ["No", "Yes"] }),
      distracted: t(function (r) { return r.distracted; }, { order: ["No", "Yes"] }),
      u1Precrash: t(function (r) { return r.u1.precrash; }),
      u1Contrib: t(function (r) { return r.u1.contrib; }),
      u1Object: t(function (r) { return r.u1.objectStruck; }),
      u1Control: t(function (r) { return r.u1.trafficControl; }),
      u1Posted: t(function (r) { return r.u1.postedSpeed; }, { numeric: true }),
      u1Est: t(function (r) { return r.u1.speedBand; }),
      u1From: t(function (r) { return r.u1.dirFrom; }),
      u1To: t(function (r) { return r.u1.dirTo; }),
      u1Type: t(function (r) { return r.u1.unitType; }),
      u1Special: t(function (r) { return r.u1.specialFunction; })
    };
  }

  /* ---------- Crash Analysis ---------- */
  function withHarm(rows, key, opts) {
    var res = tally(rows, key, opts);
    return res;
  }
  function crashAnalysis(rows) {
    var byYear = withHarm(rows, function (r) { return r.year; }, { numeric: true });
    var svmv = {};
    ["SV", "MV"].forEach(function (k) {
      svmv[k] = { total: 0, fi: 0 };
    });
    rows.forEach(function (r) { svmv[r.mvsv].total++; if (r.fi === "FI") svmv[r.mvsv].fi++; });
    /* Crash type x severity matrix */
    var types = tally(rows, function (r) { return r.crashType; });
    var matrix = types.rows.map(function (e) {
      var cells = SEVERITIES.map(function (s) {
        return rows.filter(function (r) { return r.crashType === e.label && r.severity === s; }).length;
      });
      return { label: e.label, cells: cells, total: e.count };
    });
    var matrixTotals = SEVERITIES.map(function (s) {
      return rows.filter(function (r) { return r.severity === s; }).length;
    });
    return {
      headline: headline(rows),
      byYear: byYear,
      matrix: { rows: matrix, totals: matrixTotals, grand: rows.length, cols: SEVERITIES },
      svmv: svmv,
      roadCond: withHarm(rows, function (r) { return r.roadCond; }),
      lightCond: withHarm(rows, function (r) { return r.lightCond; }),
      weather: withHarm(rows, function (r) { return r.weather; }),
      hour: tally(rows, function (r) { return r.hour; }, { numeric: true }),
      month: tally(rows, function (r) { return r.monthName; }, { order: global.CAMParse.MONTHS }),
      location: withHarm(rows, function (r) { return r.crashLocation; })
    };
  }

  /* ---------- Unit 1 Analysis ---------- */
  function unit1(rows) {
    var t = function (key) { return tally(rows, key); };
    return {
      unitType: t(function (r) { return r.u1.unitType; }),
      trafficControl: t(function (r) { return r.u1.trafficControl; }),
      specialFunction: t(function (r) { return r.u1.specialFunction; }),
      objectStruck: t(function (r) { return r.u1.objectStruck; }),
      precrash: t(function (r) { return r.u1.precrash; }),
      contrib: t(function (r) { return r.u1.contrib; }),
      dirFrom: t(function (r) { return r.u1.dirFrom; }),
      dirTo: t(function (r) { return r.u1.dirTo; }),
      posted: tally(rows, function (r) { return r.u1.postedSpeed; }, { numeric: true }),
      estimated: t(function (r) { return r.u1.speedBand; }),
      gender: t(function (r) { return r.u1.gender; }),
      distractedBy: t(function (r) { return r.u1.distractedBy; })
    };
  }

  /* ---------- Relative Severity Index ---------- */
  function rsiMultiplier(district, urban, freeway, crashType) {
    var key = district + "|" + urban + "|" + freeway + "|" + crashType;
    var e = R().rsi[key];
    if (!e || !e[1]) return 0;
    return Math.round(e[0] / e[1]);
  }
  function rsi(rows, opts) {
    var counts = {};
    CRASH_TYPES.forEach(function (c) { counts[c] = 0; });
    rows.forEach(function (r) { if (counts[r.crashType] !== undefined) counts[r.crashType]++; });
    var lines = CRASH_TYPES.map(function (c) {
      var mult = rsiMultiplier(opts.district, opts.urban, opts.freeway, c);
      return { type: c, count: counts[c], mult: mult, cost: counts[c] * mult };
    });
    var totalCrashes = lines.reduce(function (t, l) { return t + l.count; }, 0);
    var totalCost = lines.reduce(function (t, l) { return t + l.cost; }, 0);
    return {
      lines: lines,
      totalCrashes: totalCrashes,
      totalCost: totalCost,
      value: totalCrashes ? Math.round((totalCost / totalCrashes) * 100) / 100 : 0
    };
  }

  /* ---------- Proportions ---------- */
  function propBlock(rows, siteKey, statewideTable, categories, keyFn) {
    var n = {}, o = {};
    categories.forEach(function (c) { n[c] = 0; o[c] = 0; });
    rows.forEach(function (r) {
      var k = keyFn(r);
      if (n[k] === undefined) return;
      n[k]++; if (r.fi === "FI") o[k]++;
    });
    var nT = categories.reduce(function (t, c) { return t + n[c]; }, 0);
    var oT = categories.reduce(function (t, c) { return t + o[c]; }, 0);
    var sw = (statewideTable || {})[siteKey] || {};
    return categories.map(function (c) {
      var pair = sw[c] || [0, 0];
      return {
        label: c,
        siteTotal: nT ? n[c] / nT : null,
        swTotal: pair[0] / 100,
        siteFI: oT ? o[c] / oT : null,
        swFI: pair[1] / 100,
        n: n[c], nFI: o[c]
      };
    });
  }

  function proportions(rows, siteKey) {
    var P = R().proportions;
    var sev = P.severity[siteKey] || {};
    var swTotal = SEVERITIES.reduce(function (t, s) { return t + (sev[s] || 0); }, 0);
    var counts = SEVERITIES.map(function (s) {
      return rows.filter(function (r) { return r.severity === s; }).length;
    });
    var n = rows.length;
    return {
      siteKey: siteKey,
      severity: SEVERITIES.map(function (s, i) {
        return {
          label: s.replace(/^\(\d\)\s*/, ""),
          count: counts[i],
          sitePct: n ? counts[i] / n : null,
          swPct: swTotal ? (sev[s] || 0) / swTotal : 0
        };
      }),
      severityTotal: n,
      crashType: propBlock(rows, siteKey, P.crashType, CRASH_TYPES, function (r) { return r.crashType; }),
      light: propBlock(rows, siteKey, P.light, LIGHT, function (r) { return r.lightCond; }),
      surface: propBlock(rows, siteKey, P.surface, SURFACE, function (r) { return r.roadCond; })
    };
  }

  /* ---------- Emphasis Area (Ohio SHSP target groups) ---------- */
  var TARGETS = [
    { name: "Total", test: null, total: true },
    { name: "Roadway Departure", test: function (r) { return r.roadwayDeparture === "Yes"; } },
    { name: "Intersection", test: function (r) { return r.intersectionRelated === "Yes"; } },
    { name: "Railroad Crossing", test: function (r) { return r.crashType === "Train"; } },
    { name: "Alcohol Related Involvement", test: function (r) { return r.alcohol === "Yes"; } },
    { name: "Restraints Not Used Driver/Occupants", test: function (r) { return r.unrestrained > 0; } },
    { name: "Speed Related Involvement", test: function (r) { return r.speedRelated === "Yes"; } },
    { name: "Young Driver Involvement (15-25)", test: function (r) { return r.youngDriver === "Yes"; } },
    { name: "Older Driver Involvement (65+)", test: function (r) { return r.seniorDriver === "Yes"; } },
    { name: "Distracted Drivers", test: function (r) { return r.distracted === "Yes"; } },
    { name: "Motorcycle Driver/Passenger", test: function (r) { return r.motorcycle === "Yes"; } },
    { name: "Pedestrian Involvement", test: function (r) { return r.crashType === "Pedestrian"; } },
    { name: "Bicycle Involvement", test: function (r) { return r.crashType === "Pedalcycles"; } },
    { name: "Work Zone Related", test: function (r) { return r.workZone === "Yes"; } },
    { name: "Drug Related Involvement", test: function (r) { return r.drug === "Yes"; } },
    { name: "Marijuana Involvement", test: function (r) { return r.marijuana === "Yes"; } },
    { name: "Rear End", test: function (r) { return r.crashType === "Rear End"; } }
  ];

  function emphasis(rows, authority) {
    var base = authority && authority !== "All"
      ? rows.filter(function (r) { return r.maintAuthority === authority; }) : rows;
    var y = yearsOf(base);
    var years = [];
    for (var yr = y.max; yr > y.max - 11 && yr >= y.min; yr--) years.push(yr);
    function block(field) {
      return TARGETS.map(function (t) {
        var cells = years.map(function (yr) {
          var set = base.filter(function (r) {
            return r.year === yr && (t.test ? t.test(r) : true);
          });
          return sum(set, function (r) { return r[field]; });
        });
        return { name: t.name, total: t.total, cells: cells };
      });
    }
    var fat = block("fatal"), ser = block("serious");
    function pct(block) {
      var totals = block[0].cells;
      return block.map(function (row) {
        return {
          name: row.name, total: row.total, cells: row.cells,
          pcts: row.cells.map(function (v, i) { return totals[i] ? v / totals[i] : null; })
        };
      });
    }
    return { years: years, fatalities: pct(fat), serious: pct(ser), authority: authority || "All" };
  }

  /* ---------- Crash Tree ---------- */
  function nodeStats(rows) {
    return {
      crashes: rows.length,
      fatalities: sum(rows, function (r) { return r.fatal; }),
      serious: sum(rows, function (r) { return r.serious; })
    };
  }
  function topTypes(rows, k) {
    var scored = CRASH_TYPES.map(function (c) {
      var set = rows.filter(function (r) { return r.crashType === c; });
      var st = nodeStats(set);
      return {
        type: c, crashes: st.crashes, fatalities: st.fatalities, serious: st.serious,
        score: st.crashes + st.fatalities * 0.001 + st.serious * 0.000001 + (TIEBREAK[c] || 0) * 1e-8
      };
    });
    scored.sort(function (a, b) { return b.score - a.score; });
    return scored.slice(0, k).filter(function (e) { return e.crashes > 0; });
  }
  function crashTree(rows, authority, yearFrom, yearTo) {
    var base = rows.filter(function (r) {
      if (yearFrom && r.year < yearFrom) return false;
      if (yearTo && r.year > yearTo) return false;
      if (authority && authority !== "All" && r.maintAuthority !== authority) return false;
      return true;
    });
    var nonInt = base.filter(function (r) { return r.intersectionRelated !== "Yes"; });
    var inter = base.filter(function (r) { return r.intersectionRelated === "Yes"; });
    var rd = nonInt.filter(function (r) { return r.roadwayDeparture === "Yes"; });
    var nonRd = nonInt.filter(function (r) { return r.roadwayDeparture !== "Yes"; });
    var sig = inter.filter(function (r) { return r.u1.trafficControl === "Signal"; });
    var unsig = inter.filter(function (r) {
      var c = r.u1.trafficControl;
      return c === "Stop Sign" || c === "Yield Sign" || c === "Flasher";
    });
    var othInt = inter.filter(function (r) {
      var c = r.u1.trafficControl;
      return !(c === "Signal" || c === "Stop Sign" || c === "Yield Sign" || c === "Flasher");
    });
    function mk(label, set) {
      var s = nodeStats(set); s.label = label; s.top = topTypes(set, 3); return s;
    }
    return {
      total: mk("All Crashes", base),
      nonIntersection: mk("Non-Intersection", nonInt),
      intersection: mk("Intersection", inter),
      roadwayDeparture: mk("Roadway Departure", rd),
      nonIntOther: mk("Other", nonRd),
      signalized: mk("Signalized", sig),
      unsignalized: mk("Unsignalized", unsig),
      intOther: mk("Other", othInt)
    };
  }

  global.CAMAnalysis = {
    CRASH_TYPES: CRASH_TYPES, SEVERITIES: SEVERITIES, LIGHT: LIGHT, SURFACE: SURFACE,
    tally: tally, yearsOf: yearsOf, headline: headline,
    quickSummary: quickSummary, crashAnalysis: crashAnalysis, unit1: unit1,
    rsi: rsi, rsiMultiplier: rsiMultiplier, proportions: proportions,
    emphasis: emphasis, crashTree: crashTree, sum: sum
  };
})(window);
