/**
 * 把玩家攻略研究檔（data/guides/*.json）編成前端用的檔案。
 *
 * 用法：npm run data:guides
 *
 * 輸入：
 *   data/guides/{warrior-pirate,magician,archer-thief}.json  各職業的點法、練功點、注意事項（每條附出處）
 *   data/guides/quests-exp.json                              升級經驗表、必解／不值得解任務
 *   data/guides/pq.json                                      組隊任務表（入口地圖、對應的遊戲任務、比對字）
 *   public/data/{skills,maps,monsters,quests,meta}.json      站內遊戲資料，用來驗證 id、組隊任務的等級限制
 *
 * 輸出：
 *   public/data/guides/{jobId}.json  每個職業一檔，首頁只載自己職業的那份
 *   public/data/guides/common.json   升級經驗表、必解清單、組隊任務範圍、剩點建議
 *
 * 研究檔是人工整理的，id 難免對不上。規則是「以遊戲資料為準」：
 *   - 技能 id 不在 skills.json → 保留步驟但拿掉 id（不顯示圖示），列警告
 *   - 怪物 id 不在 monsters.json → 丟掉那隻怪，列警告
 *   - 地圖 id 沒有中文名（未開放或不存在）→ 保留文字但拿掉 id（不能導航），列警告
 *   - 任務 id 不在 quests.json → 必解清單丟掉那筆，列警告
 *   - 組隊任務各職業的等級範圍超出遊戲任務的 minLv／maxLv → 裁進去，整段在外就拿掉，列警告
 *   - 練功段落寫的怪在那張圖一隻都不出（台服出怪）→ 列警告，研究檔要再對一次
 *
 * 研究檔的練功清單裡混了兩種不是練功點的條目，這裡分出去：
 *   - 名稱「（無可靠出處）」：那段等級找不到攻略的說明 → gaps，畫面上照實寫「沒有攻略」
 *   - 名稱帶「（非地圖）」：換裝節點之類的補充 → notes
 *
 * 研究檔會上畫面的文字（含技能點法每一步的 note）不准帶內部筆記（地圖編號、站內用語、屬性代碼、玩家 ID 與署名、網址），
 * 由 lib/guides.mjs 的 lintResearch 檢查，有一筆就整個失敗並列出位置。
 */
import fs from "node:fs";
import path from "node:path";
import { lintResearch, mobsMissingOnMap, normalizeReward, pqKeyOf, pqWindows } from "./lib/guides.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const SRC = path.join(ROOT, "data", "guides");
const DATA = path.join(ROOT, "public", "data");
const OUT = path.join(DATA, "guides");
const JOB_FILES = ["warrior-pirate.json", "magician.json", "archer-thief.json"];
/** 經典版的 17 個職業（src/lib/jobs.ts 的 JOB_OPTIONS），每個都要有攻略檔，首頁才不會缺 */
const EXPECTED_JOBS = [100, 110, 120, 130, 200, 210, 220, 230, 300, 310, 320, 400, 410, 420, 500, 510, 520];
const GAP = /^（無可靠出處）/;
const NOT_A_MAP = /（非地圖）/;

const readJson = file => JSON.parse(fs.readFileSync(file, "utf8"));

