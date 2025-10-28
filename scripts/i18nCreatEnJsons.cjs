#!/usr/bin/env node
// @ts-check
/**
 * Extract translation keys from source files.
 * Works with JS/TS/JSX/TSX files.
 */

const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "../");
const localesBase = path.join(rootDir, "packages", "apps", "public", "locales", "en");

const exts = [".js", ".jsx", ".ts", ".tsx"];
const regex = /t\(\s*['"]([^'"]+)['"]/g; // matches t('key') or t("key")

/**
 * Recursively collect all source files.
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
 * Ensure a directory exists.
 * @param {string} dir
 */
function ensureDirSync(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/**
 * Main extraction function.
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

      // Determine package name based on path: ../packages/<name>/
      const parts = file.split(path.sep);
      const pkgIndex = parts.indexOf("packages");
      const pkgName = pkgIndex !== -1 && parts[pkgIndex + 1] ? parts[pkgIndex + 1] : "root";

      if (!packageKeys[pkgName]) packageKeys[pkgName] = new Set();
      packageKeys[pkgName].add(key);
    }
  }

  for (const [pkgName, keys] of Object.entries(packageKeys)) {
    ensureDirSync(localesBase);
    const outFile = path.join(localesBase, `${pkgName}.json`);

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

    const sorted = Object.keys(existing)
      .sort()
      .reduce((acc, k) => {
        acc[k] = existing[k];
        return acc;
      }, /** @type {Record<string, string>} */({}));

    fs.writeFileSync(outFile, JSON.stringify(sorted, null, 2) + "\n", "utf8");
    console.log(`✅ ${pkgName}: wrote ${keys.size} keys to ${outFile}`);
  }

  console.log("✨ Extraction complete!");
}

extractTranslations();