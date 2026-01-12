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
 * @returns {Promise<Record<string,string>>}
 */
async function translateBatch(client, lang, keys) {
  const lines = keys.map((k, i) => `${i + 1}. ${k}`).join("\n");

  const instructions = [
    `You are a professional software localizer.`,
    `Translate UI strings into language: "${lang}".`,
    `Rules:`,
    `- Return ONLY a valid JSON object mapping the ORIGINAL STRING to its translation.`,
    `- Preserve placeholders exactly: {{var}}, {var}, %s, %d, <0>...</0>, HTML tags, markdown, emojis.`,
    `- Do not add extra commentary.`,
  ].join("\n");

  /** @type {import("openai/resources/chat/completions").ChatCompletionMessageParam[]} */
  const messages = [
    { role: "system", content: instructions },
    {
      role: "user",
      content:
        `Translate the following UI strings (each line is one string):\n\n${lines}\n\n` +
        `Return JSON like {"Hello":"Bonjour", ...} using the original strings as keys.`,
    },
  ];

  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const resp = await client.chat.completions.create({
        model: OPENAI_MODEL,
        messages,
      });

      const text = resp.choices?.[0]?.message?.content?.trim() || "";
      const jsonStart = text.indexOf("{");
      const jsonEnd = text.lastIndexOf("}");
      if (jsonStart === -1 || jsonEnd === -1) throw new Error("No JSON object found in model output.");

      const parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1));

      /** @type {Record<string,string>} */
      const out = {};
      for (const k of keys) {
        const v = parsed[k];
        if (typeof v === "string" && v.length) out[k] = v;
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
      /** @type {Record<string,string>} */
      let translated = {};
      try {
        translated = await translateBatch(client, lang, batchKeys);
      } catch (e) {
        // @ts-ignore
        console.error(`❌ ${lang}: batch translation failed (${batchKeys.length} keys): ${e.message}`);
        // Still ensure missing keys exist (empty fallback)
        for (const k of batchKeys) if (!(k in cleaned)) cleaned[k] = "";
        continue;
      }

      for (const k of batchKeys) {
        if (translated[k]) cleaned[k] = translated[k];
        else if (!(k in cleaned)) cleaned[k] = "";
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