function main() {
  const pqResearch = readJson(path.join(SRC, "pq.json"));
  const itemIds = new Set(readJson(path.join(DATA, "items.json")).map(item => item.id));
  const lintIssues = [];
  const skills = new Map(readJson(path.join(DATA, "skills.json")).map(skill => [skill.id, skill]));
  const maps = readJson(path.join(DATA, "maps.json"));
  const monsterList = readJson(path.join(DATA, "monsters.json"));
  const monsters = new Set(monsterList.map(monster => monster.id));
  const monsterName = new Map(monsterList.map(monster => [monster.id, monster.n]));
  // 地圖 → 台服客戶端在這張圖出的怪（monsters.json 的 sp），用來抓「攻略寫的怪在那張圖根本不出」
  const spawnedOn = new Map();
  for (const monster of monsterList) {
    for (const [map] of monster.sp ?? []) {
      if (!spawnedOn.has(map)) spawnedOn.set(map, new Set());
      spawnedOn.get(map).add(monster.id);
    }
  }
  const quests = new Map(readJson(path.join(DATA, "quests.json")).map(quest => [quest.id, quest]));
  const levelCap = readJson(path.join(DATA, "meta.json")).release?.levelCap;
  if (!Number.isFinite(levelCap)) throw new Error("meta.json 缺 release.levelCap，先跑 npm run data:build");
  const openMap = id => (id && maps[String(id)]?.zh ? Number(id) : null);

  const warnings = [];
  // 先全部算完、驗完才寫檔：中途出錯不能留下一個缺 common.json 的半成品資料夾
  const outputs = new Map();

  let researchedAt = "";
  const summary = [];

  for (const file of JOB_FILES) {
    const research = readJson(path.join(SRC, file));
    lintIssues.push(...lintResearch(research).map(issue => ({ file, ...issue })));
    researchedAt = research.researchedAt || researchedAt;

    for (const job of research.jobs) {
      const where = `${job.name}(${job.jobId})`;

      const builds = job.skillBuilds.map(build => ({
        label: build.label,
        main: Boolean(build.mainstream),
        v: build.verified,
        s: build.sources,
        steps: build.steps.map(step => {
          const skill = skills.get(step.skillId);
          if (!skill) warnings.push(`${where} 點法「${build.label}」：技能 ${step.skillName}（${step.skillId}）不在站內資料`);
          else if (skill.max && step.to > skill.max) warnings.push(`${where} 點法「${build.label}」：${step.skillName} 點到 ${step.to} 超過上限 ${skill.max}`);
          return {
            id: skill ? step.skillId : null,
            name: skill?.n ?? step.skillName,
            to: step.to,
            ...(step.note ? { note: step.note } : {}),
          };
        }),
      }));

      const gaps = job.training
        .filter(segment => GAP.test(segment.mapName))
        .map(segment => ({ from: segment.levelFrom, to: segment.levelTo, t: segment.why, s: segment.sources }));
      const extraNotes = job.training
        .filter(segment => NOT_A_MAP.test(segment.mapName))
        .map(segment => ({ t: `${segment.mapName.replace(NOT_A_MAP, "")}（Lv.${segment.levelFrom}–${segment.levelTo}）：${segment.why}`, s: segment.sources }));

      const train = job.training.filter(segment => !GAP.test(segment.mapName) && !NOT_A_MAP.test(segment.mapName)).map(segment => {
        const map = openMap(segment.mapId);
        if (segment.mapId && !map) warnings.push(`${where} 練功「${segment.mapName}」：地圖 ${segment.mapId} 沒有中文名，拿掉導航`);
        const mobs = (segment.mobs || [])
          .filter(mob => {
            if (mob.id && monsters.has(mob.id)) return true;
            warnings.push(`${where} 練功「${segment.mapName}」：怪物 ${mob.name}（${mob.id}）不在站內資料`);
            return false;
          })
          .map(mob => mob.id);
        if (map && mobsMissingOnMap(mobs, spawnedOn.get(map) ?? new Set())) {
          warnings.push(`${where} 練功「${segment.mapName}」：寫的怪（${mobs.map(id => monsterName.get(id)).join("、")}）在${maps[String(map)].zh}一隻都不出（台服出怪），研究檔要再對一次`);
        }
        return {
          from: segment.levelFrom,
          to: segment.levelTo,
          kind: segment.kind,
          map,
          name: segment.mapName,
          mobs,
          why: segment.why,
          v: segment.verified,
          s: segment.sources,
          pq: pqKeyOf(pqResearch.pq, { kind: segment.kind, name: segment.mapName }),
        };
      });

      const output = {
        job: job.jobId,
        name: job.name,
        stat: job.statBuild.map(entry => ({ t: entry.text, v: entry.verified, s: entry.sources })),
        builds,
        train,
        notes: [...(job.notes || []).map(note => ({ t: note.text, s: note.sources })), ...extraNotes],
        gaps,
        notOpenYet: (research.notOpenYet || [])
          .filter(entry => entry.jobId === job.jobId)
          .map(entry => ({ from: entry.levelFrom, to: entry.levelTo, place: entry.place, s: entry.sources })),
      };

      outputs.set(`${job.jobId}.json`, output);
      summary.push(`${job.name}(${job.jobId}) 點法 ${builds.length}、練功 ${train.length}${gaps.length ? `、無攻略段 ${gaps.length}` : ""}`);
    }
  }

  const questResearch = readJson(path.join(SRC, "quests-exp.json"));
  lintIssues.push(...lintResearch(questResearch).map(issue => ({ file: "quests-exp.json", ...issue })));
  lintIssues.push(...lintResearch(pqResearch).map(issue => ({ file: "pq.json", ...issue })));
  const toNext = [0];
  for (let level = 1; level < 100; level += 1) {
    const value = questResearch.expTable.toNext[String(level)];
    if (!Number.isFinite(value) || value <= 0) throw new Error(`升級經驗表缺 Lv.${level}`);
    toNext.push(value);
  }

  const keepQuest = (entry, kind) => {
    if (entry.questId && quests.has(entry.questId)) return true;
    warnings.push(`${kind}「${entry.questName}」：任務 ${entry.questId} 不在站內資料，略過`);
    return false;
  };

  const common = {
    researchedAt: questResearch.researchedAt || researchedAt,
    builtAt: new Date().toISOString(),
    expTable: {
      toNext,
      conflicts: questResearch.expTable.conflicts,
      v: questResearch.expTable.verified,
      s: questResearch.expTable.sources,
    },
    mustDo: questResearch.mustDo
      .filter(entry => keepQuest(entry, "必解"))
      .map(entry => {
        const { reward, dropped } = normalizeReward(entry.reward, itemIds, entry.questName);
        for (const id of dropped) warnings.push(`必解「${entry.questName}」：獎勵道具 ${id} 不在站內資料，拿掉`);
        return {
          q: entry.questId,
          chain: (entry.chain || []).filter(id => quests.has(id)),
          name: entry.questName,
          lv: entry.suggestedLevel,
          why: entry.why,
          v: entry.verified,
          s: entry.sources,
          ...(reward ? { reward } : {}),
        };
      }),
    notWorth: questResearch.notWorth
      .filter(entry => keepQuest(entry, "不值得解"))
      .map(entry => ({
        q: entry.questId,
        related: (entry.relatedQuestIds || []).filter(id => quests.has(id)),
        name: entry.questName,
        why: entry.why,
        s: entry.sources,
      })),
    pq: [],
    ...(questResearch.spLeftover ? { spLeftover: { t: questResearch.spLeftover.text, s: questResearch.spLeftover.sources } } : {}),
  };
  const trainByJob = new Map([...outputs.entries()].map(([name, output]) => [output.job, output.train]));
  for (const pq of pqResearch.pq) {
    if (!quests.has(String(pq.quest))) throw new Error(`組隊任務「${pq.name}」的任務 ${pq.quest} 不在遊戲資料，等級限制沒辦法驗`);
  }
  // 各職業的範圍裁進遊戲的等級限制（例：第一次同行 21–30），被裁、被拿掉的都列警告
  common.pq = pqWindows(pqResearch.pq, trainByJob, { quests, levelCap, warn: line => warnings.push(line) });
  for (const pq of common.pq) {
    if (!openMap(pq.entrance)) throw new Error(`組隊任務「${pq.name}」的入口地圖 ${pq.entrance} 沒有中文名`);
  }
  outputs.set("common.json", common);

  if (lintIssues.length) {
    const lines = lintIssues.map(issue => `  - ${issue.file} ${issue.where}：${issue.label}「${issue.match}」`);
    throw new Error(`研究檔有 ${lintIssues.length} 處內部筆記會上畫面，先改掉：\n${lines.join("\n")}`);
  }

  const missing = EXPECTED_JOBS.filter(id => !outputs.has(`${id}.json`));
  if (missing.length) throw new Error(`研究檔缺這些職業的攻略：${missing.join(", ")}`);

  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  for (const [name, content] of outputs) fs.writeFileSync(path.join(OUT, name), JSON.stringify(content));

  console.log(`[guides] ${summary.length} 個職業`);
  for (const line of summary) console.log(`  ${line}`);
  console.log(`[guides] 必解 ${common.mustDo.length}（含關鍵獎勵 ${common.mustDo.filter(entry => entry.reward).length}）、不值得解 ${common.notWorth.length}、組隊任務 ${common.pq.length}、升級表 Lv.1–99`);
  if (warnings.length) {
    console.log(`[guides] ${warnings.length} 筆以遊戲資料為準調整：`);
    for (const line of warnings) console.log(`  - ${line}`);
  }
}

main();
