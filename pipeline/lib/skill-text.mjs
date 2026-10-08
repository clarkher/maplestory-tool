/**
 * 技能卡（查資料・技能）要用的遊戲原文，buildSkills 用。
 *
 * 上游 skills-data.js 每個技能有：description（說明）、formula（效果樣板，例「消耗MP#mpCon, 攻擊力#damage%」）、
 * levels[].values（每一級的數值）、levels[].description（每一級的說明原文＝樣板代入那一級的數值，
 * 例「消耗MP10, 攻擊力55%, 對一名怪物兩次攻擊」）。
 * 槍連擊、極速詠唱這類 8 個多級技能上游 values 全空，只有每一級的原文；卡片怎麼用見 src/lib/skill-view.ts。
 */

/**
 * 說明裡上游沒清乾淨的顏色標記：遊戲原字串是「#c能量補滿#的狀態」，上游拿掉了 #c、留下收尾的 #
 * （2026-10-08 查：81 個技能，多半在「所需技能：…以上#」的尾巴，有 3 個前面還多一個反斜線）。
 * 後面接英文字母的 # 是樣板代號，說明裡目前沒有，不在這裡處理。
 */
export function cleanSkillDesc(text) {
  // 韓文說明（19 個坐騎技能，上游「[TW][마스터 레벨 : 1]…」）不留：卡片的效果行是中文，照列那一行就好（2026-10-08 使用者「全修」）
  if (!text || /\p{Script=Hangul}/u.test(text)) return undefined;
  return (
    text
      .replace(/\\?#(?![A-Za-z])/g, "")
      // 開頭的「[最高等級：20]」「[等級上限 : 1]」：卡片標題下已經寫「上限 20 級」（2026-10-08 查：216 個都跟 maxLevel 一樣）
      .replace(/^\s*\[(?:最高等級|等級上限)\s*[：:]\s*\d+\]\s*/, "")
      .trim() || undefined
  );
}

/**
 * 說明尾巴的「所需技能：魔天一擊1等級以上」拆出來，卡片另外列一行、名字做成連到那個技能的連結。
 * 認得三種寫法：「魔天一擊1等級以上」「詛咒術 3等級以上」「精準強化等級3以上」，還有只寫「5以上」的；
 * 好幾個用「、」或逗號隔開。有一個認不得就整段不拆、說明原樣（不硬拆）。
 * 回傳 { desc, req }，req 是 [{ name, level }]，沒有所需技能時是 undefined。
 */
export function splitPrereq(desc) {
  const match = desc?.match(/^([\s\S]*?)\s*所需技能\s*[：:]\s*(.+?)\s*$/);
  if (!match) return { desc, req: undefined };
  const req = [];
  for (const part of match[2].split(/\s*[、,，]\s*/)) {
    const item = part.match(/^(.+?)\s*(?:等級\s*)?(\d+)\s*(?:等級|級)?\s*以上$/);
    if (!item) return { desc, req: undefined };
    req.push({ name: item[1].trim(), level: Number(item[2]) });
  }
  return { desc: match[1].trim() || undefined, req };
}

/** 同一條職業線：自己、上一轉、一轉（龍騎士 131 → 槍騎兵 130 → 劍士 100） */
const jobLine = job => new Set([job, job - (job % 10), job - (job % 100)]);

/**
 * 所需技能的名字接上技能 id（卡片才做得成連結）：只在同一條職業線找名字完全一樣、只有一個的；
 * 找不到（上游的字跟技能名對不上，例如「劍技專精」）或不只一個（「恢復術」刺客、俠盜各一個）就只留名字。
 * list 是 buildSkills 做好的技能（{ id, n, job, req? }），直接改 req 裡的每一筆。
 */
export function linkPrereqs(list) {
  for (const skill of list) {
    if (!skill.req) continue;
    const line = jobLine(skill.job);
    for (const req of skill.req) {
      const found = list.filter(other => other.n === req.name && line.has(other.job));
      if (found.length === 1) req.id = found[0].id;
    }
  }
  return list;
}

/**
 * 說明寫了有效期限的活動技能（宇宙衝鋒「有效時間：2009年6月8日00時」、雪吉拉騎士「有效期間：2009年9月7日00點」）
 * 讀出到期日 "YYYY-MM-DD"；沒寫回 null。buildSkills 拿來把早就到期、經典版拿不到的技能從清單拿掉。
 */
export function expiredOn(desc) {
  const match = desc?.match(/有效(?:時間|期間)\s*[：:]\s*(\d{4})年(\d{1,2})月(\d{1,2})日/);
  if (!match) return null;
  return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
}

/** 原文能不能上畫面：要有字、不是韓文（坐騎技能的原文是「[TW]MP 10 소비…」）、沒有沒代入的 #代號 */
const usable = text => Boolean(text?.trim()) && !/\p{Script=Hangul}/u.test(text) && !/#[A-Za-z]/.test(text);
const hasValues = level => Object.keys(level.values ?? {}).length > 0;

/**
 * 每一級的說明原文，只留卡片用得到的級數（全部留，skills.json 會大一倍）：
 *  - 有好幾級、那一級沒有數值（槍連擊整個技能、隱身術第 20 級）：卡片拿原文當那一級的效果
 *  - 有數值的技能的最高級：卡片「滿級效果」那一行
 * 只有一級又沒有數值的（英雄共鳴、坐騎）效果樣板本身就是完整句子，不用留。
 * 回傳 { 級數: 原文 }，一筆都沒有回 undefined（建置時 dropEmpty 拿掉欄位）。
 * 級數照陣列順序算（skills.json 的 levels 也是第 i 筆＝i+1 級）；上游的 level 欄位對不上就讓重建失敗，
 * 不默默把原文標到錯的級數。skill 是錯誤訊息裡的技能（「1311001 槍連擊」），方便回頭查上游。
 */
export function skillLevelText(levels, skill = "") {
  if (!levels?.length) return undefined;
  levels.forEach((level, index) => {
    if (level.level !== undefined && level.level !== index + 1) {
      throw new Error(
        `上游技能 ${skill || "（未標示）"} 的 levels 第 ${index + 1} 筆寫的是 ${level.level} 級，順序或級數對不上——` +
          "先看上游 skills-data.js 的格式是不是改了，pipeline/lib/skill-text.mjs 跟 build.mjs 的 levels 要照實際級數重排再重建",
      );
    }
  });
  const anyValues = levels.some(hasValues);
  const out = {};
  levels.forEach((level, index) => {
    const isMax = index === levels.length - 1;
    const wanted = (levels.length > 1 && !hasValues(level)) || (anyValues && isMax);
    if (wanted && usable(level.description)) out[index + 1] = level.description.trim();
  });
  return Object.keys(out).length ? out : undefined;
}

/**
 * 上游沒給每一級數值、台服客戶端有的技能（data/client/skills.json，用 scripts/client/ 從本機客戶端抽；目前只有衝鋒 5001005：
 * 上游每一級只寫 MP 跟秒數，樣板卻說還加移動速度、跳躍力），每一級的數值跟表頭改用客戶端的，說明原文照留。
 * 上游已經有數值就用上游的，不混兩邊；級數對不上（改版後上限變了）就讓重建失敗，免得數字錯開一級。
 * 回傳 { levels, labels }：labels 只有用了客戶端時才有，其他時候是 undefined（照上游的 valueLabels）。
 */
export function clientLevels(levels, client, skill = "") {
  if (!client || !levels?.length || levels.some(hasValues)) return { levels, labels: undefined };
  if (client.levels.length !== levels.length) {
    throw new Error(
      `技能 ${skill || "（未標示）"} 在 data/client/skills.json 有 ${client.levels.length} 級、上游有 ${levels.length} 級，對不上——` +
        "客戶端或上游改版了，照 README「客戶端技能數值」重新抽再重建",
    );
  }
  return {
    levels: levels.map((level, index) => ({ ...level, values: client.levels[index] })),
    labels: client.labels,
  };
}
