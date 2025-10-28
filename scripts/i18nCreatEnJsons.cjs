#!/usr/bin/env node
// @ts-check
/**
 * Extract translation keys (t('key')) from all source files
 * and write them into per-package locale JSON files based on package.json name.
 */

const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "../");
const localesBase = path.join(rootDir, "packages", "apps", "public", "locales", "en");

const exts = [".js", ".jsx", ".ts", ".tsx"];
const regex = /t\(\s*['"]([^'"]+)['"]/g; // matches t('key') or t("key")

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
 * Main extraction logic.
 */
function extractTranslations() {
  const files = walk(rootDir);
  console.log(`📁 Found ${files.length} source files`);

  /** @type {Record<string, Set<string>>} */
  const packageKeys = {};

  for (const file of files) {
    const content = fs.readFileSync(file, "utf8");
    let match;
    while ((match = regex.exec(content)) !== null) {
      const key = match[1].trim();
      if (!key) continue;

      // find nearest package.json
      const pkgPath = findNearestPackageJson(file);
      let outName = "root.json";
      if (pkgPath) {
        try {
          const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
          if (pkg.name && typeof pkg.name === "string") {
            // remove @scope/
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

  for (const [outFileName, keys] of Object.entries(packageKeys)) {
    const outFile = path.join(localesBase, outFileName);

    /** @type {Record<string, string>} */
    let existing = /** @type {Record<string, string>} */ ({});
    if (fs.existsSync(outFile)) {
      try {
        existing = JSON.parse(fs.readFileSync(outFile, "utf8"));
      } catch {
        existing = /** @type {Record<string, string>} */ ({});
      }
    }

    for (const key of keys) {
      if (!(key in existing)) existing[key] = key;
    }

    // sort alphabetically
    const sorted = Object.keys(existing)
      .sort()
      .reduce((acc, k) => {
        acc[k] = existing[k];
        return acc;
      }, /** @type {Record<string, string>} */ ({}));

    fs.writeFileSync(outFile, JSON.stringify(sorted, null, 2) + "\n", "utf8");
    console.log(`✅ ${outFileName}: wrote ${keys.size} keys to ${outFile}`);
  }

  console.log("✨ Extraction complete!");
}

extractTranslations();