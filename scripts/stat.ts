import { EXAMPLE_SKILL_KNOWLEDGE_ID } from "@slonigiraf/utils";
import fs from "node:fs";
import zlib from "node:zlib";

type AnyRow = Record<string, unknown>;

type DexieTableEntry = {
  tableName?: string;
  rows?: AnyRow[];
};

type DexieExport = {
  db?: {
    data?: {
      data?: DexieTableEntry[];
    };
  };
};

function toDayString(value: unknown): string | null {
  // supports: ISO string, numeric ms, numeric string, Date-ish
  let d: Date | null = null;

  if (typeof value === "number" && Number.isFinite(value)) {
    d = new Date(value);
  } else if (typeof value === "string" && value.trim().length > 0) {
    // try numeric string (ms)
    const asNum = Number(value);
    if (Number.isFinite(asNum) && value.trim().match(/^\d+$/)) {
      d = new Date(asNum);
    } else {
      const parsed = Date.parse(value);
      if (!Number.isNaN(parsed)) d = new Date(parsed);
    }
  } else if (value instanceof Date) {
    d = value;
  }

  if (!d || Number.isNaN(d.getTime())) return null;

  // Use UTC day to avoid timezone surprises between machines
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDaysFromRows(out: Set<string>, rows: AnyRow[], fields: string[]): void {
  for (const r of rows) {
    for (const f of fields) {
      const ds = toDayString(r?.[f]);
      if (ds) out.add(ds);
    }
  }
}

function toMs(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;

  if (typeof value === "string" && value.trim().length > 0) {
    // numeric string (ms)
    if (/^\d+$/.test(value.trim())) {
      const n = Number(value);
      if (Number.isFinite(n)) return n;
    }
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return parsed;
  }

  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isNaN(ms) ? null : ms;
  }

  return null;
}

// ------------------ hold all timestamps per day ------------------

type DayTimestamps = Map<string, number[]>;

function addDayTimestampsFromRows(out: DayTimestamps, rows: AnyRow[], fields: string[]): void {
  for (const r of rows) {
    for (const f of fields) {
      const ms = toMs(r?.[f]);
      if (ms == null) continue;

      const day = toDayString(ms);
      if (!day) continue;

      const arr = out.get(day);
      if (arr) arr.push(ms);
      else out.set(day, [ms]);
    }
  }
}

function mergeDayTimestamps(into: DayTimestamps, from: DayTimestamps): void {
  for (const [day, arr] of from) {
    const prev = into.get(day);
    if (!prev) into.set(day, [...arr]);
    else prev.push(...arr);
  }
}

const ONE_HOUR_MS = 60 * 60 * 1000;

function toMinutesWorkedFromTimestamps(ts: number[]): number {
  if (!Array.isArray(ts) || ts.length < 2) return 0;

  const sorted = ts
    .filter((x) => typeof x === "number" && Number.isFinite(x))
    .slice()
    .sort((a, b) => a - b);

  if (sorted.length < 2) return 0;

  const daySpan = sorted[sorted.length - 1] - sorted[0];
  if (!Number.isFinite(daySpan) || daySpan <= 0) return 0;

  // If whole-day span is under 1 hour, just take the span.
  if (daySpan < ONE_HOUR_MS) {
    return Math.round(daySpan / 60000);
  }

  // Otherwise split into sessions:
  // new session when current timestamp is > 1 hour from the *session start* (your rule)
  let totalMinutes = 0;

  let sessionStart = sorted[0];
  let sessionMin = sorted[0];
  let sessionMax = sorted[0];

  const flush = () => {
    const diff = sessionMax - sessionMin;
    if (Number.isFinite(diff) && diff > 0) totalMinutes += Math.round(diff / 60000);
  };

  for (let i = 1; i < sorted.length; i++) {
    const t = sorted[i];

    if (t - sessionStart > ONE_HOUR_MS) {
      flush();
      sessionStart = t;
      sessionMin = t;
      sessionMax = t;
      continue;
    }

    sessionMax = t; // sorted => current is max
  }

  flush();
  return totalMinutes;
}

function printMinutesWorked(title: string, byDay: DayTimestamps): void {
  const rows = Array.from(byDay.entries()).sort(([a], [b]) => a.localeCompare(b));
  console.log(`\nminutes_worked_per_day: ${title}`);
  if (rows.length === 0) {
    console.log("(no timestamps)");
    return;
  }
  for (const [day, ts] of rows) {
    console.log(`${day} : ${toMinutesWorkedFromTimestamps(ts)}`);
  }
}

