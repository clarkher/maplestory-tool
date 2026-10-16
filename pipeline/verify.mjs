/**
 * 產出檢查。
 *
 * 存在的理由很具體：這條管線出過一次「打寶索引整包是空的」的包，
 * build 照樣跑完、檔案照樣寫出來，是我後來手動看數字才發現。
 * 所以每次重建完都要跑這支，壞掉就讓 CI 紅燈，不要靜靜地把空資料推上線。
 */
import fs from "node:fs";
import path from "node:path";
import { readJson } from "./lib/http.mjs";
import { WEAPON_TYPES } from "./lib/gear.mjs";
import { HELD_BACK_MAPS, OFFICIAL_MAP_NAMES } from "./lib/map-names.mjs";
import { NPC_WARPS } from "./lib/npc-warps.mjs";
import { officialNoteStatus, OFFICIAL_SKILL_NOTES } from "./lib/official-skill-notes.mjs";

const OUT = path.resolve(import.meta.dirname, "..", "public", "data");

const failures = [];
const notes = [];

/**
 * 各地區的代表地圖。
 * 客戶端會在改版前先替下一批地區補上中文名（1.15 就先放了冰原雪域與廢礦），
 * 所以「有中文名」不等於已開放。這裡用具體的地圖編號再把關一次：
 * 地區還不在 meta.release.mapRegions 裡，它的地圖就不該帶中文名出現在站上。
 * 地區開放後同一組地圖改成「要出現」的檢查。
 */
const REGION_SENTINELS = {
  冰原雪域: [200020000 /* 雲彩公園Ⅱ */, 200080200 /* 天空之城塔<20層> */, 211040100 /* 冰雪峽谷Ⅰ */],
  // 殘暴炎魔祭壇 2026-10-16 起擋著（官方只開前半部，lib/map-names.mjs 的 HELD_BACK_MAPS），代表圖改用尖銳的絕壁Ⅰ
  廢礦: [211041500 /* 廢棄礦坑Ⅰ */, 211040300 /* 尖銳的絕壁Ⅰ */],
  日本: [800020400 /* 江戶村 彎曲地獄路 */],
};

