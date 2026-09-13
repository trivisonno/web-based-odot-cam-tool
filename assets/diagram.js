/* Collision diagram.
   Crash-type letters, zone assignment and symbol rotation are ported from the
   CAM Tool's CollisionDiagram VBA module so that a crash lands in the same
   place it would in the spreadsheet. Geometry and symbol artwork are redrawn
   as SVG. */
(function (global) {
  "use strict";

  /* Directions are compared as the VBA's truncated uppercase strings. */
  function dir(s) {
    s = String(s || "").toUpperCase();
    if (s.indexOf("NORTHE") === 0 || s === "NE") return "NE";
    if (s.indexOf("NORTHW") === 0 || s === "NW") return "NW";
    if (s.indexOf("SOUTHE") === 0 || s === "SE") return "SE";
    if (s.indexOf("SOUTHW") === 0 || s === "SW") return "SW";
    if (s.indexOf("NORTH") === 0 || s === "N") return "N";
    if (s.indexOf("SOUTH") === 0 || s === "S") return "S";
    if (s.indexOf("EAST") === 0 || s === "E") return "E";
    if (s.indexOf("WEST") === 0 || s === "W") return "W";
    return "U";
  }

  function letterFor(r) {
    var t = r.crashType, f1 = dir(r.u1.dirFrom), f2 = dir(r.u2.dirFrom),
      t1 = dir(r.u1.dirTo), t2 = dir(r.u2.dirTo);
    switch (t) {
      case "Rear End": return "A";
      case "Fixed Object": return "B";
      case "Angle": return f1 === f2 ? "D" : "C";
      case "Animal": return "E";
      case "Sideswipe - Passing": return "F";
      case "Head On": return "G";
      case "Sideswipe - Meeting": return "H";
      case "Backing": return "I";
      case "Pedestrian": return "K";
      case "Parked Vehicle": return "L";
      case "Left Turn": return "M";
      case "Right Turn": return t1 === t2 ? "N" : "O";
      default: return "J";
    }
  }

  /* Approach-based zone/rotation for the single-approach symbol letters. */
  var STD_ZONE = { N: 1, NW: 1, E: 3, NE: 3, S: 5, SE: 5, SW: 7 };
  var OPP_ZONE = { N: 2, NW: 2, E: 4, NE: 4, S: 6, SE: 6, SW: 8 };
  var STD_ROT = { E: 180, N: 90, S: 270, NE: 135, NW: 45, SE: 225, SW: 315 };

  /* Pair tables: [from1, from2, to1, to2, zone, rotation]; order-insensitive. */
  var C_TABLE = [
    ["E", "N", null, null, 9, 180], ["E", "S", null, null, 10, 270],
    ["W", "N", null, null, 12, 90], ["NW", "SW", null, null, 12, 45],
    ["NW", "NE", null, null, 9, 135], ["NE", "SE", null, null, 10, 225],
    ["SE", "SW", null, null, 11, 315]
  ];
  var M_TABLE = [
    ["N", "S", "S", "W", 9, 90], ["N", "S", "E", "N", 11, 270],
    ["E", "W", "W", "N", 10, 180], ["W", "E", "E", "S", 12, 0],
    ["SW", "NE", "NE", "SE", 12, 315], ["NW", "SE", "SE", "SW", 9, 45],
    ["NE", "SW", "SW", "NW", 10, 135], ["NW", "SW", "SE", "NW", 11, 225]
  ];
  var N_TABLE = [
    ["N", "W", "S", "S", 9, 90], ["E", "N", "W", "W", 10, 180],
    ["S", "E", "N", "N", 11, 270], ["W", "S", "E", "E", 12, 0],
    ["SW", "SE", "NE", "NE", 12, 315], ["NW", "SW", "SE", "SE", 9, 45],
    ["NE", "NW", "SW", "SW", 10, 135], ["NE", "SE", "NW", "NW", 11, 225]
  ];
  var O_TABLE = [
    ["N", "S", "S", "E", 9, 90], ["E", "W", "W", "S", 10, 180],
    ["S", "N", "N", "W", 11, 270], ["W", "E", "E", "N", 12, 0],
    ["SW", "NE", "NE", "NW", 12, 315], ["NW", "SE", "SE", "NE", 9, 45],
    ["NE", "SW", "SW", "SE", 10, 135], ["NW", "SE", "SW", "NW", 11, 225]
  ];

  function matchPair(table, f1, f2, t1, t2, usesTo) {
    for (var i = 0; i < table.length; i++) {
      var e = table[i];
      var a = f1 === e[0] && f2 === e[1] && (!usesTo || (t1 === e[2] && t2 === e[3]));
      var b = f2 === e[0] && f1 === e[1] && (!usesTo || (t2 === e[2] && t1 === e[3]));
      if (a || b) return e;
    }
    return null;
  }

  function place(r) {
    var L = letterFor(r);
    var f1 = dir(r.u1.dirFrom), f2 = dir(r.u2.dirFrom),
      t1 = dir(r.u1.dirTo), t2 = dir(r.u2.dirTo);
    var zone, rot;
    if (L === "C" || L === "M" || L === "N" || L === "O") {
      var table = L === "C" ? C_TABLE : L === "M" ? M_TABLE : L === "N" ? N_TABLE : O_TABLE;
      var hit = matchPair(table, f1, f2, t1, t2, L !== "C");
      zone = hit ? hit[4] : 11;
      rot = hit ? hit[5] : 0;
    } else if ("ABEJL".indexOf(L) >= 0) {
      zone = STD_ZONE[f1] || 7; rot = STD_ROT[f1] === undefined ? 0 : STD_ROT[f1];
    } else {
      zone = OPP_ZONE[f1] || 8; rot = STD_ROT[f1] === undefined ? 0 : STD_ROT[f1];
    }
    return { letter: L, zone: zone, rotation: rot };
  }

  /* ---------- geometry ---------- */
  var W = 1180, H = 960, CX = 590, CY = 440, HW = 100, HH = 120;

  var ZONES = {
    1: { x: CX - 76, y: CY - HH - 38, ux: 50, uy: 0, vx: 0, vy: -56, cols: 2, max: 10 },
    2: { x: CX + 26, y: CY - HH - 38, ux: 50, uy: 0, vx: 0, vy: -56, cols: 2, max: 10 },
    3: { x: CX + HW + 38, y: CY - 76, ux: 0, uy: 50, vx: 58, vy: 0, cols: 2, max: 10 },
    4: { x: CX + HW + 38, y: CY + 26, ux: 0, uy: 50, vx: 58, vy: 0, cols: 2, max: 10 },
    5: { x: CX + 26, y: CY + HH + 38, ux: 50, uy: 0, vx: 0, vy: 56, cols: 2, max: 10 },
    6: { x: CX - 76, y: CY + HH + 38, ux: 50, uy: 0, vx: 0, vy: 56, cols: 2, max: 10 },
    7: { x: CX - HW - 38, y: CY + 26, ux: 0, uy: 50, vx: -58, vy: 0, cols: 2, max: 10 },
    8: { x: CX - HW - 38, y: CY - 76, ux: 0, uy: 50, vx: -58, vy: 0, cols: 2, max: 10 },
    9: { x: CX - 72, y: CY - 92, ux: 48, uy: 0, vx: 0, vy: 48, cols: 2, max: 4 },
    10: { x: CX + 24, y: CY - 92, ux: 48, uy: 0, vx: 0, vy: 48, cols: 2, max: 4 },
    11: { x: CX + 24, y: CY + 44, ux: 48, uy: 0, vx: 0, vy: 48, cols: 2, max: 4 },
    12: { x: CX - 72, y: CY + 44, ux: 48, uy: 0, vx: 0, vy: 48, cols: 2, max: 4 }
  };

  /* ---------- symbol artwork (base: unit 1 travels east) ---------- */
  function arrow(x1, y1, x2, y2) {
    var a = Math.atan2(y2 - y1, x2 - x1), h = 5.5, w = 3.2;
    var bx = x2 - h * Math.cos(a), by = y2 - h * Math.sin(a);
    var px = -Math.sin(a) * w, py = Math.cos(a) * w;
    return '<path d="M' + x1 + ' ' + y1 + 'L' + x2 + ' ' + y2 + '"/>' +
      '<path class="hd" d="M' + x2 + ' ' + y2 + 'L' + (bx + px) + ' ' + (by + py) +
      'L' + (bx - px) + ' ' + (by - py) + 'Z"/>';
  }
  function zig(x, y1, y2) {
    var n = 4, step = (y2 - y1) / n, d = "M" + (x - 3) + " " + y1;
    for (var i = 1; i <= n; i++) d += "L" + (x + (i % 2 ? 3 : -3)) + " " + (y1 + step * i);
    return '<path class="thin" d="' + d + '"/>';
  }

  var SYMBOLS = {
    A: arrow(-21, 0, -8, 0) + arrow(-4, 0, 18, 0),
    B: arrow(-20, 0, 11, 0) + '<path d="M15 -8L15 8"/><path class="thin" d="M15 -8L20 -3M15 0L20 5M15 6L19 10"/>',
    C: arrow(-21, 0, -2, 0) + arrow(0, 21, 0, 2),
    D: arrow(-21, -5, 18, -5) + arrow(-19, 15, 4, 2),
    E: arrow(-21, 0, 7, 0) + '<ellipse class="fill" cx="14" cy="1" rx="6" ry="4"/>' +
      '<circle class="fill" cx="19" cy="-5" r="3"/><path class="thin" d="M18 -8L17 -12M21 -8L22 -12"/>',
    F: arrow(-21, -8, 17, -8) + arrow(-21, 8, 17, 8) + zig(0, -5, 5),
    G: arrow(-21, 0, -3, 0) + arrow(21, 0, 3, 0),
    H: arrow(-21, -7, 15, -7) + arrow(21, 7, -15, 7) + zig(0, -4, 4),
    I: arrow(-21, -3, 16, -3) + '<g class="dash">' + arrow(19, 11, 3, 11) + "</g>",
    J: arrow(-21, 0, 9, 0) + '<circle cx="15" cy="0" r="4.5"/>',
    K: arrow(-21, 0, 3, 0) + '<path class="dash" d="M14 -16L14 16"/>' +
      '<circle class="fill" cx="14" cy="-4" r="3"/><path class="thin" d="M14 -1L14 7M14 7L10 13M14 7L18 13M10 2L18 2"/>',
    L: arrow(-21, 0, 4, 0) + '<rect x="8" y="-7" width="14" height="14" rx="2"/>',
    M: arrow(-22, 7, 15, 7) + '<path d="M22 -7L2 -7Q-3 -7 -3 -2L-3 9"/>' + arrow(-3, 9, -3, 17),
    N: arrow(-22, -7, 17, -7) + '<path d="M-5 20L-5 9Q-5 5 -1 5L11 5"/>' + arrow(11, 5, 18, 5),
    O: arrow(-22, 7, 17, 7) + '<path d="M22 -6L3 -6Q-1 -6 -1 -10L-1 -14"/>' + arrow(-1, -14, -1, -21)
  };

  var LETTER_NAME = {
    A: "Rear end", B: "Fixed object", C: "Angle", D: "Angle (same approach)",
    E: "Animal", F: "Sideswipe – passing", G: "Head on", H: "Sideswipe – meeting",
    I: "Backing", J: "Other / non-collision", K: "Pedestrian or pedalcycle",
    L: "Parked vehicle", M: "Left turn", N: "Right turn", O: "Right turn (opposing)"
  };

  function sevClass(r) {
    if (r.severityCode === 1) return "fatal";
    if (r.severityCode >= 2 && r.severityCode <= 4) return "injury";
    return "pdo";
  }

  /* ---------- labels ---------- */
  var LABEL_FIELDS = [
    { id: "rowid", name: "Row ID", get: function (r) { return r.i; } },
    { id: "doc", name: "Doc number", get: function (r) { return r.docNbr; } },
    { id: "date", name: "Crash date", get: function (r) { return r.date; } },
    { id: "hour", name: "Hour", get: function (r) { return r.hour === "" ? "" : String(r.hour).padStart(2, "0") + ":00"; } },
    { id: "light", name: "Light condition", get: function (r) { return r.lightCond; } },
    { id: "road", name: "Road condition", get: function (r) { return r.roadCond; } },
    { id: "year", name: "Year", get: function (r) { return r.year; } },
    { id: "sev", name: "Severity", get: function (r) { return r.severity; } },
    { id: "dow", name: "Day of week", get: function (r) { return r.dayOfWeek; } },
    { id: "onroad", name: "Street on", get: function (r) { return r.onRoad; } },
    { id: "atroad", name: "Street at", get: function (r) { return r.atRoad; } },
    { id: "logpt", name: "Log point", get: function (r) { return r.logPoint; } },
    { id: "offset", name: "Offset", get: function (r) { return r.offset; } },
    { id: "offdir", name: "Offset direction", get: function (r) { return r.offsetDir; } },
    { id: "dir1", name: "Direction 1 from/to", get: function (r) { return r.u1.dirFrom ? r.u1.dirFrom + "→" + (r.u1.dirTo || "?") : ""; } },
    { id: "dir2", name: "Direction 2 from/to", get: function (r) { return r.u2.dirFrom ? r.u2.dirFrom + "→" + (r.u2.dirTo || "?") : ""; } }
  ];

  function labelFor(r, ids) {
    var out = [];
    LABEL_FIELDS.forEach(function (f) {
      if (ids.indexOf(f.id) < 0) return;
      var v = f.get(r);
      if (v !== "" && v !== null && v !== undefined) out.push(String(v));
    });
    return out;
  }

  function esc(s) {
    return String(s === null || s === undefined ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  /* ---------- render ---------- */
  function render(records, opts) {
    opts = opts || {};
    var labels = opts.labels || ["rowid"];
    var ewName = opts.ewStreet || "", nsName = opts.nsStreet || "";
    var control = opts.control || "None";

    var buckets = {}; for (var z = 1; z <= 12; z++) buckets[z] = [];
    var placed = [];
    records.forEach(function (r) {
      var p = place(r);
      buckets[p.zone].push({ r: r, p: p });
    });

    var overflow = [];
    var body = "";
    Object.keys(buckets).forEach(function (z) {
      var cfg = ZONES[z], list = buckets[z];
      list.forEach(function (item, k) {
        if (k >= cfg.max) { overflow.push(item); return; }
        var col = k % cfg.cols, row = Math.floor(k / cfg.cols);
        var x = cfg.x + cfg.ux * col + cfg.vx * row;
        var y = cfg.y + cfg.uy * col + cfg.vy * row;
        body += symbolNode(item, x, y, labels);
        placed.push(item);
      });
    });

    /* Overflow box sits in the outer north-west corner, as in the CAM Tool. */
    var ovf = "";
    if (overflow.length) {
      var bw = 250, perRow = 4, rowsN = Math.ceil(overflow.length / perRow);
      var bh = 38 + rowsN * 50;
      ovf += '<g class="ovf"><rect x="44" y="44" width="' + bw + '" height="' + bh +
        '" rx="4"/><text class="ovf-t" x="' + (44 + bw / 2) + '" y="66">CRASH OVERFLOW ZONE</text></g>';
      overflow.forEach(function (item, k) {
        var x = 44 + 32 + (k % perRow) * 60, y = 44 + 56 + Math.floor(k / perRow) * 50;
        ovf += symbolNode(item, x, y, labels);
      });
    }

    var svg = [];
    svg.push('<svg class="cd" viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Collision diagram">');
    svg.push(roadway(ewName, nsName, control));
    svg.push(body);
    svg.push(ovf);
    svg.push("</svg>");
    return { svg: svg.join(""), placed: placed.length, overflow: overflow.length, total: records.length };
  }

  function symbolNode(item, x, y, labels) {
    var r = item.r, p = item.p;
    var lines = labelFor(r, labels);
    var txt = "";
    lines.forEach(function (t, i) {
      txt += '<text class="cd-lbl" x="' + x + '" y="' + (y + 28 + i * 11) + '">' + esc(t) + "</text>";
    });
    var tip = r.crashType + " · " + r.severity + " · " + (r.date || r.year) +
      (r.u1.dirFrom ? " · U1 from " + r.u1.dirFrom : "");
    return '<g class="sym ' + sevClass(r) + '" data-doc="' + esc(r.docNbr) + '" data-i="' + r.i +
      '" tabindex="0" role="button" aria-label="' + esc(tip) + '">' +
      "<title>" + esc(tip) + "</title>" +
      '<circle class="hit" cx="' + x + '" cy="' + y + '" r="20"/>' +
      '<g transform="translate(' + x + ' ' + y + ') rotate(' + p.rotation + ') scale(0.8)">' +
      SYMBOLS[p.letter] + "</g>" + txt + "</g>";
  }

  function roadway(ewName, nsName, control) {
    var g = [];
    g.push('<rect class="cd-bg" x="0" y="0" width="' + W + '" height="' + H + '"/>');
    /* pavement */
    g.push('<rect class="pave" x="0" y="' + (CY - HH) + '" width="' + W + '" height="' + (HH * 2) + '"/>');
    g.push('<rect class="pave" x="' + (CX - HW) + '" y="0" width="' + (HW * 2) + '" height="' + H + '"/>');
    /* curb lines with returns */
    var rr = 34;
    g.push('<path class="curb" d="M0 ' + (CY - HH) + 'H' + (CX - HW - rr) +
      'q' + rr + ' 0 ' + rr + ' -' + rr + 'V0"/>');
    g.push('<path class="curb" d="M' + W + " " + (CY - HH) + 'H' + (CX + HW + rr) +
      'q-' + rr + ' 0 -' + rr + ' -' + rr + 'V0"/>');
    g.push('<path class="curb" d="M0 ' + (CY + HH) + 'H' + (CX - HW - rr) +
      'q' + rr + ' 0 ' + rr + ' ' + rr + 'V' + H + '"/>');
    g.push('<path class="curb" d="M' + W + " " + (CY + HH) + 'H' + (CX + HW + rr) +
      'q-' + rr + ' 0 -' + rr + ' ' + rr + 'V' + H + '"/>');
    /* centre lines */
    g.push('<path class="cl" d="M0 ' + (CY - 3) + 'H' + (CX - HW) + 'M0 ' + (CY + 3) + 'H' + (CX - HW) + '"/>');
    g.push('<path class="cl" d="M' + (CX + HW) + " " + (CY - 3) + 'H' + W + 'M' + (CX + HW) + " " + (CY + 3) + 'H' + W + '"/>');
    g.push('<path class="cl" d="M' + (CX - 3) + ' 0V' + (CY - HH) + 'M' + (CX + 3) + ' 0V' + (CY - HH) + '"/>');
    g.push('<path class="cl" d="M' + (CX - 3) + " " + (CY + HH) + 'V' + H + 'M' + (CX + 3) + " " + (CY + HH) + 'V' + H + '"/>');
    /* north arrow */
    g.push('<g class="north" transform="translate(' + (W - 74) + ' 92)">' +
      '<path class="fill" d="M0 -34L9 10L0 2L-9 10Z"/>' +
      '<text class="north-t" x="0" y="30">N</text></g>');
    /* street names */
    if (ewName) {
      g.push('<text class="st" x="28" y="' + (CY - HH - 14) + '">' + esc(ewName) + "</text>");
      g.push('<text class="st" text-anchor="end" x="' + (W - 28) + '" y="' + (CY + HH + 26) + '">' + esc(ewName) + "</text>");
    }
    if (nsName) {
      g.push('<text class="st" transform="translate(' + (CX - HW - 14) + ' 40) rotate(-90)" text-anchor="end">' + esc(nsName) + "</text>");
      g.push('<text class="st" transform="translate(' + (CX + HW + 22) + " " + (H - 30) + ') rotate(-90)">' + esc(nsName) + "</text>");
    }
    /* traffic control */
    if (control === "Signal") {
      [[CX - HW - 18, CY - HH - 18], [CX + HW + 18, CY - HH - 18],
      [CX + HW + 18, CY + HH + 18], [CX - HW - 18, CY + HH + 18]].forEach(function (p) {
        g.push('<g class="ctl sig" transform="translate(' + p[0] + " " + p[1] + ')">' +
          '<rect x="-7" y="-17" width="14" height="34" rx="3"/>' +
          '<circle class="r" cx="0" cy="-10" r="3.6"/><circle class="y" cx="0" cy="0" r="3.6"/>' +
          '<circle class="g" cx="0" cy="10" r="3.6"/></g>');
      });
    } else if (control === "Stop Sign" || control === "Yield Sign" || control === "Flasher") {
      /* Real sign shapes, matching the CAM Tool's own icons (a red octagon
         for Stop; the workbook has no Yield icon at all, so this is drawn
         to the standard MUTCD downward-pointing triangle instead). */
      var kind = control === "Yield Sign" ? "yield" : control === "Flasher" ? "flasher" : "stop";
      var shape = kind === "yield"
        ? '<path class="tri" d="M0 15.3L-13.2 -7.65L13.2 -7.65Z"/>'
        : kind === "flasher"
          ? '<circle r="14"/><text y="5">✵</text>'
          : '<path class="oct" d="M12.2 5.05L5.05 12.2L-5.05 12.2L-12.2 5.05L-12.2 -5.05L-5.05 -12.2L5.05 -12.2L12.2 -5.05Z"/><text y="3.5">STOP</text>';
      [[CX - HW - 22, CY - HH - 22], [CX + HW + 22, CY - HH - 22],
      [CX + HW + 22, CY + HH + 22], [CX - HW - 22, CY + HH + 22]].forEach(function (p) {
        g.push('<g class="ctl ' + kind + '" transform="translate(' + p[0] + " " + p[1] + ')">' + shape + "</g>");
      });
    }
    return g.join("");
  }

  function legendItems() {
    return Object.keys(SYMBOLS).map(function (k) {
      return { letter: k, name: LETTER_NAME[k], svg: SYMBOLS[k] };
    });
  }

  global.CAMDiagram = {
    render: render, place: place, letterFor: letterFor, dir: dir,
    LABEL_FIELDS: LABEL_FIELDS, LETTER_NAME: LETTER_NAME,
    SYMBOLS: SYMBOLS, legendItems: legendItems, sevClass: sevClass
  };
})(window);