// ---------------------------------------------------------------------

const FOUR_MIN_MS = 4 * 60 * 1000;

function buildSyntheticLetterTemplateTimestampsFromLetters(letters: AnyRow[]): AnyRow[] {
  const out: AnyRow[] = [];

  for (const l of letters) {
    if (l["knowledgeId"] !== EXAMPLE_SKILL_KNOWLEDGE_ID) continue;

    const createdMs = toMs(l["created"]);
    if (createdMs == null) continue;

    const syntheticMs = createdMs - FOUR_MIN_MS;
    if (!Number.isFinite(syntheticMs)) continue;

    // treat as an extra "lastExamined"
    out.push({ lastExamined: syntheticMs });
  }

  return out;
}

type DayCounts = Map<string, number>;

function addDayCountsFromRows(out: DayCounts, rows: AnyRow[], fields: string[]): void {
  for (const r of rows) {
    for (const f of fields) {
      const ds = toDayString(r?.[f]);
      if (!ds) continue;
      out.set(ds, (out.get(ds) ?? 0) + 1);
    }
  }
}

function mergeDayCounts(into: DayCounts, from: DayCounts): void {
  for (const [day, cnt] of from) {
    into.set(day, (into.get(day) ?? 0) + cnt);
  }
}

async function readTextMaybeGz(filePath: string): Promise<string> {
  const isGz = filePath.toLowerCase().endsWith(".gz");

  if (!isGz) {
    return fs.promises.readFile(filePath, "utf8");
  }

  return await new Promise<string>((resolve, reject) => {
    const chunks: Uint8Array[] = [];

    fs.createReadStream(filePath)
      .pipe(zlib.createGunzip())
      .on("data", (c: Buffer) => {
        chunks.push(new Uint8Array(c));
      })
      .on("error", reject)
      .on("end", () => {
        const buf = Buffer.concat(chunks);
        resolve(buf.toString("utf8"));
      });
  });
}

// NEW: read knowledge ids file (one id per line, or comma/space-separated; supports .gz too)
async function readKnowledgeIds(filePath: string): Promise<string[]> {
  const txt = await readTextMaybeGz(filePath);
  const ids = txt
    .split(/\r?\n/)
    .flatMap((line) => line.split(/[,\t ]+/g))
    .map((s) => s.trim())
    .filter(Boolean);

  // keep order but de-duplicate
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function buildTableMap(parsed: DexieExport): Map<string, AnyRow[]> {
  const tableEntries = parsed?.db?.data?.data;
  if (!Array.isArray(tableEntries)) {
    throw new Error("Unexpected JSON structure. Expected parsed.db.data.data to be an array.");
  }

  const map = new Map<string, AnyRow[]>();
  for (const entry of tableEntries) {
    const name = entry?.tableName;
    const rows = Array.isArray(entry?.rows) ? entry.rows : [];
    if (typeof name === "string") map.set(name, rows);
  }
  return map;
}

function getRows(tables: Map<string, AnyRow[]>, name: string): AnyRow[] {
  return tables.get(name) ?? [];
}

function distinctCountFromField(rows: AnyRow[], candidateFields: string[]): number {
  const set = new Set<string>();
  for (const r of rows) {
    for (const f of candidateFields) {
      const v = r?.[f];
      if (typeof v === "string" && v.length > 0) {
        set.add(v);
        break;
      }
    }
  }
  return set.size;
}

function countWhere(rows: AnyRow[], predicate: (r: AnyRow) => boolean): number {
  let c = 0;
  for (const r of rows) if (predicate(r)) c++;
  return c;
}

function totalMinutesWorked(byDay: DayTimestamps): number {
  let total = 0;
  for (const [, ts] of byDay) {
    total += toMinutesWorkedFromTimestamps(ts);
  }
  return total;
}

function printResults(results: Record<string, number>): void {
  const entries = Object.entries(results);
  const maxKey = Math.max(...entries.map(([k]) => k.length));
  for (const [k, v] of entries) {
    console.log(`${k.padEnd(maxKey)} : ${v}`);
  }
}

function csvEscape(value: unknown): string {
  if (value == null) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s) || s !== s.trim()) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

