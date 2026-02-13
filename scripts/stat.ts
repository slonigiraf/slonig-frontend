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

function addDaysFromRows(
  out: Set<string>,
  rows: AnyRow[],
  fields: string[]
): void {
  for (const r of rows) {
    for (const f of fields) {
      const ds = toDayString(r?.[f]);
      if (ds) out.add(ds);
    }
  }
}

type DayMinMax = Map<string, { minMs: number; maxMs: number }>;

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

function addDayMinMaxFromRows(out: DayMinMax, rows: AnyRow[], fields: string[]): void {
  for (const r of rows) {
    for (const f of fields) {
      const ms = toMs(r?.[f]);
      if (ms == null) continue;

      const day = toDayString(ms);
      if (!day) continue;

      const prev = out.get(day);
      if (!prev) {
        out.set(day, { minMs: ms, maxMs: ms });
      } else {
        if (ms < prev.minMs) prev.minMs = ms;
        if (ms > prev.maxMs) prev.maxMs = ms;
      }
    }
  }
}

function mergeDayMinMax(into: DayMinMax, from: DayMinMax): void {
  for (const [day, mm] of from) {
    const prev = into.get(day);
    if (!prev) {
      into.set(day, { minMs: mm.minMs, maxMs: mm.maxMs });
    } else {
      if (mm.minMs < prev.minMs) prev.minMs = mm.minMs;
      if (mm.maxMs > prev.maxMs) prev.maxMs = mm.maxMs;
    }
  }
}

function toMinutesWorked(mm: { minMs: number; maxMs: number }): number {
  const diff = mm.maxMs - mm.minMs;
  if (!Number.isFinite(diff) || diff <= 0) return 0;
  return Math.round(diff / 60000); // rounded minutes
}

function printMinutesWorked(title: string, mm: DayMinMax): void {
  const rows = Array.from(mm.entries()).sort(([a], [b]) => a.localeCompare(b));
  console.log(`\nminutes_worked_per_day: ${title}`);
  if (rows.length === 0) {
    console.log("(no timestamps)");
    return;
  }
  for (const [day, v] of rows) {
    console.log(`${day} : ${toMinutesWorked(v)}`);
  }
}


type DayCounts = Map<string, number>;

function addDayCountsFromRows(
  out: DayCounts,
  rows: AnyRow[],
  fields: string[]
): void {
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

function printDayCounts(title: string, counts: DayCounts): void {
  const rows = Array.from(counts.entries()).sort(([a], [b]) => a.localeCompare(b));
  console.log(`\n${title}`);
  if (rows.length === 0) {
    console.log("(no timestamps)");
    return;
  }
  for (const [day, cnt] of rows) {
    console.log(`${day} : ${cnt}`);
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
        // Buffer is a Uint8Array at runtime, but TS typing can be picky in newer libs
        chunks.push(new Uint8Array(c));
      })
      .on("error", reject)
      .on("end", () => {
        const buf = Buffer.concat(chunks);
        resolve(buf.toString("utf8"));
      });
  });
}

