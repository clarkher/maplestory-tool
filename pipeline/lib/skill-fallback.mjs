/**
 * 上游某一版抽檔漏掉的技能欄位，補回來（buildSkills 用）。
 *
 * 2026-10-15 上游 2.0.0（V002）：熟練度 #M 整個沒抽到，同一個技能的其他欄位也一起不見——
 * 站上用到的 36 個技能每一級 values 是空的（全職業的精準系、法師全部攻擊魔法、楓幣炸彈、虎咆哮、龍咆哮…），
 * 說明原文直接留著「熟練度#M%」，攻擊範圍的「#rb」還被當成顏色碼 #r 切掉、剩一個「b」。
 * 傷害計算機要熟練度算最低傷害、要魔法攻擊力，整個算錯（當天正式機退回 1.15.2，PR #131）。
 *
 * 怎麼補：每一級的說明原文照樣板拆開，每個代號的位置不是數字就是沒換掉的代號（#M、b）。
 *  - 說明裡看得到的數字全部跟前一版一樣（這一版沒改這個技能）：看不到的欄位用前一版的補，說明的代號換成數字。
 *    前一版的數值存在 data/upstream-fallback/skills.json（pipeline/snapshot-skill-values.mjs 從站上舊的 public/data/skills.json 產生）。
 *  - 有一個數字跟前一版不一樣（這一版真的改了，例：龍咆哮 10 級間隔 3→4 秒）：只收說明裡看得到的數字（那就是新版的值），
 *    看不到的欄位留空——不拿舊數字猜新版。回 changed 讓建置印出來。
 *  - 說明對不上樣板（字不一樣）或級數不同：整個不動，回 mismatch。
 * 傷害計算機要用的欄位（熟練度、攻擊力、魔攻）還缺的話，verify.mjs 會擋下、不上正式機。
 */

const has = (values, field) => values != null && Object.prototype.hasOwnProperty.call(values, field);

const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// 樣板的固定字：空白多寡不算（「攻擊範圍 #rb」的說明是「攻擊範圍b」）
const literal = text => text.split(/\s+/).map(escape).join("\\s*");

// 遊戲文字的顏色碼（#b 藍、#r 紅、#k 黑…）：上游清顏色碼時把「#rb」（攻擊範圍）的 #r 當顏色拿掉，說明剩「b」
const COLOR_CODE = /^[bcdegknr]/;

const NUMBER = /^-?\d+(?:\.\d+)?$/;

