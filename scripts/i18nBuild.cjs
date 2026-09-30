#!/usr/bin/env node
// @ts-check
/**
 * Extract translation keys (t('key')) from all source files
 * and maintain ONE file per locale: translation.json.
 *
 * Output:
 *  - packages/apps/public/locales/en/translation.json  (keys -> "")
 *  - packages/apps/public/locales/<lang>/translation.json (merged + cleaned; missing keys auto-translated)
 *
 * Env:
 *   OPENAI_API_KEY      (required to translate missing keys)
 *   OPENAI_MODEL        (optional, default: "gpt-5.2")
 *   OPENAI_BATCH        (optional, default: 50) keys per request
 *   OPENAI_FILL_EMPTY   (optional "1" to translate keys that exist but have empty string values)
 */

require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "../");
const localesDir = path.join(rootDir, "packages", "apps", "public", "locales");
const enDir = path.join(localesDir, "en");
const enTranslationPath = path.join(enDir, "translation.json");

const exts = [".js", ".jsx", ".ts", ".tsx"];
const regex = /(?<![A-Za-z0-9_\/])t\(\s*['"]([^'"]+)['"]/g;

const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5.2";
const OPENAI_BATCH = Math.max(1, Number(process.env.OPENAI_BATCH || 50));
const OPENAI_FILL_EMPTY = process.env.OPENAI_FILL_EMPTY === "1";

const APP_LOCALIZATION_CONTEXT = [
  `# Product context`,
  `Slonig is an open-source web platform for face-to-face peer tutoring in classrooms. It helps teachers organize students into pairs, provides learning materials and guided tutoring steps, and lets students teach and assess one another. Students normally use the interface while speaking to each other in person.`,
  ``,
  `# Roles`,
  `- tutor: a student who is currently teaching another student. A tutor is a peer, not the classroom teacher.`,
  `- student: the peer who is currently learning from the tutor; this role may also be called the tutee internally.`,
  `- teacher: the professional classroom educator who organizes or supervises the activity. Never translate "teacher" as if it meant the peer tutor.`,
  `- partner or classmate: another student paired with the user. Students may exchange tutor and student roles between lessons.`,
  `- parent or employer: an outside supporter who may inspect or assess a student's achievements.`,
  `- AI tutor: software that performs the tutor role. Preserve the "AI" distinction.`,
  ``,
  `# Domain terminology`,
  `- skill: a specific competency that can be learned, practiced, checked, and remembered.`,
  `- module or course: an organized group of skills. Do not replace these terms with "lesson" or "subject".`,
  `- lesson: one tutoring session between a tutor and a student.`,
  `- exercise: a task used to teach, practice, or check a skill.`,
  `- badge: a record that a student demonstrated a skill. A tutor can issue it, and it may later be reexamined or revoked.`,
  `- reexamination: a later check that the student still remembers a skill.`,
  `- stake, warranty, insurance, reward, and penalty are distinct mechanisms in the app's learning economy; do not interchange them.`,
  `- Slonig is the product name and Slon is its token name. Never translate or transliterate either name.`,
  ``,
  `# Terminology consistency`,
  `Treat all strings as parts of one interface. Use one stable target-language equivalent for each recurring English domain term. Do not alternate synonyms merely for stylistic variety. Preserve the distinctions above, and reuse any existing terminology supplied with the request. Grammatical inflection is allowed when required by the target language, but changing to a synonym is not.`,
].join("\n");

const TERMINOLOGY_SOURCE_KEYS = [
  "student",
  "Teacher",
  "Skill",
  "Module",
  "Course",
  "Exercise",
  "Badges",
  "Learn",
  "Teach",
  "Slon",
  "Slonig",
];

/**
 * Recursively collect all JS/TS/JSX/TSX file paths.
 * @param {string} dir
 * @returns {string[]}
 */
function walk(dir) {
  /** @type {string[]} */
  let results = [];
  const list = fs.readdirSync(dir, { withFileTypes: true });

  for (const file of list) {
    const filePath = path.join(dir, file.name);
    if (file.isDirectory()) {
      if (file.name === "node_modules" || file.name.startsWith(".")) continue;
      // Avoid scanning generated locale files to reduce noise (optional)
      if (filePath.includes(`${path.sep}public${path.sep}locales${path.sep}`)) continue;
      results = results.concat(walk(filePath));
    } else if (exts.some((ext) => file.name.endsWith(ext))) {
      results.push(filePath);
    }
  }

  return results;
}

/**
 * Ensure directory exists.
 * @param {string} dir
 */
function ensureDirSync(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/**
 * Check if key consists only of punctuation/symbols.
 * @param {string} key
 * @returns {boolean}
 */
function isOnlyPunctuation(key) {
  return /^[\p{P}\p{S}]+$/u.test(key);
}

/**
 * Safe JSON read.
 * @param {string} filePath
 * @returns {Record<string,string>}
 */
function readJsonObject(filePath) {
  try {
    if (!fs.existsSync(filePath)) return {};
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
  } catch {
    // ignore
  }
  return {};
}

/**
 * Write JSON with sorted keys.
 * @param {string} filePath
 * @param {Record<string,string>} obj
 */
function writeJsonSorted(filePath, obj) {
  const sorted = Object.keys(obj)
    .sort()
    .reduce((acc, k) => {
      acc[k] = obj[k];
      return acc;
    }, /** @type {Record<string,string>} */ ({}));

  fs.writeFileSync(filePath, JSON.stringify(sorted, null, 2), "utf8");
}

/**
 * Split array into chunks.
 * @template T
 * @param {T[]} arr
 * @param {number} size
 * @returns {T[][]}
 */
function chunk(arr, size) {
  /** @type {T[][]} */
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Translate a batch of UI strings into a target language using OpenAI.
 * Returns mapping { originalKey: translatedText }.
 *
 * @param {import("openai").default} client
 * @param {string} lang
 * @param {string[]} keys
 * @param {Record<string,string>} terminology
 * @returns {Promise<Record<string,string>>}
 */
async function translateBatch(client, lang, keys, terminology) {
  const sourceStrings = keys.map((text, id) => ({ id, text }));

  const instructions = [
    `You are a professional software localizer.`,
    `Translate UI strings into language: "${lang}".`,
    APP_LOCALIZATION_CONTEXT,
    `Rules:`,
    `- Always use the informal second-person singular form (T-form, e.g. “ты”, “tu”, “tú”, “du”) in the target language whenever there is a choice between formal and informal address.`,
    `- Do NOT use any formal or polite forms (V-form, e.g. “вы”, “vous”, “Sie”).`,
    `- Return one translation for every supplied numeric id.`,
    `- Copy each id exactly and translate only its text.`,
    `- Preserve placeholders exactly: {{var}}, {var}, %s, %d, <0>...</0>, HTML tags, markdown, emojis.`,
    `- Do not add extra commentary.`,
    `- In the case of the Serbian language, use the Latin script.`,
  ].join("\n");

  /** @type {import("openai/resources/chat/completions").ChatCompletionMessageParam[]} */
  const messages = [
    { role: "system", content: instructions },
    {
      role: "user",
      content:
        `Existing terminology for this locale (source string -> approved translation):\n` +
        `${JSON.stringify(terminology)}\n\n` +
        `Translate every UI string in this JSON array:\n\n${JSON.stringify(sourceStrings)}\n\n` +
        `Return an object containing a "translations" array of objects with "id" and "translation" fields.`,
    },
  ];

  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const resp = await client.chat.completions.create({
        model: OPENAI_MODEL,
        messages,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "ui_translations",
            strict: true,
            schema: {
              type: "object",
              properties: {
                translations: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      id: { type: "integer" },
                      translation: { type: "string" },
                    },
                    required: ["id", "translation"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["translations"],
              additionalProperties: false,
            },
          },
        },
      });

      const choice = resp.choices?.[0];
      if (!choice) throw new Error("Model returned no completion choice.");
      if (choice.finish_reason !== "stop") {
        throw new Error(`Model stopped with finish_reason=${choice.finish_reason}.`);
      }
      if (choice.message.refusal) throw new Error(`Model refused the translation request: ${choice.message.refusal}`);

      const text = choice.message.content?.trim() || "";
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed.translations)) throw new Error("Model response has no translations array.");

      /** @type {Map<number,string>} */
      const translationsById = new Map();
      for (const item of parsed.translations) {
        if (!Number.isInteger(item.id) || item.id < 0 || item.id >= keys.length) {
          throw new Error(`Model returned an invalid translation id: ${String(item.id)}.`);
        }
        if (translationsById.has(item.id)) throw new Error(`Model returned duplicate translation id ${item.id}.`);
        if (typeof item.translation !== "string" || item.translation.trim().length === 0) {
          throw new Error(`Model returned an empty translation for id ${item.id}.`);
        }
        translationsById.set(item.id, item.translation);
      }

      if (translationsById.size !== keys.length) {
        const missingIds = keys.map((_, id) => id).filter((id) => !translationsById.has(id));
        throw new Error(`Model omitted translation ids: ${missingIds.join(", ")}.`);
      }

      /** @type {Record<string,string>} */
      const out = {};
      for (let id = 0; id < keys.length; id++) {
        // The completeness check above guarantees this value exists.
        out[keys[id]] = /** @type {string} */ (translationsById.get(id));
      }
      return out;
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 350 * attempt));
    }
  }

  throw lastErr || new Error("Translation failed");
}