function buildTableMap(parsed: DexieExport): Map<string, AnyRow[]> {
  const tableEntries = parsed?.db?.data?.data;
  if (!Array.isArray(tableEntries)) {
    throw new Error(
      "Unexpected JSON structure. Expected parsed.db.data.data to be an array."
    );
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

function printResults(results: Record<string, number>): void {
  const entries = Object.entries(results);
  const maxKey = Math.max(...entries.map(([k]) => k.length));
  for (const [k, v] of entries) {
    console.log(`${k.padEnd(maxKey)} : ${v}`);
  }
}

async function main(): Promise<void> {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error(
      "Usage: node --loader ts-node/esm stats-dexie-export.ts <path/to/export.json.gz|export.json>"
    );
    process.exit(2);
  }

  const text = await readTextMaybeGz(filePath);
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
  const reimbursements = getRows(tables, "reimbursements");
  const usageRights = getRows(tables, "usageRights");
  const repetitions = getRows(tables, "repetitions");
  const learnRequests = getRows(tables, "learnRequests");

  // Heuristic: adjust these field names if your schema is strict
  const distinctStudentsFromLessons = distinctCountFromField(lessons, [
    "student",
  ]);

  const distinctRefereesFromLetters = distinctCountFromField(letters, [
    "referee",
  ]);

  const ltValidAndMature = countWhere(
    letterTemplates,
    (r) => r["valid"] === true && r["mature"] === true
  );

  const ltToRepeat = countWhere(letterTemplates, (r) => r["toRepeat"] === true);

  // lessons_taught_real: number of distinct lessons that have > 2 letterTemplates
  const ltByLesson = new Map<string, number>();

  for (const lt of letterTemplates) {
    const lesson = lt["lesson"];
    if (typeof lesson !== "string" || lesson.length === 0) continue;
    ltByLesson.set(lesson, (ltByLesson.get(lesson) ?? 0) + 1);
  }

  const lessonsTaughtReal = Array.from(ltByLesson.values()).filter((n) => n > 2).length;
  const warmUps = Math.max(0, lessons.length - lessonsTaughtReal);


  const hasThatKnowledgeId = letters.some(
    (r) => typeof r["knowledgeId"] === "string" && r["knowledgeId"] === EXAMPLE_SKILL_KNOWLEDGE_ID
  );

  const badgesReceivedAdjusted = Math.max(0, letters.length - (hasThatKnowledgeId ? 1 : 0));

  // --- Days used (unique calendar days across key activity timestamps) ---
  const daysAll = new Set<string>();

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

  const daysRepetitionsLastExamined = new Set<string>();
  addDaysFromRows(daysRepetitionsLastExamined, repetitions, ["lastExamined"]);

  const daysLetterTemplatesLastExamined = new Set<string>();
  addDaysFromRows(daysLetterTemplatesLastExamined, letterTemplates, ["lastExamined"]);

  // Union
  for (const s of [
    daysCanceledInsurances,
    daysCanceledLetters,
    daysInsurances,
    daysLessons,
    daysLetters,
    daysLetterTemplatesLastExamined,
    daysLetterTemplatesLastExamined,
  ]) {
    for (const d of s) daysAll.add(d);
  }

  const daysUsedTotal = daysAll.size;

  // --- Per-day timestamp counts (histograms) ---
  const countsRepetitionsLastExamined = new Map<string, number>();
  addDayCountsFromRows(countsRepetitionsLastExamined, repetitions, ["lastExamined"]);

  const countsCanceledInsurances = new Map<string, number>();
  addDayCountsFromRows(countsCanceledInsurances, canceledInsurances, ["created", "canceled"]);

  const countsCanceledLetters = new Map<string, number>();
  addDayCountsFromRows(countsCanceledLetters, canceledLetters, ["created"]);

  const countsInsurances = new Map<string, number>();
  addDayCountsFromRows(countsInsurances, insurances, ["created"]);

  const countsLessons = new Map<string, number>();
  addDayCountsFromRows(countsLessons, lessons, ["created"]);

  const countsLetterTemplatesLastExamined = new Map<string, number>();
  addDayCountsFromRows(countsLetterTemplatesLastExamined, letterTemplates, ["lastExamined"]);

  const countsLetters = new Map<string, number>();
  addDayCountsFromRows(countsLetters, letters, ["created"]);

  const countsAll = new Map<string, number>();
  mergeDayCounts(countsAll, countsCanceledInsurances);
  mergeDayCounts(countsAll, countsCanceledLetters);
  mergeDayCounts(countsAll, countsInsurances);
  mergeDayCounts(countsAll, countsLessons);
  mergeDayCounts(countsAll, countsLetters);
  mergeDayCounts(countsAll, countsLetterTemplatesLastExamined);
  mergeDayCounts(countsAll, countsRepetitionsLastExamined);

  // --- Minutes worked per day (min->max span) ---
  const mmRepetitionsLastExamined: DayMinMax = new Map();
  addDayMinMaxFromRows(mmRepetitionsLastExamined, repetitions, ["lastExamined"]);

  const mmCanceledInsurances: DayMinMax = new Map();
  addDayMinMaxFromRows(mmCanceledInsurances, canceledInsurances, ["created", "canceled"]);

  const mmCanceledLetters: DayMinMax = new Map();
  addDayMinMaxFromRows(mmCanceledLetters, canceledLetters, ["created"]);

  const mmInsurances: DayMinMax = new Map();
  addDayMinMaxFromRows(mmInsurances, insurances, ["created"]);

  const mmLessons: DayMinMax = new Map();
  addDayMinMaxFromRows(mmLessons, lessons, ["created"]);

  const mmLetterTemplatesLastExamined: DayMinMax = new Map();
  addDayMinMaxFromRows(mmLetterTemplatesLastExamined, letterTemplates, ["lastExamined"]);

  const mmLetters: DayMinMax = new Map();
  addDayMinMaxFromRows(mmLetters, letters, ["created"]);

  const mmAll: DayMinMax = new Map();
  mergeDayMinMax(mmAll, mmCanceledInsurances);
  mergeDayMinMax(mmAll, mmCanceledLetters);
  mergeDayMinMax(mmAll, mmInsurances);
  mergeDayMinMax(mmAll, mmLessons);
  mergeDayMinMax(mmAll, mmLetters);
  mergeDayMinMax(mmAll, mmLetterTemplatesLastExamined);
  mergeDayMinMax(mmAll, mmRepetitionsLastExamined);

  const results: Record<string, number> = {
    "lessons_received": agreements.length,
    "canceled_insurances": canceledInsurances.length,
    "skills_forgotten": canceledLetters.length,
    "lessons_taught": lessonsTaughtReal,
    "training_count": warmUps,
    "tutees": distinctStudentsFromLessons,
    "skills": badgesReceivedAdjusted,
    "tutors": distinctRefereesFromLetters,
    "badges_issued": ltValidAndMature,
    "marked_for_repeat": ltToRepeat,
    "persons_connected": pseudonyms.length,
    "reexams": reexams.length,
    "badges_lost": reimbursements.length,
    "badges_shown_for_bonus": usageRights.length,
    "should_repeat": repetitions.length,
    "learning_requests": learnRequests.length,
    "days_used_total": daysUsedTotal,
    "days_used_canceled_insurances": daysCanceledInsurances.size,
    "days_used_canceled_letters": daysCanceledLetters.size,
    "days_used_insurances": daysInsurances.size,
    "days_used_lessons": daysLessons.size,
    "days_used_letterTemplates_lastExamined": daysLetterTemplatesLastExamined.size,
    "days_used_letters": daysLetters.size,
    "days_used_repetitions_lastExamined": daysRepetitionsLastExamined.size,
  };

  printResults(results);

  // Histograms: count of timestamps per day (per group + total)
  printDayCounts("timestamps_per_day: ALL", countsAll);
  printDayCounts("timestamps_per_day: canceledInsurances (created+canceled)", countsCanceledInsurances);
  printDayCounts("timestamps_per_day: canceledLetters (created)", countsCanceledLetters);
  printDayCounts("timestamps_per_day: insurances (created)", countsInsurances);
  printDayCounts("timestamps_per_day: lessons (created)", countsLessons);
  printDayCounts("timestamps_per_day: letterTemplates (lastExamined)", countsLetterTemplatesLastExamined);
  printDayCounts("timestamps_per_day: letters (created)", countsLetters);
  printDayCounts("timestamps_per_day: repetitions (lastExamined)", countsRepetitionsLastExamined);

  printMinutesWorked("ALL", mmAll);
  printMinutesWorked("canceledInsurances (created+canceled)", mmCanceledInsurances);
  printMinutesWorked("canceledLetters (created)", mmCanceledLetters);
  printMinutesWorked("insurances (created)", mmInsurances);
  printMinutesWorked("lessons (created)", mmLessons);
  printMinutesWorked("letterTemplates (lastExamined)", mmLetterTemplatesLastExamined);
  printMinutesWorked("letters (created)", mmLetters);
  printMinutesWorked("repetitions (lastExamined)", mmRepetitionsLastExamined);
}

main().catch((e: unknown) => {
  const msg = e instanceof Error ? (e.stack ?? e.message) : String(e);
  console.error("Error:", msg);
  process.exit(1);
});