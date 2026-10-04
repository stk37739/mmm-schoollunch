"use strict";

/*
 * Turns the plain text of a weekly lunch email into five arrays (Mon-Fri).
 *
 * A day starts at a line that begins with a weekday name ("Monday",
 * "Tues:", "**Wednesday 10/8**" ...) and runs until the next weekday line,
 * a weekend line, a sign-off, or one of your own stopPatterns.
 *
 * Newsletter-style emails mention weekdays elsewhere too (events, dates in
 * headers), so use startAfter / endBefore to fence in the menu section.
 *
 * Try it:  node parser.js sample-bees-buzz.txt --startAfter "menu for the week of" \
 *            --endBefore "Grab and Go|REMINDER" --splitOr --received 2026-10-02
 */

const DAY_NAMES = ["mon(?:day)?", "tue(?:s(?:day)?)?", "wed(?:nesday)?", "thu(?:r(?:s(?:day)?)?)?", "fri(?:day)?"];
const WEEKEND = ["sat(?:urday)?", "sun(?:day)?"];
const ANY_DAY = `(?:${[...DAY_NAMES, ...WEEKEND].join("|")})\\b`;
const LEAD = "^[\\s*_#>|•\\-–—]*";

const DAY_RES = DAY_NAMES.map((d) => new RegExp(`${LEAD}${d}\\b\\.?(.*)$`, "i"));
const WEEKEND_RE = new RegExp(`${LEAD}(?:${WEEKEND.join("|")})\\b`, "i");
// "Monday through Friday", "Mon-Fri", "Monday, Tuesday ..." are not day headers
const RANGE_RE = new RegExp(`^\\s*(?:(?:through|thru|to|until)\\b|[-–—/&,]\\s*${ANY_DAY})`, "i");

const DEFAULT_STOPS = [
  /^[\s*_]*(?:thanks|thank you|sincerely|regards|best regards|warm regards|sent from|unsubscribe)\b/i,
  /^--\s*$/,
  /menu (?:is )?subject to change/i
];
const DEFAULT_IGNORES = [/^https?:\/\/\S+$/i];

const DATE_RE = /^\s*[(\[]?(?:\d{1,2}[/.-]\d{1,2}(?:[/.-]\d{2,4})?|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2}(?:st|nd|rd|th)?)[)\]]?/i;
const SEP_RE = /^[\s,:;|\-–—.)*_]+/;

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
// "the menu for the week of 10/5-10/9", "Week of October 5"
const WEEKOF_RE = /week\s+(?:of|beginning|starting)\s+(?:(\d{1,2})[/.-](\d{1,2})|([a-z]{3,9})\.?\s+(\d{1,2}))/i;

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function cleanRest(rest) {
  return rest.replace(SEP_RE, "").replace(DATE_RE, "").replace(SEP_RE, "");
}

function cleanItem(s) {
  return s
    .replace(/\s*\[https?:[^\]]*\]/g, "") // links rendered as "text [url]"
    .replace(/^[\s*•·▪●○◦>\-–—]+/, "") // bullets
    .replace(/\*+/g, "") // markdown bold
    .replace(/\s+/g, " ")
    .replace(/^\|+|\|+$/g, "")
    .trim();
}

function matchWeekOf(line) {
  const m = WEEKOF_RE.exec(line);
  if (!m) return null;
  if (m[1]) return { month: +m[1], day: +m[2] };
  const mi = MONTHS.indexOf(m[3].slice(0, 3).toLowerCase());
  return mi >= 0 ? { month: mi + 1, day: +m[4] } : null;
}

// Monday of the week a date falls in (Sat/Sun roll forward to the next Monday)
function weekStartFor(date, weekOffset = 0) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dow = d.getDay();
  d.setDate(d.getDate() + (dow === 0 ? 1 : dow === 6 ? 2 : 1 - dow) + 7 * weekOffset);
  return d;
}