async function main() {
  const files = walk(rootDir);
  console.log(`📁 Found ${files.length} source files`);

  /** @type {Set<string>} */
  const allKeys = new Set();

  for (const file of files) {
    const content = fs.readFileSync(file, "utf8");
    let match;
    while ((match = regex.exec(content)) !== null) {
      const key = match[1].trim();
      if (!key || isOnlyPunctuation(key)) continue;
      allKeys.add(key);
    }
  }

  // --- Write en/translation.json with empty values ---
  ensureDirSync(enDir);

  const enObj = Array.from(allKeys)
    .sort()
    .reduce((acc, k) => {
      acc[k] = "";
      return acc;
    }, /** @type {Record<string,string>} */ ({}));

  writeJsonSorted(enTranslationPath, enObj);
  console.log(`✅ en/translation.json: wrote ${Object.keys(enObj).length} keys`);

  // --- Prepare locales list ---
  ensureDirSync(localesDir);
  const langs = fs
    .readdirSync(localesDir)
    .filter((lang) => fs.statSync(path.join(localesDir, lang)).isDirectory() && lang !== "en");

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.log("⚠️  OPENAI_API_KEY not set. Skipping auto-translation for other locales.");
    // Still do cleanup to keep only en keys
    for (const lang of langs) {
      const targetPath = path.join(localesDir, lang, "translation.json");
      ensureDirSync(path.dirname(targetPath));
      const data = readJsonObject(targetPath);
      const cleaned = Object.keys(data)
        .filter((k) => k in enObj)
        .reduce((acc, k) => {
          acc[k] = data[k];
          return acc;
        }, /** @type {Record<string,string>} */ ({}));
      writeJsonSorted(targetPath, cleaned);
      console.log(`🧹 Cleaned ${lang}/translation.json: kept ${Object.keys(cleaned).length} keys`);
    }
    return;
  }

  const { default: OpenAI } = await import("openai");
  const client = new OpenAI({ apiKey });

  // --- For each lang: clean + add missing keys + translate ---
  for (const lang of langs) {
    const targetDir = path.join(localesDir, lang);
    const targetPath = path.join(targetDir, "translation.json");
    ensureDirSync(targetDir);

    const existing = readJsonObject(targetPath);

    const terminology = TERMINOLOGY_SOURCE_KEYS.reduce((acc, source) => {
      const translation = existing[source];
      if (typeof translation === "string" && translation.trim()) acc[source] = translation;
      return acc;
    }, /** @type {Record<string,string>} */ ({}));

    // 1) remove keys not in en
    /** @type {Record<string,string>} */
    const cleaned = {};
    for (const k of Object.keys(existing)) {
      if (k in enObj) cleaned[k] = existing[k];
    }

    // 2) compute keys to translate
    const missingKeys = Object.keys(enObj).filter((k) => !(k in cleaned));
    const emptyKeys = OPENAI_FILL_EMPTY
      ? Object.keys(enObj).filter((k) => (k in cleaned) && (cleaned[k] === "" || cleaned[k] == null))
      : [];

    const toTranslate = [...new Set([...missingKeys, ...emptyKeys])];

    console.log(
      `\n🌍 ${lang}: kept ${Object.keys(cleaned).length}, missing ${missingKeys.length}` +
        (OPENAI_FILL_EMPTY ? `, empty ${emptyKeys.length}` : "")
    );

    // If nothing to translate, just write cleaned+sorted
    if (toTranslate.length === 0) {
      writeJsonSorted(targetPath, cleaned);
      console.log(`✅ ${lang}/translation.json updated (no new translations needed)`);
      continue;
    }

    console.log(`📝 ${lang}: translating ${toTranslate.length} keys (batch=${OPENAI_BATCH})`);

    for (const batchKeys of chunk(toTranslate, OPENAI_BATCH)) {
      const translated = await translateBatch(client, lang, batchKeys, terminology);

      for (const k of batchKeys) {
        cleaned[k] = translated[k];
      }

      // write incrementally
      writeJsonSorted(targetPath, cleaned);
    }

    console.log(`✅ ${lang}/translation.json: now ${Object.keys(cleaned).length} keys`);
  }

  console.log("\n🎉 Done!");
}

main().catch((err) => {
  console.error("💥 Fatal error:", err);
  process.exitCode = 1;
});
