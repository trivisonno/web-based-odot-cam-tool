/* GCAT / AASHTOWare Safety CSV -> normalized crash records.
   Field mapping mirrors the CAM Tool's "Data" -> "Full Crash Data" sheet formulas. */
(function (global) {
  "use strict";

  /* ---------- CSV ---------- */
  function parseCSV(text) {
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    var rows = [], row = [], field = "", i = 0, inQ = false, n = text.length;
    while (i < n) {
      var c = text[i];
      if (inQ) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
          inQ = false; i++; continue;
        }
        field += c; i++; continue;
      }
      if (c === '"') { inQ = true; i++; continue; }
      if (c === ",") { row.push(field); field = ""; i++; continue; }
      if (c === "\r") { i++; continue; }
      if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; i++; continue; }
      field += c; i++;
    }
    if (field !== "" || row.length) { row.push(field); rows.push(row); }
    return rows.filter(function (r) { return r.length > 1 || (r[0] || "").trim() !== ""; });
  }

  var norm = function (s) {
    return String(s || "").toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  };

  /* ---------- helpers ---------- */
  var R = function () { return global.CAMREF; };

  function look(table, code, fallback) {
    if (code === "" || code === null || code === undefined) return fallback === undefined ? "" : fallback;
    var t = R()[table];
    var v = t[String(code)];
    if (v === undefined && /^\d+$/.test(String(code))) v = t[String(parseInt(code, 10))];
    return v === undefined ? (fallback === undefined ? "" : fallback) : v;
  }
  function yn(v) { return String(v || "").trim().toUpperCase() === "Y" ? "Yes" : "No"; }
  function num(v) { var x = parseFloat(v); return isFinite(x) ? x : 0; }
  function trimJoin(parts) {
    return parts.filter(function (p) { return p !== undefined && p !== null && String(p).trim() !== ""; })
      .join(" ").replace(/\s+/g, " ").trim();
  }

  /* Posted speed is binned to the nearest 5, capped at 70 (Full Crash Data col CL). */
  function bandSpeed(v) {
    if (v === "" || v === null || v === undefined) return "";
    var x = parseFloat(v); if (!isFinite(x)) return "";
    if (x > 70) return 70;
    var last = x % 10;
    if (last === 5 || last === 0) return x;
    return last > 5 ? Math.floor(x / 10) * 10 + 5 : Math.floor(x / 10) * 10;
  }
  /* Estimated-speed bands used by the Quick Summary sheet. */
  function speedBand(v) {
    var x = parseFloat(v);
    if (!isFinite(x)) return "Unknown";
    if (x < 15) return "<15";
    if (x > 70) return ">70";
    var lo = Math.floor(x / 5) * 5;
    if (lo === 70) return "65-70";
    if (lo === 65) return "65-70";
    return lo + "-" + (lo + 4);
  }

  var MONTHS = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"];

  /* Crash types that involve two or more vehicles (Full Crash Data col ER). */
  var MV_TYPES = { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1, 18: 1, 19: 1 };

  function unit(g, p) {
    return {
      dirFrom: look("dirFrom", g(p + "DIRECTION_FROM_CD")),
      dirTo: look("dirTo", g(p + "DIRECTION_TO_CD")),
      turn: look("turn", g(p + "TURN_CD")),
      trafficControl: look("trafficControl", g(p + "TRAFFIC_CONTROL_CD")),
      unitType: look("unitType", g(p + "TYPE_OF_UNIT_CD")),
      specialFunction: look("specialFunction", g(p + "SPECIAL_FUNCTION_CD")),
      precrash: look("precrashAction", g(p + "PRECRASH_ACTION_CD")),
      contrib: look("contribCirc", g(p + "CONT_CIR_PRIMARY_CD")),
      objectStruck: look("objectStruck", g(p + "OBJECT_STRUCK")),
      nonMotorist: look("nonMotoristLoc", g(p + "NON_MOTORIST_LOC_CD")),
      distractedBy: look("distractedBy", g(p + "DISTRACTED_BY_1_CD")),
      gender: look("gender", g(p + "GENDER_CD")),
      age: g(p + "AGE_NBR") === "" ? "" : num(g(p + "AGE_NBR")),
      postedSpeed: bandSpeed(g(p + "POSTED_SPEED_NBR")),
      unitSpeed: g(p + "UNIT_SPEED_NBR") === "" ? "" : num(g(p + "UNIT_SPEED_NBR")),
      speedBand: speedBand(g(p + "UNIT_SPEED_NBR"))
    };
  }

  function build(text) {
    var rows = parseCSV(text);
    if (!rows.length) throw new Error("The file is empty.");
    var head = rows[0].map(norm);
    var idx = {};
    head.forEach(function (h, i) { if (!(h in idx)) idx[h] = i; });
    if (!("DOCUMENT_NBR" in idx) && !("CRASH_YR" in idx)) {
      throw new Error("This does not look like a GCAT export - no DOCUMENT_NBR or CRASH_YR column was found.");
    }
    /* A couple of GCAT headers differ from their ODOT field names. */
    var ALIAS = {
      DISTRACTED_DRIVER_IND: "DRIVER_DISTRACTED_INVOLVED",
      CRASH_DATE: "CRASH_DATE",
      U1_OBJECT_STRUCK: "U1_OBJECT_STRUCK"
    };

    var out = [];
    for (var r = 1; r < rows.length; r++) {
      var raw = rows[r];
      if (!raw || raw.every(function (v) { return String(v).trim() === ""; })) continue;
      var g = function (name) {
        var k = norm(name);
        var i = idx[k];
        if (i === undefined && ALIAS[k] !== undefined) i = idx[ALIAS[k]];
        return i === undefined ? "" : String(raw[i] === undefined ? "" : raw[i]).trim();
      };
      if (g("DOCUMENT_NBR") === "" && g("CRASH_YR") === "") continue;

      var sevCode = g("CRASH_SEVERITY_CD");
      var ctCode = g("CRASH_TYPE_CD");
      var mAuthCode = g("MAINTENANCE_AUTHORITY_CD");
      var jur = g("NLF_JUR_CD").toUpperCase();
      var mAuth = look("maintAuthority", mAuthCode, "");
      if (mAuth === "" || mAuthCode === "80") {
        mAuth = jur === "S" || jur === "U" || jur === "I" ? "State Highway Agency"
          : jur === "C" ? "County Highway Agency"
            : jur === "T" ? "Township Highway Agency"
              : jur === "M" ? "City or Village Highway Agency" : "Other";
      }

      var onRoad = g("ODPS_LOC_ROUTE_ID")
        ? trimJoin([g("ODPS_LOC_ROUTE_PREFIX_CD"), g("ODPS_LOC_ROUTE_ID"), g("ODPS_LOC_ROUTE_SUFFIX_CD")])
        : trimJoin([g("ODPS_LOC_ROAD_DIRECTION_CD"), g("ODPS_LOC_ROAD_NME"),
          g("ODPS_LOC_ROAD_SUFFIX_CD"), g("ODPS_LOC_DIR_SUFFIX_CD")]);
      var atRoad = g("ODPS_MILEPOST_REFERENCE")
        ? "MP " + g("ODPS_MILEPOST_REFERENCE")
        : g("ODPS_ADDRESS_REFERENCE")
          ? g("ODPS_ADDRESS_REFERENCE")
          : g("ODPS_REF_ROUTE_ID")
            ? trimJoin([g("ODPS_REF_ROUTE_PREFIX_CD"), g("ODPS_REF_ROUTE_ID"), g("ODPS_REF_ROUTE_SUFFIX_CD")])
            : trimJoin([g("ODPS_REF_DIRECTION_CD"), g("ODPS_REF_GIVEN"),
              g("ODPS_REF_SUFFIX_CD"), g("ODPS_REF_DIR_SUFFIX_CD")]);

      var mon = parseInt(g("MONTH_OF_CRASH"), 10);
      var area = g("AREA_CODE");
      var rec = {
        i: out.length + 1,
        docNbr: g("DOCUMENT_NBR"),
        localReport: g("LOCAL_REPORT_NUMBER_ID"),
        reportLink: g("CRASH_REPORT_LINK"),
        year: parseInt(g("CRASH_YR"), 10) || 0,
        month: isFinite(mon) ? mon : 0,
        monthName: isFinite(mon) && mon >= 1 && mon <= 12 ? MONTHS[mon - 1] : "Unknown",
        date: g("CRASH_DATE") || g("CRASH_MONTH_YEAR"),
        hour: g("HOUR_OF_CRASH") === "" ? "" : parseInt(g("HOUR_OF_CRASH"), 10),
        dayOfWeek: look("dayOfWeek", g("DAY_IN_WEEK_CD")),
        severity: look("severity", sevCode),
        severityCode: parseInt(sevCode, 10) || 0,
        crashType: look("crashType", ctCode, "Unknown"),
        crashTypeCode: parseInt(ctCode, 10),
        fatal: num(g("ODPS_TOTAL_FATALITIES_NBR")),
        serious: num(g("INCAPAC_INJURIES_NBR")),
        minor: num(g("NON_INCAPAC_INJURIES_NBR")),
        possible: num(g("POSSIBLE_INJURIES_NBR")),
        noInjury: num(g("NO_INJURY_REPORTED_NBR")),
        unrestrained: num(g("UNRESTRAIN_OCCUPANTS")),
        units: g("NUMBER_OF_UNITS_NBR") === "" ? "" : num(g("NUMBER_OF_UNITS_NBR")),
        district: g("DISTRICT_NBR"),
        county: g("NLF_COUNTY_CD"),
        areaCode: area,
        urbanArea: look("areaCode", area, ""),
        isUrban: area !== "" && area !== "99999",
        freeway: yn(g("FREEWAY_IND")),
        interstate: yn(g("INTERSTATE_IND")),
        funcClass: look("funcClass", g("FUNCTIONAL_CLASS_CD")),
        facilityType: look("facilityType", g("FACILITY_TYPE_CD")),
        crashLocation: look("crashLocation", g("ODOT_CRASH_LOCATION_CD")),
        intersectionRelated: yn(g("ODOT_INTERSECTION_REL_IND")),
        roadwayDeparture: yn(g("FHWA_RDWY_DEPARTURE_IND")),
        alcohol: yn(g("ODPS_ALCOHOL_IND")),
        drug: yn(g("ODPS_DRUG_IND")),
        marijuana: yn(g("U1_IS_MARIJUANA_SUSPECTED")),
        schoolZone: yn(g("ODPS_SCHOOL_ZONE_IND")),
        motorcycle: yn(g("ODPS_MOTORCYCLE_IND")),
        speedRelated: yn(g("ODPS_SPEED_IND")),
        seniorDriver: yn(g("ODPS_SENIOR_DRIVER_IND")),
        youngDriver: yn(g("ODOT_YOUNG_DRIVER_IND")),
        workZone: yn(g("ODPS_WORK_ZONE_IND")),
        distracted: yn(g("DISTRACTED_DRIVER_IND")),
        weather: look("weather", g("WEATHER_COND_CD"), "Other / Unknown"),
        roadCond: look("roadCond", g("ROAD_COND_PRIMARY_CD"), "Other / Unknown"),
        lightCond: look("lightCond", g("LIGHT_COND_PRIMARY_CD"), "Other / Unknown"),
        roadContour: look("roadContour", g("ROAD_CONTOUR_CD")),
        divided: g("ODOT_DIV_UNDIV_IND") === "Y" ? "Divided" : g("ODOT_DIV_UNDIV_IND") === "N" ? "Undivided" : "Unknown",
        lanes: g("ODOT_LANES_NBR"),
        maintAuthority: mAuth,
        nlfid: g("NLFID"),
        logPoint: g("COUNTY_LOG_NBR"),
        lat: g("ODOT_LATITUDE_NBR"),
        lon: g("ODOT_LONGITUDE_NBR"),
        fips: g("ODOT_FIPS_CD"),
        onRoad: onRoad,
        atRoad: atRoad,
        offset: g("ODOT_MILES_FROM_REF_NBR"),
        offsetDir: look("dirFrom", g("ODOT_DIR_FROM_REF_CD")),
        intersectionId: g("INTERSECTION_ID_CURRENT"),
        u1: unit(g, "U1_"),
        u2: unit(g, "U2_")
      };
      rec.mvsv = MV_TYPES[rec.crashTypeCode] ? "MV" : "SV";
      rec.fi = rec.severityCode >= 1 && rec.severityCode <= 4 ? "FI" : "PDO";
      rec.injuryCrash = rec.fi === "FI";
      out.push(rec);
    }
    if (!out.length) throw new Error("No crash rows were found in the file.");
    return out;
  }

  global.CAMParse = {
    build: build, parseCSV: parseCSV, MONTHS: MONTHS,
    MV_TYPES: MV_TYPES, bandSpeed: bandSpeed, speedBand: speedBand
  };
})(window);