function check(label, condition, detail = "") {
  if (condition) notes.push(`  ok   ${label}${detail ? ` — ${detail}` : ""}`);
  else failures.push(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
}

function main() {
  const meta = readJson(path.join(OUT, "meta.json"));
  const maps = readJson(path.join(OUT, "maps.json"));
  const graph = readJson(path.join(OUT, "graph.json"));
  const monsters = readJson(path.join(OUT, "monsters.json"));
  const items = readJson(path.join(OUT, "items.json"));
  const quests = readJson(path.join(OUT, "quests.json"));
  const skills = readJson(path.join(OUT, "skills.json"));
  const training = readJson(path.join(OUT, "training.json"));
  const farming = readJson(path.join(OUT, "farming.json"));
  const search = readJson(path.join(OUT, "search.json"));

  check("meta 有遊戲版本", Boolean(meta?.gameVersion), String(meta?.gameVersion));
  check("怪物數量合理（僅已開放）", monsters?.length >= 100 && monsters?.length <= 157, `${monsters?.length} 隻`);
  check("道具數量合理", items?.length >= 10000, `${items?.length} 個`);
  check("任務數量合理（僅已開放）", quests?.length >= 348 && quests?.length <= 545, `${quests?.length} 個`);
  // 2026-10-06 技能改成只收經典版實際存在的職業（lib/classic-jobs.mjs），上限跟著從 659 降下來；
  // 範圍公式不變：[floor(實際數×0.8), ceil(實際數×1.25)]，實際數基準是當時重建出來的 242 筆
  check("技能數量合理（僅經典版職業，到三轉）", skills?.length >= 193 && skills?.length <= 303, `${skills?.length} 個`);

  // 技能卡上看得到的字（說明、沒有代號的效果樣板、每一級的原文）不准有「#」。上游清遊戲的顏色標記清不乾淨
  // （2026-10-08 查到 81 個說明殘留「#」，pipeline/lib/skill-text.mjs 清掉了），之後若出現 #c 這種清不掉的，擋下自動更新。
  // 有代號的樣板（消耗MP#mpCon）卡片不會直接放，改放滿級那一級的原文（src/lib/skill-view.ts），所以不算
  const TOKEN = /#[A-Za-z]/;
  const leaked = (skills ?? []).filter(skill =>
    [skill.desc, TOKEN.test(skill.formula ?? "") ? "" : skill.formula, ...Object.values(skill.levelText ?? {})].some(text => text?.includes("#")),
  );
  check("技能卡上的字沒有「#」（說明、效果、每一級的原文）", leaked.length === 0, leaked.slice(0, 5).map(skill => `${skill.id} ${skill.n}`).join("、"));

  // 官方公告改了、遊戲說明還沒跟上的那行（脫離戰場 1.5 秒）：要嘛卡片有這行，要嘛說明已經是新數字；
  // 兩個都不是＝上游換了說明的寫法，這行默默不見、說明其實還是舊的（lib/official-skill-notes.mjs）
  const lostNotes = Object.keys(OFFICIAL_SKILL_NOTES).map(Number).filter(id => {
    const skill = (skills ?? []).find(entry => entry.id === id);
    return !skill || (!skill.note && officialNoteStatus(id, skill.desc) !== "fixed");
  });
  check("官方公告改了的技能，卡片有那一行或說明已經改好", lostNotes.length === 0, lostNotes.length ? lostNotes.join("、") : `${Object.keys(OFFICIAL_SKILL_NOTES).length} 個`);

  // 傷害計算機要用的欄位（熟練度 M、物理攻擊力 damage、魔攻 mad）：前一版每一級都有的，這一版也要每一級都有。
  // 2026-10-15 上游 2.0.0 漏抽熟練度，36 個技能整列數值不見、計算機算錯，上面那條「#」抓不到（沒數值的級數不放原文）。
  // 前一版＝data/upstream-fallback/skills.json（buildSkills 拿它補漏抽的欄位，見 lib/skill-fallback.mjs）；補不回來的就擋下自動更新
  const CALC_FIELDS = ["M", "damage", "mad"];
  const before = readJson(path.join(import.meta.dirname, "..", "data", "upstream-fallback", "skills.json"), { skills: {} }).skills;
  const lostCalc = (skills ?? []).flatMap(skill => {
    const prev = before[skill.id];
    if (!prev || prev.levels.length !== skill.levels?.length) return [];
    const fields = CALC_FIELDS.filter(field => prev.levels.every(values => field in values));
    const missing = fields.filter(field => skill.levels.some(values => !(field in (values ?? {}))));
    return missing.length ? [`${skill.id} ${skill.n}（${missing.join("、")}）`] : [];
  });
  check("傷害計算機要的技能數值沒有少（熟練度、攻擊力、魔攻）", lostCalc.length === 0, lostCalc.length ? lostCalc.slice(0, 8).join("、") : `${Object.keys(before).length} 個技能比過`);
  check("地圖數量合理", Object.keys(maps ?? {}).length >= 5000, `${Object.keys(maps ?? {}).length} 張`);

  const edges = Object.values(graph ?? {}).reduce((sum, list) => sum + list.length, 0);
  check("傳送門邊數合理", edges >= 3000, `${edges} 條`);

  check("練功索引非空", training?.length >= 220 && training?.length <= 345, `${training?.length} 張圖`);

  // 出怪要用台服客戶端：冰獨眼獸洞穴Ⅱ在台服是冰獨眼獸，v83 是赤龍（2026-10-05 玩家在畫面上抓到）
  const coldEye = training?.find(row => row.m === 105090100);
  check(
    "冰獨眼獸洞穴Ⅱ 用台服出怪（冰獨眼獸，不是赤龍）",
    Boolean(coldEye) && coldEye.mobs.some(([id]) => id === 4230100) && !coldEye.mobs.some(([id]) => id === 6130100),
  );
  // 已開放地圖的出怪幾乎都來自台服客戶端（2026-10-05：207 張，v83 1 張）。掉到 180 以下代表上游
  // maps-data.js 格式變了、刷怪點讀不到，整批悄悄退回 v83——那會把 110 張圖的出怪換回錯的
  const fromClient = meta?.spawnSource?.client ?? 0;
  check("已開放地圖的出怪大多用台服客戶端", fromClient >= 180, `${fromClient} 張（v83 ${meta?.spawnSource?.v83 ?? "?"} 張）`);

  check("打寶索引非空", Object.keys(farming ?? {}).length >= 500, `${Object.keys(farming ?? {}).length} 個道具`);
  check("搜尋索引非空", search?.length >= 8000, `${search?.length} 筆`);

  // 每筆練功資料的地圖都要在地圖表裡，不然前端會顯示「地圖 12345」
  const orphanTraining = (training ?? []).filter(row => !maps[String(row.m)]).length;
  check("練功索引的地圖都查得到", orphanTraining === 0, `${orphanTraining} 筆孤兒`);

  // 已開放內容判準：練功地圖必須全部有中文名，沒有中文名代表那張圖還沒開放
  const named = (training ?? []).filter(row => maps[String(row.m)]?.zh).length;
  check("練功地圖全部有中文名", named === (training?.length ?? 0), `${named}/${training?.length}`);

  const openRegions = meta?.release?.mapRegions ?? [];
  check("meta 有列出已開放的地區", openRegions.length > 0, openRegions.join("、"));
  for (const [region, ids] of Object.entries(REGION_SENTINELS)) {
    const named = ids.filter(id => maps?.[String(id)]?.zh);
    if (openRegions.includes(region)) {
      check(`已開放的${region}有出現`, named.length === ids.length, `${named.length}/${ids.length} 張代表地圖有中文名`);
    } else {
      check(`未開放的${region}沒有被當成已開放`, named.length === 0,
        named.length ? `漏進來：${named.map(id => `${id} ${maps[String(id)].zh}`).join("、")}` : `${ids.length} 張代表地圖都沒有中文名`);
    }
  }

  // 官方公告過、但客戶端還沒補中文名的城鎮（Task 10b 補缺表）：要用公告的地名，不是空白或別的字
  // 地區開了、官方還沒開的圖（廢礦後半部）不准帶中文名上站、不准進練功推薦
  const trainingIds = new Set((training ?? []).map(row => row.m));
  const leakedHeld = [...HELD_BACK_MAPS].filter(([id]) => maps?.[String(id)]?.zh || trainingIds.has(id)).map(([id, name]) => `${id} ${name}`);
  check("官方還沒開的圖沒有上站（廢礦後半部）", leakedHeld.length === 0, leakedHeld.length ? `漏進來：${leakedHeld.join("、")}` : `${HELD_BACK_MAPS.size} 張都擋著`);

  for (const [id, entry] of Object.entries(OFFICIAL_MAP_NAMES)) {
    check(`補缺的城鎮有官方地名：${entry.name}`, maps?.[id]?.zh === entry.name, `地圖 ${id} 目前是「${maps?.[id]?.zh ?? ""}」`);
  }

  // 站上不該出現任何英文地圖名
  const english = Object.values(maps ?? {}).filter(map => map.en).length;
  check("地圖資料不含英文名", english === 0, `${english} 筆`);

  // 開放範圍：不該有超過等級上限或三轉以上的內容
  const cap = meta?.release?.levelCap ?? 100;
  const overCap = (quests ?? []).filter(quest => (quest.minLv ?? 0) > cap).length;
  check(`任務都在 Lv.${cap} 以內`, overCap === 0, `${overCap} 個超出`);
  const overLevelMob = (monsters ?? []).filter(monster => (monster.lv ?? 0) > cap).length;
  check(`怪物都在 Lv.${cap} 以內`, overLevelMob === 0, `${overLevelMob} 隻超出`);

  // 走一條已知路線：弓箭手村 → 弓箭手訓練場Ⅰ 應該一步到位
  check("已知路線走得通", routeExists(graph, 100000000, 104040000, 3),
    "弓箭手村 → 弓箭手訓練場Ⅰ");
  // 多段路線：勇士之村 → 奇幻村
  check("多段路線走得通", routeExists(graph, 102000000, 105040300, 12),
    "勇士之村 → 奇幻村");

  // 已開放的練功圖都要有城鎮走得到（不管等級）：v1.01 code review 第 5 項——冰雪峽谷Ⅱ往上是 NPC 傑夫送，傳送門資料沒有，
  // 尖銳的絕壁到廢棄礦坑Ⅳ 16 張整區走不到，主推不推、首頁不給帶我去，建置照樣綠（lib/npc-warps.mjs 補上）。
  // 下面這幾張傳送門本來就走不到（2026-10-16 查過）：組隊任務的關卡、地鐵三號線工地的車庫、隱藏地圖
  const NOT_BY_PORTAL = new Set([
    103000804, 103000805, // 組隊訓練場<最後階段>、<獎金地點>
    910340500, 910340600, // 第一次同行<最後的關隘>、<獎勵>
    103000902, 103000905, 103000909, // 三號線1～3號車庫
    910010200, 912000000, // 肥肥村莊、秘密場所
  ]);
  const fromTowns = reachableFromTowns(graph, maps);
  const stranded = (training ?? []).filter(row => !fromTowns.has(row.m) && !NOT_BY_PORTAL.has(row.m)).map(row => `${row.m} ${maps[String(row.m)]?.zh ?? ""}`);
  check("已開放的練功圖都有城鎮走得到", stranded.length === 0,
    stranded.length ? `走不到：${stranded.slice(0, 8).join("、")}${stranded.length > 8 ? ` 等 ${stranded.length} 張` : ""}` : `${(training?.length ?? 0) - NOT_BY_PORTAL.size} 張`);

  // 有等級門檻的 NPC 傳送（傑夫 50 等）：傳送門圖裡那條要帶著門檻、送到的那張圖要標等級（maps.json 的 g）。
  // 上游哪天補上同兩張圖的真門，傑夫那條會被門蓋掉、門檻跟著不見，路線照樣通、上面那條擋不到（code review）
  const lostGates = NPC_WARPS.filter(warp => warp.minLevel !== undefined).filter(warp => {
    const edge = (graph?.[String(warp.from)] ?? []).find(([to]) => to === warp.to);
    return edge?.[4] !== warp.minLevel || maps?.[String(warp.to)]?.g !== warp.minLevel;
  }).map(warp => `${warp.from}→${warp.to}`);
  check("NPC 傳送的等級門檻還在（傳送門圖跟地圖的等級都有）", lostGates.length === 0, lostGates.length ? `不見了：${lostGates.join("、")}` : `${NPC_WARPS.length} 條`);

  const monsterIds = new Set((monsters ?? []).map(monster => monster.id));
  const badDrop = (items ?? []).filter(item => item.dm?.some(id => !monsterIds.has(id))).length;
  check("道具的掉落來源都指得到怪", badDrop === 0, `${badDrop} 個道具有壞掉的來源`);

  // 上游 1.15 起把同名道具併成一筆（mergedIds），舊編號不再出現在道具表。
  // 怪物掉落與任務道具若還指著舊編號，前端會顯示成查不到的道具
  const itemIds = new Set((items ?? []).map(item => item.id));
  const badMobDrops = (monsters ?? []).flatMap(monster => (monster.drops ?? []).filter(id => !itemIds.has(id)));
  check("怪物掉落都指得到道具", badMobDrops.length === 0, `${badMobDrops.length} 筆指不到${badMobDrops.length ? `（${badMobDrops.slice(0, 5).join("、")}）` : ""}`);
  const badQuestItems = (quests ?? []).flatMap(quest =>
    ["needItems", "startItems", "rewardItems", "startGiven"].flatMap(key => (quest[key] ?? []).filter(row => !itemIds.has(row.id)).map(row => row.id)));
  check("任務道具都指得到道具", badQuestItems.length === 0, `${badQuestItems.length} 筆指不到${badQuestItems.length ? `（${badQuestItems.slice(0, 5).join("、")}）` : ""}`);

  const withSpawn = (monsters ?? []).filter(monster => monster.sp?.length).length;
  check("怪物有刷怪點資料的比例", withSpawn / Math.max(monsters?.length ?? 1, 1) >= 0.7,
    `${withSpawn}/${monsters?.length}`);

  // 屬性抗性：怪物卡、火毒避抗火的圖、冰雷找怕冰雷的圖都靠它。上游整個 elemental.values 不見時
  // 每隻怪的 el 會靜靜清空、照樣建置成功。2026-10-07 重建出來 71 隻帶 el，下限抓 ×0.8 取整
  const withElemental = (monsters ?? []).filter(monster => monster.el).length;
  check("怪物有屬性抗性資料", withElemental >= Math.floor(71 * 0.8), `${withElemental} 隻`);

  // 任務細節曾經整批漏掉（texts 被當成物件而不是陣列），加上檢查避免再犯
  const withTexts = (quests ?? []).filter(quest => Array.isArray(quest.texts) && quest.texts.length).length;
  check("任務有敘述的比例", withTexts / Math.max(quests?.length ?? 1, 1) >= 0.9, `${withTexts}/${quests?.length}`);
  const withMobs = (quests ?? []).filter(quest => quest.needMobs?.length).length;
  check("有打怪需求的任務", withMobs >= 30, `${withMobs} 個`);
  const beginnerOnly = (quests ?? []).filter(quest => quest.jobs?.length === 1 && quest.jobs[0] === 0).length;
  check("初心者專屬任務有被標記", beginnerOnly >= 40, `${beginnerOnly} 個`);
  // 開放到第幾轉看 meta.release.maxAdvancementOrder（V002 是三轉），避免下次改版又漏改這裡的硬編碼
  const maxAdv = meta?.release?.maxAdvancementOrder ?? 2;
  const advLabel = ["初心者", "一轉", "二轉", "三轉", "四轉"][maxAdv] ?? `第 ${maxAdv} 轉`;
  const advJobs = (readJson(path.join(OUT, "jobs.json")) ?? []).filter(job => job.advOrder > maxAdv).length;
  check(`職業選單只到${advLabel}`, advJobs === 0, `${advJobs} 個超過放行範圍`);
  const island = (quests ?? []).filter(quest => quest.island).length;
  check("楓之島任務有被標記", island >= 40, `${island} 個`);
  // 獎勵清單裡混著 action=remove（完成時收走的道具），曾經被當成獎勵列出來
  const rewardRows = (quests ?? []).reduce((sum, quest) => sum + (quest.rewardItems?.length ?? 0), 0);
  check("獎勵道具沒把收走的算進去", rewardRows > 150 && rewardRows < 600, `${rewardRows} 列`);
  const randomRows = (quests ?? []).reduce(
    (sum, quest) => sum + (quest.rewardItems?.filter(item => item.rand).length ?? 0), 0);
  check("隨機獎勵有被標記", randomRows >= 50, `${randomRows} 列`);

  const priced = (items ?? []).filter(item => item.price).length;
  check("道具有商店價格的筆數", priced >= 300, `${priced} 個`);

  // 女神手鐲的「去哪拿」要有女神的痕跡組隊任務（2026-10-16 使用者選 7）。上游 2.0.0 22:04 版起道具來源自己有列 1203
  // （說明寫羽翼 40 個＋溫莉好感兌換），任務獎勵欄沒列手鐲——不要自己補進任務獎勵，那會變成每次通關都給
  const bracelet = (items ?? []).find(item => item.id === 1082232);
  check("女神手鐲的來源有女神的痕跡（任務 1203）", Boolean(bracelet?.qr?.includes("1203")), bracelet ? `qr：${(bracelet.qr ?? []).join("、") || "（空）"}` : "女神手鐲不在 items.json");

  // gear.json（能力值＋裝備＋衝卷卡）：2026-10-07 加上 NPC 合成來源後是武器 232 把、卷軸 106 種，
  // 下限抓實際數 ×0.8 取整，跟著遊戲資料變動留一點空間，掉太多代表解析壞了
  const gear = readJson(path.join(OUT, "gear.json"));
  check("武器數量合理", (gear?.weapons?.length ?? 0) >= Math.floor(232 * 0.8), `${gear?.weapons?.length ?? 0} 把`);
  const weaponTypesSeen = new Set((gear?.weapons ?? []).map(weapon => weapon.s));
  const missingWeaponTypes = WEAPON_TYPES.filter(type => !weaponTypesSeen.has(type));
  check("每種武器種類至少 1 把", missingWeaponTypes.length === 0, missingWeaponTypes.join("、"));
  check("卷軸數量合理", (gear?.scrolls?.length ?? 0) >= Math.floor(106 * 0.8), `${gear?.scrolls?.length ?? 0} 種`);

  // 全幸要湊的裝備（kit）：buildKit 對找不到、不收錄、沒來源、卷軸對不上的整件略過並只警告，不會讓建置失敗。
  // 每日資料更新如果因此掉了一件（例如桑那服哪天被標成不收錄），敏捷少了一截，推薦的拳套會悄悄改變，
  // 畫面看起來一切正常——所以拿研究檔當標準，建出來的件數要跟研究檔寫的一樣多，少了就擋下來。研究檔不在就跳過。
  const researchGear = readJson(path.resolve(import.meta.dirname, "..", "data", "guides", "gear.json"), null);
  if (researchGear) {
    const sameJobs = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const kitMismatches = [];
    let kitRules = 0;
    for (const rule of researchGear.statRules ?? []) {
      if (!rule.kit) continue;
      kitRules += 1;
      const built = (gear?.rules ?? []).find(candidate => sameJobs(candidate.jobs, rule.jobs) && candidate.label === rule.label);
      const builtCount = built?.kit?.length ?? 0;
      if (builtCount !== rule.kit.length) {
        kitMismatches.push(`[${rule.jobs.join("、")}]「${rule.label}」研究檔 ${rule.kit.length} 件、建出來 ${builtCount} 件${built ? "" : "（rules 裡找不到這條）"}`);
      }
    }
    check("全幸要湊的裝備沒少件", kitMismatches.length === 0, kitMismatches.length ? kitMismatches.join("；") : `${kitRules} 條點法的件數都跟研究檔一樣`);
  }

  console.log("=== 資料檢查 ===");
  for (const line of notes) console.log(line);
  if (failures.length) {
    console.log("");
    for (const line of failures) console.log(line);
    console.error(`\n${failures.length} 項檢查未通過，資料不要上線。`);
    process.exit(1);
  }
  console.log("\n全部通過。");
}

function routeExists(graph, from, to, maxHops) {
  const visited = new Set([from]);
  let frontier = [from];
  for (let depth = 0; depth < maxHops; depth += 1) {
    const next = [];
    for (const current of frontier) {
      for (const [target] of graph[String(current)] || []) {
        if (target === to) return true;
        if (visited.has(target)) continue;
        visited.add(target);
        next.push(target);
      }
    }
    if (!next.length) return false;
    frontier = next;
  }
  return false;
}

/** 從所有有中文名的城鎮出發、走傳送門（含 NPC 傳送，不看等級）到得了的圖 */
function reachableFromTowns(graph, maps) {
  const seen = new Set();
  const queue = [];
  for (const [id, record] of Object.entries(maps ?? {})) {
    if (record.t && record.zh) {
      seen.add(Number(id));
      queue.push(Number(id));
    }
  }
  for (let head = 0; head < queue.length; head += 1) {
    for (const [target] of graph?.[String(queue[head])] || []) {
      if (seen.has(target)) continue;
      seen.add(target);
      queue.push(target);
    }
  }
  return seen;
}

main();
