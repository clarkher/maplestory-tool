// 一次查價：清單、目前複製的是哪件、每張截圖讀到什麼。截圖一出現就算「剛複製的那件」（照出現順序，不照讀完順序）。
// 讀圖一張一張排隊（PowerShell 一次開一個）。讀完搬到 已記價\；辨識本身壞掉的留在原地，修好可以重來。
import fs from "node:fs";
import path from "node:path";
import { todayList, localDate, localIso } from "./list.mjs";
import { parseShot } from "./parse.mjs";
import { checkTrade } from "./checks.mjs";
import { loadData, saveData, addTrades } from "./store.mjs";
import { summarize } from "./stats.mjs";

export const DONE_DIR = "已記價";

function moveToDone(file) {
  const doneDir = path.join(path.dirname(file), DONE_DIR);
  fs.mkdirSync(doneDir, { recursive: true });
  let target = path.join(doneDir, path.basename(file));
  if (fs.existsSync(target)) target = path.join(doneDir, `${Date.now()}-${path.basename(file)}`);
  fs.renameSync(file, target);
  return path.basename(target);
}

export function createSession({ date, dataFile, ocr, now = () => new Date() }) {
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

  async function process(item, shot, file) {
    try {
      const result = parseShot(await ocr(file), { item: item.name, today });
      if (result.kind === "ok") {
        const data = loadData(dataFile);
        const prevUnitMedian = summarize(data.trades, item.name, null).median ?? null;
        const trades = result.trades.map(t => ({ ...t, flags: checkTrade(t, { today, prevUnitMedian }) }));
        shot.file = moveToDone(file);
        const { added, skipped } = addTrades(data, trades, { item: item.name, shot: shot.file, recordedAt: localIso(now()) });
        saveData(dataFile, data);
        shot.added = added.length;
        shot.skipped = skipped;
        shot.review = data.trades.filter(t => added.includes(t.id) && t.status === "review").length;
      } else {
        shot.file = moveToDone(file);
      }
      shot.status = result.kind;
      shot.reason = result.reason;
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
      const start = current ? items.findIndex(i => i.name === current) + 1 : 0;
      const order = [...items.slice(start), ...items.slice(0, start)];
      const prev = current;
      const next = order.find(i => i.name !== prev && !i.shots.some(s => s.status === "ok")) ?? null;
      current = next?.name ?? null;
      return current;
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
      queue = queue.then(() => process(item, shot, file));
      return queue;
    },
  };
}
