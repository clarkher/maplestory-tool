/**
 * 怪物圖檔：前端一律載 /assets/monster_frames/<id>.png（src/lib/data.ts 的 monsterImage），
 * 但上游偶爾讓新怪物借用別隻的圖：data.js 裡 6300001 變形雪吉拉 的圖片欄位寫的是
 * ./assets/monster_frames/6300000.png（雪吉拉），上游沒有 6300001.png。
 * 不補的話查資料的怪物卡、道具掉落來源、計算機、各規劃頁都是壞圖（2026-10-22 上游刷新時發現）。
 *
 * 做法：建置時把上游指的那張複製一份成 <id>.png，前端不用改。
 * 為什麼放在建置而不是 fetch：資料自動更新每次都先 fetch（rsync 鏡像，會把網站裡上游沒有的檔刪掉）
 * 再 build，複製放在 build 這一步，每次重新整理都會補回來，不會被鏡像洗掉。
 *
 * 用法（pipeline/build.mjs）：
 *   copyMissingFrames("public/assets/monster_frames", [{ id, image }, ...]);
 * 用法（pipeline/verify.mjs）：
 *   missingFrames(monsters, 資料夾裡的檔名);
 */
import fs from "node:fs";
import path from "node:path";

/**
 * 上游圖片欄位 → 檔名。只認 assets/monster_frames 底下單層的 png：
 * 上游是第三方資料，圖片欄位是路徑，不能讓它用 .. 或子資料夾指到別處的檔案複製進來。
 * 不合格式回 null。
 */
export function frameFileOf(image) {
  if (typeof image !== "string") return null;
  const found = /^(?:\.\/|\/)?assets\/monster_frames\/([A-Za-z0-9_-]+\.png)$/.exec(image);
  return found ? found[1] : null;
}

/**
 * 算出哪些怪要補一張 <id>.png。
 *  - monsters：[{ id, image }]，image 是上游原始紀錄的圖片欄位
 *  - existing：資料夾裡現有的檔名（陣列或 Set）
 * 回傳：
 *  - copies：[{ id, from, to }]，<id>.png 不在、上游指的另一張在 → 複製
 *  - unresolved：[{ id, image, reason }]，<id>.png 不在、也借不到圖（沒有圖片欄位、看不懂、上游指的檔也不在）
 * <id>.png 已經在的一律不動（不覆蓋、不回報）。
 */
export function planFrameCopies(monsters, existing) {
  const have = new Set(existing);
  const copies = [];
  const unresolved = [];
  for (const monster of monsters) {
    const to = `${monster.id}.png`;
    if (have.has(to)) continue;
    const from = frameFileOf(monster.image);
    if (!from) {
      unresolved.push({ id: monster.id, image: monster.image, reason: `圖片欄位不是 monster_frames 底下的 png（${monster.image ?? "空的"}）` });
    } else if (from === to || !have.has(from)) {
      unresolved.push({ id: monster.id, image: monster.image, reason: `上游指的 ${from} 不在圖檔資料夾裡` });
    } else {
      copies.push({ id: monster.id, from, to });
    }
  }
  return { copies, unresolved };
}

/**
 * 把借來的圖複製成 <id>.png（不覆蓋現有檔），每複製一張印一行；借不到的印警告，由 verify.mjs 擋下。
 * 資料夾不存在視為空的。回傳 planFrameCopies 的結果。
 */
export function copyMissingFrames(dir, monsters, { log = console.log } = {}) {
  const existing = fs.existsSync(dir)
    ? fs.readdirSync(dir, { withFileTypes: true }).filter(entry => entry.isFile()).map(entry => entry.name)
    : [];
  const plan = planFrameCopies(monsters, existing);
  for (const { id, from, to } of plan.copies) {
    fs.copyFileSync(path.join(dir, from), path.join(dir, to), fs.constants.COPYFILE_EXCL);
    log(`[monsters] 圖檔名跟 id 不同，複製一份：${id} ← ${from}`);
  }
  for (const { id, reason } of plan.unresolved) log(`[monsters] 沒有圖可用：${id} ${reason}`);
  return plan;
}

/** 資料檢查用：monsters.json 裡沒有 <id>.png 的怪，回傳 [{ id, n }]。existing 同 planFrameCopies。 */
export function missingFrames(monsters, existing) {
  const have = new Set(existing);
  return monsters.filter(monster => !have.has(`${monster.id}.png`)).map(monster => ({ id: monster.id, n: monster.n }));
}
