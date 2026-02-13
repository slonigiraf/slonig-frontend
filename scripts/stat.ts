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
  };

  printResults(results);
}

main().catch((e: unknown) => {
  const msg = e instanceof Error ? (e.stack ?? e.message) : String(e);
  console.error("Error:", msg);
  process.exit(1);
});