// NEW: stable CSV writer from explicit column order
function objectToCsvOneRowOrdered(
  obj: Record<string, unknown>,
  keys: string[]
): string {
  const header = keys.map(csvEscape).join(",");
  const row = keys.map((k) => csvEscape(obj[k])).join(",");
  return `${header}\n${row}\n`;
}

async function writeCsvFile(filePath: string, csvText: string): Promise<void> {
  await fs.promises.writeFile(filePath, csvText, "utf8");
}

async function main(): Promise<void> {
  const accountPath = process.argv[2];     // gz/json
  const knowledgePath = process.argv[3];  // list of ids
  const outCsvPath = process.argv[4];     // output csv

  if (!accountPath || !knowledgePath || !outCsvPath) {
    console.error(
      "Usage: node --loader ts-node/esm stats-dexie-export.ts <export.json.gz|export.json> <knowledge_ids.txt|.gz> <output.csv>\n" +
      "knowledge file: ids can be one-per-line (preferred) or separated by spaces/commas."
    );
    process.exit(2);
  }

  const knowledgeIds = await readKnowledgeIds(knowledgePath);

  const text = await readTextMaybeGz(accountPath);
  const parsed = JSON.parse(text) as DexieExport;
  const tables = buildTableMap(parsed);

  const agreements = getRows(tables, "agreements");
  const insurances = getRows(tables, "insurances");
  const canceledInsurances = getRows(tables, "canceledInsurances");
  const canceledLetters = getRows(tables, "canceledLetters");
  const lessons = getRows(tables, "lessons");
  const letters = getRows(tables, "letters");
  const letterTemplates = getRows(tables, "letterTemplates");
  const pseudonyms = getRows(tables, "pseudonyms");
  const reexams = getRows(tables, "reexams");
  const usageRights = getRows(tables, "usageRights");
  const repetitions = getRows(tables, "repetitions");
  const learnRequests = getRows(tables, "learnRequests");

  // --- knowledge sets ---
  const lettersKnowledge = new Set<string>();
  for (const l of letters) {
    const kid = l["knowledgeId"];
    if (typeof kid === "string" && kid.length > 0) lettersKnowledge.add(kid);
  }

  const repetitionsKnowledge = new Set<string>();
  for (const l of repetitions) {
    const kid = l["knowledgeId"];
    if (typeof kid === "string" && kid.length > 0) repetitionsKnowledge.add(kid);
  }

  const letterTemplateKnowledge = new Set<string>();
  for (const lt of letterTemplates) {
    const include =
      lt["shouldRepeat"] === true || lt["toRepeat"] === true || lt["valid"] === true;
    if (!include) continue;

    const kid = lt["knowledgeId"];
    if (typeof kid === "string" && kid.length > 0) letterTemplateKnowledge.add(kid);
  }

  const sawExercisesAsTutor = letterTemplateKnowledge.size;

  const sawExercisesAsLearnerSet = new Set<string>(lettersKnowledge);
  for (const kid of repetitionsKnowledge) sawExercisesAsLearnerSet.add(kid);
  const sawExercisesAsLearner = sawExercisesAsLearnerSet.size;

  const sawExercisesTotalSet = new Set<string>(sawExercisesAsLearnerSet);
  for (const kid of letterTemplateKnowledge) sawExercisesTotalSet.add(kid);
  const sawExercisesTotal = sawExercisesTotalSet.size;

  const distinctStudentsFromLessons = distinctCountFromField(lessons, ["student"]);
  const distinctRefereesFromLetters = distinctCountFromField(letters, ["referee"]);

  const ltValidAndMature = countWhere(
    letterTemplates,
    (r) => r["valid"] === true && r["mature"] === true
  );
  const ltToRepeat = countWhere(letterTemplates, (r) => r["toRepeat"] === true);

  // lessons_taught / warmUps:
  // A lesson is a warmUp if ANY of its letterTemplates has knowledgeId === EXAMPLE_SKILL_KNOWLEDGE_ID
  const warmUpLessons = new Set<string>();
  const allLessonsFromLetterTemplates = new Set<string>();

  for (const lt of letterTemplates) {
    const lesson = lt["lesson"];
    if (typeof lesson !== "string" || lesson.length === 0) continue;

    allLessonsFromLetterTemplates.add(lesson);

    if (lt["knowledgeId"] === EXAMPLE_SKILL_KNOWLEDGE_ID) {
      warmUpLessons.add(lesson);
    }
  }

  const lessonsTaughtReal = Array.from(allLessonsFromLetterTemplates).filter(
    (lesson) => !warmUpLessons.has(lesson)
  ).length;

  const warmUps = warmUpLessons.size;

  const hasThatKnowledgeId = letters.some(
    (r) => typeof r["knowledgeId"] === "string" && r["knowledgeId"] === EXAMPLE_SKILL_KNOWLEDGE_ID
  );
  const badgesReceivedAdjusted = Math.max(0, letters.length - (hasThatKnowledgeId ? 1 : 0));

  // --- Days used (unique calendar days across key activity timestamps) ---
  const daysAll = new Set<string>();

  const daysLearnRequests = new Set<string>();
  addDaysFromRows(daysLearnRequests, learnRequests, ["created"]);

  const daysReexams = new Set<string>();
  addDaysFromRows(daysReexams, reexams, ["created", "lastExamined"]);

  const daysCanceledInsurances = new Set<string>();
  addDaysFromRows(daysCanceledInsurances, canceledInsurances, ["created", "canceled"]);

  const daysCanceledLetters = new Set<string>();
  addDaysFromRows(daysCanceledLetters, canceledLetters, ["created"]);

  const daysInsurances = new Set<string>();
  addDaysFromRows(daysInsurances, insurances, ["created"]);

  const daysLessons = new Set<string>();
  addDaysFromRows(daysLessons, lessons, ["created"]);

  const daysLetters = new Set<string>();
  addDaysFromRows(daysLetters, letters, ["created"]);

  const daysLettersLastExamined = new Set<string>();
  addDaysFromRows(daysLettersLastExamined, letters, ["lastExamined"]);

  const daysRepetitionsLastExamined = new Set<string>();
  addDaysFromRows(daysRepetitionsLastExamined, repetitions, ["lastExamined"]);

  const daysLetterTemplatesLastExamined = new Set<string>();
  addDaysFromRows(daysLetterTemplatesLastExamined, letterTemplates, ["lastExamined"]);

  // synthetic timestamps: one per warm-up letter, 4 min before created
  const syntheticLTFromWarmupLetters = buildSyntheticLetterTemplateTimestampsFromLetters(letters);
  addDaysFromRows(daysLetterTemplatesLastExamined, syntheticLTFromWarmupLetters, ["lastExamined"]);

  const daysUsageRights = new Set<string>();
  addDaysFromRows(daysUsageRights, usageRights, ["created"]);

  for (const s of [
    daysCanceledInsurances,
    daysCanceledLetters,
    daysInsurances,
    daysLessons,
    daysLetters,
    daysLetterTemplatesLastExamined,
    daysRepetitionsLastExamined,
    daysLettersLastExamined,
    daysReexams,
    daysUsageRights,
    daysLearnRequests,
  ]) {
    for (const d of s) daysAll.add(d);
  }
  const daysUsedTotal = daysAll.size;

  // --- Minutes worked per day (timestamps -> session split) ---
  const tsLearnRequests: DayTimestamps = new Map();
  addDayTimestampsFromRows(tsLearnRequests, learnRequests, ["created"]);

  const tsReexams: DayTimestamps = new Map();
  addDayTimestampsFromRows(tsReexams, reexams, ["created", "lastExamined"]);

  const tsRepetitionsLastExamined: DayTimestamps = new Map();
  addDayTimestampsFromRows(tsRepetitionsLastExamined, repetitions, ["lastExamined"]);

  const tsCanceledInsurances: DayTimestamps = new Map();
  addDayTimestampsFromRows(tsCanceledInsurances, canceledInsurances, ["created", "canceled"]);

  const tsCanceledLetters: DayTimestamps = new Map();
  addDayTimestampsFromRows(tsCanceledLetters, canceledLetters, ["created"]);

  const tsInsurances: DayTimestamps = new Map();
  addDayTimestampsFromRows(tsInsurances, insurances, ["created"]);

  const tsLessons: DayTimestamps = new Map();
  addDayTimestampsFromRows(tsLessons, lessons, ["created"]);

  const tsLetterTemplatesLastExamined: DayTimestamps = new Map();
  addDayTimestampsFromRows(tsLetterTemplatesLastExamined, letterTemplates, ["lastExamined"]);
  addDayTimestampsFromRows(tsLetterTemplatesLastExamined, syntheticLTFromWarmupLetters, [
    "lastExamined",
  ]);

  const tsLettersCreated: DayTimestamps = new Map();
  addDayTimestampsFromRows(tsLettersCreated, letters, ["created"]);

  const tsLettersLastExamined: DayTimestamps = new Map();
  addDayTimestampsFromRows(tsLettersLastExamined, letters, ["lastExamined"]);

  const tsUsageRights: DayTimestamps = new Map();
  addDayTimestampsFromRows(tsUsageRights, usageRights, ["created"]);

  const tsAll: DayTimestamps = new Map();
  mergeDayTimestamps(tsAll, tsCanceledInsurances);
  mergeDayTimestamps(tsAll, tsCanceledLetters);
  mergeDayTimestamps(tsAll, tsInsurances);
  mergeDayTimestamps(tsAll, tsLessons);
  mergeDayTimestamps(tsAll, tsLettersCreated);
  mergeDayTimestamps(tsAll, tsLetterTemplatesLastExamined);
  mergeDayTimestamps(tsAll, tsRepetitionsLastExamined);
  mergeDayTimestamps(tsAll, tsLettersLastExamined);
  mergeDayTimestamps(tsAll, tsReexams);
  mergeDayTimestamps(tsAll, tsUsageRights);
  mergeDayTimestamps(tsAll, tsLearnRequests);

  const minutesUsedTotal = totalMinutesWorked(tsAll);

  // --- base results ---
  const results: Record<string, number> = {
    lessons_received: agreements.length,
    canceled_insurances: canceledInsurances.length,
    skills_forgotten: canceledLetters.length,
    lessons_taught: lessonsTaughtReal,
    training_count: warmUps,
    tutees: distinctStudentsFromLessons,
    skills: badgesReceivedAdjusted,
    saw_exercises_as_learner: sawExercisesAsLearner,
    saw_exercises_as_tutor: sawExercisesAsTutor,
    saw_exercises_total: sawExercisesTotal,
    tutors: distinctRefereesFromLetters,
    badges_issued: ltValidAndMature,
    marked_for_repeat: ltToRepeat,
    persons_connected: pseudonyms.length,
    reexams: reexams.length,
    badges_shown_for_bonus: usageRights.length,
    should_repeat: repetitions.length,
    days_used_total: daysUsedTotal,
    minutes_used_total: minutesUsedTotal,
  };

  // --- NEW: per-knowledge columns based on provided list ---
  // s_{id}: letters contain id
  // l_{id}: sawExercisesAsLearnerSet contain id
  // t_{id}: sawExercisesAsTutor contain id
  // a_{id}: sawExercisesTotalSet contain id
  const dynamicKeys: string[] = [];
  for (const id of knowledgeIds) {
    const sKey = `s_${id}`;
    const lKey = `l_${id}`;
    const tKey = `t_${id}`;
    const aKey = `a_${id}`;

    results[sKey] = lettersKnowledge.has(id) ? 1 : 0;
    results[lKey] = sawExercisesAsLearnerSet.has(id) ? 1 : 0;
    results[tKey] = letterTemplateKnowledge.has(id) ? 1 : 0;
    results[aKey] = sawExercisesTotalSet.has(id) ? 1 : 0;

    dynamicKeys.push(sKey, lKey, tKey, aKey);
  }

  // console output (base results only)
  printResults(results);

  // CSV with stable column order: base keys first, then dynamic keys
  const baseKeys = [
    "lessons_received",
    "canceled_insurances",
    "skills_forgotten",
    "lessons_taught",
    "training_count",
    "tutees",
    "skills",
    "saw_exercises_as_learner",
    "saw_exercises_as_tutor",
    "saw_exercises_total",
    "tutors",
    "badges_issued",
    "marked_for_repeat",
    "persons_connected",
    "reexams",
    "badges_shown_for_bonus",
    "should_repeat",
    "days_used_total",
    "minutes_used_total",
  ];

  const csv = objectToCsvOneRowOrdered(results, [...baseKeys, ...dynamicKeys]);
  await writeCsvFile(outCsvPath, csv);
  console.log(`Wrote CSV: ${outCsvPath}`);

  printMinutesWorked("", tsAll);
}

main().catch((e: unknown) => {
  const msg = e instanceof Error ? (e.stack ?? e.message) : String(e);
  console.error("Error:", msg);
  process.exit(1);
});