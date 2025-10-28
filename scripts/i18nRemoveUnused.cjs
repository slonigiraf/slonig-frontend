const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

// --- CONFIG ---
const translationPath = path.resolve(__dirname, "../packages/apps/public/locales/ru/translation.json");
const projectRoot = path.resolve(__dirname, "..");
const fileExtensions = ["ts", "tsx", "js", "jsx"];

// --- LOAD TRANSLATION KEYS ---
const translations = JSON.parse(fs.readFileSync(translationPath, "utf8"));
const keys = Object.keys(translations);

console.log(`🔍 Checking ${keys.length} translation keys in project...`);

const unusedKeys = [];

for (const key of keys) {
  // Construct grep command
  const grepCommand = [
    `grep -R --exclude-dir=node_modules`,
    fileExtensions.map(ext => `--include="*.${ext}"`).join(" "),
    `"${key}"`,
    `"${projectRoot}"`,
    `| grep -v "${translationPath}" || true`
  ].join(" ");

  try {
    const result = execSync(grepCommand, { encoding: "utf8" });
    if (!result.trim()) {
      unusedKeys.push(key);
    }
  } catch (err) {
    // grep returns nonzero exit if no matches found
    unusedKeys.push(key);
  }
}

if (unusedKeys.length > 0) {
  console.log(`\n🚨 Unused translation keys found (${unusedKeys.length}):`);
  unusedKeys.forEach(k => console.log(" -", k));
} else {
  console.log("\n✅ All translation keys are used in the codebase!");
}