// Prefer the "week of 10/5" printed in the email; otherwise guess from the
// date the email arrived (+ weekOffset weeks).
function resolveWeekStart(parsed, received, weekOffset = 0) {
  if (parsed.weekOf) {
    let year = received.getFullYear();
    const diff = parsed.weekOf.month - (received.getMonth() + 1);
    if (diff < -6) year++;
    else if (diff > 6) year--;
    return weekStartFor(new Date(year, parsed.weekOf.month - 1, parsed.weekOf.day), 0);
  }
  return weekStartFor(received, weekOffset);
}

function expand(rest, inline, opts) {
  // "Wednesday: Pasta, garlic bread, broccoli" becomes three items
  const parts = inline && opts.splitInline !== false ? rest.split(/\s*[,;]\s*(?:and\s+)?/i) : [rest];
  const out = [];
  for (const part of parts) {
    const item = cleanItem(part);
    if (!item) continue;
    if (opts.splitOr) {
      // "Pizza or Quesadilla" becomes "Pizza" and "or Quesadilla"
      item
        .split(/\s+or\s+/i)
        .map((s) => s.trim())
        .filter(Boolean)
        .forEach((s, i) => out.push(i ? `or ${s}` : s));
    } else {
      out.push(item);
    }
  }
  return out;
}

function parseMenu(text, opts = {}) {
  const toRe = (p) => (p instanceof RegExp ? p : new RegExp(p, "i"));
  const stops = [...DEFAULT_STOPS, ...(opts.stopPatterns || []).map(toRe)];
  const ignores = [...DEFAULT_IGNORES, ...(opts.ignorePatterns || []).map(toRe)];

  const days = [[], [], [], [], []];
  const seen = [false, false, false, false, false];
  let cur = -1;
  let anyHit = false;
  let weekOf = null;

  const lines = String(text).replace(/\r/g, "").split("\n");

  let from = 0;
  if (opts.startAfter) {
    const startRe = toRe(opts.startAfter);
    from = lines.findIndex((l) => startRe.test(l));
    if (from < 0) return { days, found: 0, weekOf };
  }
  const endRe = opts.endBefore ? toRe(opts.endBefore) : null;

  for (let n = from; n < lines.length; n++) {
    const line = lines[n].trim();
    if (endRe && n > from && endRe.test(line)) break;

    if (!line) {
      if (opts.blankLineEndsDay && cur >= 0 && days[cur].length) cur = -1;
      continue;
    }

    if (!weekOf && !anyHit) weekOf = matchWeekOf(line);

    let hit = null;
    for (let i = 0; i < DAY_RES.length && !hit; i++) {
      const m = DAY_RES[i].exec(line);
      if (m && !RANGE_RE.test(m[1])) hit = { i, rest: m[1] };
    }

    let rest;
    if (hit) {
      anyHit = true;
      // The first block for each weekday wins; later mentions are ignored
      cur = seen[hit.i] ? -1 : hit.i;
      seen[hit.i] = true;
      if (cur < 0) continue;
      rest = cleanRest(hit.rest);
    } else if (WEEKEND_RE.test(line) || stops.some((re) => re.test(line))) {
      cur = -1;
      continue;
    } else if (cur < 0) {
      continue;
    } else {
      rest = line;
    }

    for (const item of expand(rest, !!hit, opts)) {
      if (!ignores.some((re) => re.test(item))) days[cur].push(item);
    }
  }

  return { days, found: days.filter((d) => d.length).length, weekOf };
}

module.exports = { parseMenu, resolveWeekStart, weekStartFor, ymd };

if (require.main === module) {
  const [file, ...args] = process.argv.slice(2);
  if (!file) {
    console.error("usage: node parser.js <email-text-file> [--startAfter RE] [--endBefore RE] [--splitOr] [--blankLineEndsDay] [--received YYYY-MM-DD]");
    process.exit(1);
  }
  const opts = {};
  let received = new Date();
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--splitOr" || a === "--blankLineEndsDay") opts[a.slice(2)] = true;
    else if (a === "--startAfter" || a === "--endBefore") opts[a.slice(2)] = args[++i];
    else if (a === "--received") received = new Date(args[++i] + "T12:00:00");
  }
  const parsed = parseMenu(require("fs").readFileSync(file, "utf8"), opts);
  console.log(JSON.stringify({ ...parsed, weekStart: ymd(resolveWeekStart(parsed, received)) }, null, 2));
}
