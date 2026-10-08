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
  return text?.replace(/\\?#(?![A-Za-z])/g, "").trim() || undefined;
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
