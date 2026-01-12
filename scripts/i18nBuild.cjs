#!/usr/bin/env node
// @ts-check
/**
 * Extract translation keys (t('key')) from all source files
 * and write them into per-package locale JSON files based on package.json name.
 * Also writes a combined translation.json with all keys and empty values.
 */

const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "../");
const localesBase = path.join(rootDir, "packages", "apps", "public", "locales", "en");
const translationJsonPath = path.join(localesBase, "translation.json");

const exts = [".js", ".jsx", ".ts", ".tsx"];
const regex = /(?<![A-Za-z0-9_\/])t\(\s*['"]([^'"]+)['"]/g;

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
      results = results.concat(walk(filePath));
    } else if (exts.some(ext => file.name.endsWith(ext))) {
      results.push(filePath);
    }
  }
  return results;
}

/**
 * Find the nearest package.json upward from a given file.
 * @param {string} filePath
 * @returns {string|null}
 */
function findNearestPackageJson(filePath) {
  let dir = path.dirname(filePath);
  while (dir.startsWith(rootDir)) {
    const pkgJsonPath = path.join(dir, "package.json");
    if (fs.existsSync(pkgJsonPath)) return pkgJsonPath;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/**
 * Ensure directory exists.
 * @param {string} dir
 */
function ensureDirSync(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/**
 * Check if key consists only of punctuation.
 * @param {string} key
 * @returns {boolean}
 */
function isOnlyPunctuation(key) {
  return /^[\p{P}\p{S}]+$/u.test(key);
}

/**
 * Main extraction logic.
 */
function extractTranslations() {
  const files = walk(rootDir);
  console.log(`📁 Found ${files.length} source files`);

  /** @type {Record<string, Set<string>>} */
  const packageKeys = {};
  const allKeys = new Set();

  for (const file of files) {
    const content = fs.readFileSync(file, "utf8");
    let match;
    while ((match = regex.exec(content)) !== null) {
      const key = match[1].trim();
      if (!key || isOnlyPunctuation(key)) continue;

      allKeys.add(key);

      const pkgPath = findNearestPackageJson(file);
      let outName = "root.json";
      if (pkgPath) {
        try {
          const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
          if (pkg.name && typeof pkg.name === "string") {
            const clean = pkg.name.replace(/^@[^/]+\//, "");
            outName = `${clean}.json`;
          }
        } catch {
          // ignore invalid package.json
        }
      }

      if (!packageKeys[outName]) packageKeys[outName] = new Set();
      packageKeys[outName].add(key);
    }
  }

  ensureDirSync(localesBase);

  // --- Write per-package files (overwrite mode) ---
  for (const [outFileName, keys] of Object.entries(packageKeys)) {
    const outFile = path.join(localesBase, outFileName);
    const sorted = Array.from(keys).sort().reduce((acc, k) => {
      acc[k] = k;
      return acc;
    }, /** @type {Record<string, string>} */({}));

    fs.writeFileSync(outFile, JSON.stringify(sorted, null, 2), "utf8");
    console.log(`✅ ${outFileName}: wrote ${keys.size} keys`);
  }

  // --- Write combined translation.json (empty values) ---
  const allSorted = Array.from(allKeys).sort().reduce((acc, k) => {
    acc[k] = "";
    return acc;
  }, /** @type {Record<string, string>} */({}));

  fs.writeFileSync(translationJsonPath, JSON.stringify(allSorted, null, 2), "utf8");
  console.log(`🌐 translation.json: wrote ${allKeys.size} total keys`);

  console.log("✨ Extraction complete!");

  // --- Cleanup non-English locale files ---
  const localesDir = path.join(rootDir, "packages", "apps", "public", "locales");
  const allKeysEn = new Set(Object.keys(allSorted));

  const langs = fs.readdirSync(localesDir).filter(
    (lang) => fs.statSync(path.join(localesDir, lang)).isDirectory() && lang !== "en"
  );

  for (const lang of langs) {
    const langDir = path.join(localesDir, lang);
    const files = fs.readdirSync(langDir).filter((f) => f.endsWith(".json"));

    for (const file of files) {
      const filePath = path.join(langDir, file);
      try {
        const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
        const cleaned = Object.keys(data)
          .filter((k) => allKeysEn.has(k))
          .sort()
          .reduce((acc, k) => {
            acc[k] = data[k];
            return acc;
          }, /** @type {Record<string, string>} */({}));

        fs.writeFileSync(filePath, JSON.stringify(cleaned, null, 2), "utf8");
        console.log(`🧹 Cleaned ${lang}/${file}: kept ${Object.keys(cleaned).length} keys`);
      } catch (err) {
        // @ts-ignore
        console.error(`❌ Failed to clean ${filePath}: ${err.message}`);
      }
    }
  }

  console.log("🧽 Non-English locales cleaned up!");

}

extractTranslations();