// 一次查價：清單、目前複製的是哪件、每張截圖讀到什麼。截圖一出現就算「剛複製的那件」（照出現順序，不照讀完順序）。
// 讀圖一張一張排隊（PowerShell 一次開一個）。讀完搬到 已記價\。
// 留在原地的有兩種：辨識本身壞掉的（status error，頁面寫原因；檔案還在資料夾，要重來就重新截一張）、
// 不是拍賣市價頁的截圖（路過的 Win+PrtSc，不搬、不算進任何一件，只記在 orphans）。
import fs from "node:fs";
import path from "node:path";
import { todayList, localDate, localIso } from "./list.mjs";
import { parseShot } from "./parse.mjs";
import { checkTrade } from "./checks.mjs";
import { loadData, saveData, addTrades } from "./store.mjs";
import { prevMedianFor } from "./stats.mjs";

export const DONE_DIR = "已記價";

function moveToDone(file) {
  const doneDir = path.join(path.dirname(file), DONE_DIR);
  fs.mkdirSync(doneDir, { recursive: true });
  let target = path.join(doneDir, path.basename(file));
  if (fs.existsSync(target)) target = path.join(doneDir, `${Date.now()}-${path.basename(file)}`);
  fs.renameSync(file, target);
  return path.basename(target);
}

export function createSession({ date, dataFile, ocr, now = () => new Date(), move = moveToDone, retryMs = 200 }) {
  const today = localDate(date);
  const items = todayList(date).map(x => ({ ...x, shots: [] }));
  const orphans = [];
  let current = null;
  let queue = Promise.resolve();

  const find = name => items.find(i => i.name === name);
  const statusOf = item => {
    if (item.name === current) return "current";
    if (item.shots.some(s => s.status === "ok")) return "done";
    if (item.shots.length) return "retry";
    return "todo";
  };

  async function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  async function processShot(item, shot, file) {
    try {
      const result = parseShot(await ocr(file), { item: item.name, today });

      // 不是拍賣市價頁（使用者隨手按的 Win+PrtSc）：不搬、不算進這件，只在頁面註明「略過」
      if (result.kind === "not-auction") {
        const i = item.shots.indexOf(shot);
        if (i >= 0) item.shots.splice(i, 1);
        orphans.push({ file: shot.file, reason: `${result.reason}（留在原地）` });
        return;
      }

      // 先搬檔案（其餘結果都搬）
      let movedName = shot.file;
      let moveFailed = false;
      try {
        for (let attempt = 0; attempt < 5; attempt++) {
          try {
            movedName = move(file);
            break;
          } catch (e) {
            if (attempt < 4) {
              await sleep(retryMs);
            } else {
              throw e;
            }
          }
        }
      } catch (e) {
        moveFailed = true;
        movedName = path.basename(file);
      }

      shot.file = movedName;
      shot.status = result.kind;
      shot.reason = result.reason;
      if (moveFailed) {
        shot.moveFailed = true;
        shot.reason += (shot.reason ? " " : "") + "（截圖沒搬到已記價，留在原地）";
      }

      if (result.kind === "ok") {
        try {
          const data = loadData(dataFile);
          // 每一筆各自跟「上次中間價」比；裝備（黃色雨傘）只跟同屬性的比
          const trades = result.trades.map(t => ({ ...t, flags: checkTrade(t, { today, prevUnitMedian: prevMedianFor(data.trades, item.name, t.attrs) }) }));
          const { added, skipped } = addTrades(data, trades, { item: item.name, shot: shot.file, recordedAt: localIso(now()) });
          saveData(dataFile, data);
          shot.added = added.length;
          shot.skipped = skipped;
          shot.review = data.trades.filter(t => added.includes(t.id) && t.status === "review").length;
        } catch (e) {
          shot.status = "error";
          shot.reason = `讀圖成功但存檔失敗：${e.message}`;
        }
      }
    } catch (e) {
      shot.status = "error";
      shot.reason = `讀圖失敗：${e.message}`;
    }
  }

  return {
    today,
    state() {
      return {
        today, current,
        orphans: orphans.map(o => ({ ...o })),
        items: items.map(i => ({ name: i.name, freq: i.freq, status: statusOf(i), shots: i.shots.map(s => ({ ...s })) })),
      };
    },
    copyNext() {
      // 找全部完成的判斷
      const allDone = items.every(i => i.shots.some(s => s.status === "ok"));
      if (allDone) {
        current = null;
        return null;
      }

      // 找下一個未完成的項
      const start = current ? items.findIndex(i => i.name === current) + 1 : 0;
      const order = [...items.slice(start), ...items.slice(0, start)];
      const prev = current;
      const next = order.find(i => i.name !== prev && !i.shots.some(s => s.status === "ok")) ?? null;

      if (next) {
        current = next.name;
        return current;
      }

      // 沒有其他未完成項，回傳目前項（如果目前項本身未完成）
      if (current) {
        const curr = find(current);
        if (curr && !curr.shots.some(s => s.status === "ok")) {
          return current;
        }
      }

      // 全部完成
      current = null;
      return null;
    },
    setCurrent(name) {
      if (!find(name)) throw new Error(`今天的清單裡沒有「${name}」`);
      current = name;
    },
    handleShot(file) {
      const item = current ? find(current) : null;
      if (!item) {
        orphans.push({ file: path.basename(file), reason: "還沒按「複製下一件」，不知道這張是哪一件" });
        return Promise.resolve();
      }
      const shot = { file: path.basename(file), status: "reading", reason: "", added: 0, skipped: 0, review: 0 };
      item.shots.push(shot);
      queue = queue.then(() => processShot(item, shot, file)).catch(() => {});
      return queue;
    },
  };
}
