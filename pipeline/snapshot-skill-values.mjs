/**
 * 把站上某一版的技能數值存成快照 data/upstream-fallback/skills.json，給 buildSkills 補上游漏抽的欄位用（lib/skill-fallback.mjs）。
 *
 * 用法（拿某個 commit 上的站上資料當「前一版」）：
 *   git show <commit>:public/data/skills.json > "$TEMP/old-skills.json"
 *   git show <commit>:public/data/meta.json   > "$TEMP/old-meta.json"
 *   node pipeline/snapshot-skill-values.mjs "$TEMP/old-skills.json" "$TEMP/old-meta.json"
 *
 * 2026-10-15 建的那份來自 1b5a57a1（上游 2.0.0 合進來前的 main，skills-data.js 1.15.1）。
 * 上游之後真的修好、數值都抽得到時，這份就不會再被用到（只補「這一版每一級都沒有」的欄位）；要更新前一版就照上面重跑。
 */
import fs from "node:fs";
import path from "node:path";
import { snapshotSkillValues } from "./lib/skill-fallback.mjs";

const [skillsFile, metaFile] = process.argv.slice(2);
if (!skillsFile || !metaFile) {
  console.error("用法：node pipeline/snapshot-skill-values.mjs <站上舊的 skills.json> <同一版的 meta.json>");
  process.exit(1);
}

const meta = JSON.parse(fs.readFileSync(metaFile, "utf8"));
const part = meta.parts?.["skills-data.js"] ?? {};
const skills = snapshotSkillValues(JSON.parse(fs.readFileSync(skillsFile, "utf8")));
const out = path.resolve(import.meta.dirname, "..", "data", "upstream-fallback", "skills.json");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(
  out,
  JSON.stringify({ gameVersion: part.gameVersion ?? meta.gameVersion, generatedAt: part.generatedAt ?? meta.dataGeneratedAt, skills }) + "\n",
);
console.log(`[snapshot] ${Object.keys(skills).length} 個技能（skills-data.js ${part.gameVersion ?? "?"}）→ ${path.relative(process.cwd(), out)}`);