/** 樣板 → 比對說明的正規式：每個代號一組，可以是數字、沒換掉的「#M」、被切掉顏色碼的「b」（d 旗標拿位置） */
function templatePattern(formula) {
  let source = "^\\s*";
  let last = 0;
  for (const match of formula.matchAll(/#([A-Za-z]+)/g)) {
    const field = match[1];
    const placeholders = [`#${field}`, ...(field.length > 1 && COLOR_CODE.test(field) ? [field.slice(1)] : [])];
    source += literal(formula.slice(last, match.index));
    source += `\\s*(-?\\d+(?:\\.\\d+)?|${placeholders.map(escape).join("|")})\\s*`;
    last = match.index + match[0].length;
  }
  return new RegExp(`${source}${literal(formula.slice(last))}\\s*$`, "d");
}

/**
 * skill：上游的技能（formula、valueLabels、levels[{ level, description, values }]）。
 * prev：前一版的 { labels, levels: [每一級的 values] }，沒有就 undefined。
 * 回傳 { levels, labels, filled, changed, mismatch }：
 *  - 有補：levels 是新陣列、labels 是上游表頭再加補上的欄位；filled＝用前一版補的欄位，changed＝這一版改了數值、只從說明讀的欄位
 *  - 沒補：levels 原樣（同一個陣列）、labels／filled／changed 是 undefined；說明對不上時 mismatch 寫原因
 */
export function fillLostFields(skill, prev) {
  const levels = skill.levels;
  const untouched = { levels, labels: undefined, filled: undefined, changed: undefined, mismatch: undefined };
  if (!prev?.levels?.length || !levels?.length || !skill.formula) return untouched;

  const fields = [...skill.formula.matchAll(/#([A-Za-z]+)/g)].map(match => match[1]);
  // 漏抽＝樣板有這個代號、這一版每一級都沒有、前一版有
  const lost = [...new Set(fields)].filter(
    field => !levels.some(level => has(level.values, field)) && prev.levels.some(values => has(values, field)),
  );
  if (!lost.length) return untouched;
  if (prev.levels.length !== levels.length) {
    return { ...untouched, mismatch: `上游 ${levels.length} 級、前一版 ${prev.levels.length} 級，級數對不上` };
  }

  // 每一級的說明拆開：漏抽的欄位在說明裡看得到的數字、代號的位置
  const pattern = templatePattern(skill.formula);
  const parsed = [];
  for (const [index, level] of levels.entries()) {
    const text = level.description ?? "";
    const match = pattern.exec(text);
    if (!match) return { ...untouched, mismatch: `第 ${index + 1} 級說明「${text}」跟樣板「${skill.formula}」對不上` };
    const shown = {};
    const numbers = [];
    fields.forEach((field, group) => {
      if (!NUMBER.test(match[group + 1])) return;
      numbers.push(Number(match[group + 1]));
      if (lost.includes(field)) shown[field] = Number(match[group + 1]);
    });
    parsed.push({ text, match, shown, numbers });
  }

  // 這一版改了這個技能：漏抽的欄位看得到的數字跟前一版不一樣，或說明裡有前一版這一級沒有的數字
  // （神聖祈禱 2.0.0 持續時間每級 +1 秒，樣板代號從 #y 改名 #time，只比同名欄位會漏掉）
  const changed = parsed.some(({ shown, numbers }, index) => {
    const before = prev.levels[index] ?? {};
    const known = new Set(Object.values(before));
    return (
      Object.entries(shown).some(([field, value]) => has(before, field) && before[field] !== value) ||
      numbers.some(value => !known.has(value))
    );
  });

  const filledLevels = parsed.map(({ text, match, shown }, index) => {
    const values = { ...levels[index].values, ...shown };
    if (!changed) for (const field of lost) if (!has(values, field) && has(prev.levels[index], field)) values[field] = prev.levels[index][field];
    // 說明裡代號的位置換成數字（從後面換回來，前面的位置才不會跑掉）；沒數字可換的照留
    let description = text;
    for (let group = fields.length; group >= 1; group--) {
      const field = fields[group - 1];
      if (!has(values, field) || NUMBER.test(match[group])) continue;
      const [start, end] = match.indices[group];
      description = description.slice(0, start) + String(values[field]) + description.slice(end);
    }
    return { ...levels[index], description, values };
  });

  const got = lost.filter(field => filledLevels.some(level => has(level.values, field)));
  if (!got.length) return untouched;
  const labels = { ...(skill.valueLabels ?? {}) };
  for (const field of got) if (!has(labels, field) && prev.labels?.[field]) labels[field] = prev.labels[field];
  return changed
    ? { levels: filledLevels, labels, filled: undefined, changed: got, mismatch: undefined }
    : { levels: filledLevels, labels, filled: got, changed: undefined, mismatch: undefined };
}

/**
 * 站上的 public/data/skills.json（buildSkills 的輸出）→ 前一版數值的快照：{ 技能 id: { labels, levels } }。
 * 只留至少一級有數值的技能（本來就只有說明原文的槍連擊這類、沒有 levels 的不留）。
 */
export function snapshotSkillValues(siteSkills) {
  const out = {};
  for (const skill of siteSkills) {
    if (!skill.levels?.some(values => Object.keys(values ?? {}).length)) continue;
    out[skill.id] = { labels: skill.labels ?? {}, levels: skill.levels };
  }
  return out;
}
