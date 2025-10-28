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
  } catch {
    unusedKeys.push(key);
  }
}

// --- REMOVE UNUSED KEYS ---
if (unusedKeys.length > 0) {
  console.log(`\n🚨 Removing ${unusedKeys.length} unused translation keys:`);

  for (const key of unusedKeys) {
    console.log(" -", key);
    delete translations[key];
  }

  // Write updated JSON with 2-space indentation
  fs.writeFileSync(translationPath, JSON.stringify(translations, null, 2) + "\n", "utf8");
  console.log(`\n🧹 Cleaned ${unusedKeys.length} unused keys from translation.json`);
} else {
  console.log("\n✅ All translation keys are used in the codebase!");
}