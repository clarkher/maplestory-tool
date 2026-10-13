import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createSession, DONE_DIR } from "./session.mjs";
import { loadData } from "./store.mjs";

/** 假的辨識：檔名 → 這張圖的文字列 */
function fakeOcr(byName) {
  return async file => {
    const rows = byName[path.basename(file)];
    if (rows === "boom") throw new Error("engine missing");
    return {
      width: 1366, height: 768, meanLuma: rows === "black" ? 2 : 120, stdLuma: rows === "black" ? 1 : 40,
      lines: (rows === "black" ? [] : rows).map((words, i) => ({ text: words.join(" "), words: words.map((text, j) => ({ text, x: j * 40, y: i * 30, w: 30, h: 16 })) })),
    };
  };
}

function setup(t, byName) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "price-session-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const shots = path.join(dir, "shots");
  fs.mkdirSync(shots);
  const shot = name => { const f = path.join(shots, name); fs.writeFileSync(f, "png"); return f; };
  const dataFile = path.join(dir, "data", "auction", "scania.json");
  const s = createSession({ date: new Date(2026, 9, 13), dataFile, ocr: fakeOcr(byName), now: () => new Date(2026, 9, 13, 21, 0, 0) });
  return { s, shot, shots, dataFile };
}

const page = [["市", "價"]];
const glove = p => ["手", "套", "攻", "擊", "卷", "軸", "10", "%", p, "2026/10/12"];

test("複製下一件照清單順序，查完的跳過，全部查完回 null", async t => {
  const { s, shot } = setup(t, { "a.png": [...page, glove("1,320,000")] });
  assert.equal(s.copyNext(), "手套攻擊卷軸10%");
  await s.handleShot(shot("a.png"));
  assert.equal(s.copyNext(), "手套攻擊卷軸60%");
  for (let i = 0; i < 3; i++) s.copyNext();
  assert.equal(s.state().current, "寵物速度卷軸100%");
  assert.equal(s.copyNext(), "手套攻擊卷軸60%", "繞回去還沒查的，查完的 10% 跳過");
  // 全部查完回 null（新增 assertion）
  for (let i = 0; i < 100; i++) if (s.copyNext() === null) break;
  assert.equal(s.copyNext(), null, "全部查完回 null");
});

test("截圖對到剛複製那件：存進資料、搬到已記價", async t => {
  const { s, shot, shots, dataFile } = setup(t, { "a.png": [...page, glove("1,320,000"), glove("1,280,000")] });
  s.copyNext();
  await s.handleShot(shot("a.png"));
  const item = s.state().items[0];
  assert.equal(item.status, "current");
  assert.deepEqual(item.shots.map(x => [x.status, x.added]), [["ok", 2]]);
  assert.equal(loadData(dataFile).trades.length, 2);
  assert.ok(fs.existsSync(path.join(shots, DONE_DIR, "a.png")));
  assert.equal(fs.existsSync(path.join(shots, "a.png")), false);
  s.copyNext();
  assert.equal(s.state().items[0].status, "done");
});

test("同一張再截一次：重複的略過", async t => {
  const { s, shot } = setup(t, { "a.png": [...page, glove("1,320,000")], "b.png": [...page, glove("1,320,000")] });
  s.copyNext();
  await s.handleShot(shot("a.png"));
  await s.handleShot(shot("b.png"));
  assert.deepEqual(s.state().items[0].shots.map(x => [x.added, x.skipped]), [[1, 0], [0, 1]]);
});

test("品名對不上、黑畫面、辨識壞掉：寫原因，不存", async t => {
  const { s, shot, dataFile, shots } = setup(t, {
    "w.png": [...page, ["日", "之", "鏢", "350,000", "2026/10/12"]], "k.png": "black", "e.png": "boom",
  });
  s.copyNext();
  await s.handleShot(shot("w.png"));
  await s.handleShot(shot("k.png"));
  await s.handleShot(shot("e.png"));
  const sh = s.state().items[0].shots;
  assert.deepEqual(sh.map(x => x.status), ["wrong-item", "black", "error"]);
  assert.equal(sh[0].reason, "對不上，請重截");
  assert.match(sh[2].reason, /engine missing/);
  assert.equal(loadData(dataFile).trades.length, 0);
  assert.ok(fs.existsSync(path.join(shots, "e.png")), "辨識壞掉的留在原地");
  s.copyNext();
  assert.equal(s.state().items[0].status, "retry");
});

test("還沒按複製下一件就截圖：記下來、不知道是哪件", async t => {
  const { s, shot } = setup(t, {});
  await s.handleShot(shot("x.png"));
  assert.match(s.state().orphans[0].reason, /複製下一件/);
});

test("跟上次中間價差 5 倍的那筆存成黃色", async t => {
  const { s, shot, dataFile } = setup(t, { "a.png": [...page, glove("1,000,000")], "b.png": [...page, glove("9,000,000")] });
  s.copyNext();
  await s.handleShot(shot("a.png"));
  await s.handleShot(shot("b.png"));
  const trades = loadData(dataFile).trades;
  assert.deepEqual(trades.map(x => x.status), ["ok", "review"]);
  assert.equal(s.state().items[0].shots[1].review, 1);
});

test("handleShot 不 await 再按 copyNext，截圖對到該項", async t => {
  const { s, shot } = setup(t, { "a.png": [...page, glove("1,320,000")] });
  s.copyNext();
  s.handleShot(shot("a.png")); // 不 await
  assert.equal(s.state().items[0].shots.length, 1, "截圖已記下");
  const promise = s.state().items[0].shots[0]; // 要 await 才能讀到結果
  const nextName = s.copyNext();
  assert.equal(nextName, "手套攻擊卷軸60%", "copyNext 推進");
  await new Promise(r => setTimeout(r, 50)); // 等 OCR 完成
  assert.equal(s.state().items[0].shots[0].status, "ok", "第一項已完成");
});

test("OCR 最多一次一張（不並行）", async t => {
  let concurrency = 0, maxConcurrency = 0;
  function fakeOcrSerial(byName) {
    return async file => {
      concurrency++;
      maxConcurrency = Math.max(maxConcurrency, concurrency);
      await new Promise(r => setTimeout(r, 50));
      concurrency--;
      const rows = byName[path.basename(file)];
      return {
        width: 1366, height: 768, meanLuma: 120, stdLuma: 40,
        lines: (rows || []).map((words, i) => ({ text: words.join(" "), words: words.map((text, j) => ({ text, x: j * 40, y: i * 30, w: 30, h: 16 })) })),
      };
    };
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "price-serial-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const shots = path.join(dir, "shots");
  fs.mkdirSync(shots);
  const shot = name => { const f = path.join(shots, name); fs.writeFileSync(f, "png"); return f; };
  const dataFile = path.join(dir, "data.json");
  const s = createSession({ date: new Date(2026, 9, 13), dataFile, ocr: fakeOcrSerial({ "a.png": [...page, glove("1,000,000")], "b.png": [...page, glove("2,000,000")], "c.png": [...page, glove("3,000,000")] }) });
  s.copyNext();
  s.handleShot(shot("a.png"));
  s.handleShot(shot("b.png"));
  s.handleShot(shot("c.png"));
  await new Promise(r => setTimeout(r, 300)); // 等全部完成
  assert.equal(maxConcurrency, 1, "最多同時一張");
});

test("所有件都有 ok 截圖時 copyNext 回 null", async t => {
  const { s, shot, dataFile } = setup(t, { "a.png": [...page, glove("1,000,000")] });
  for (const item of s.state().items) {
    s.copyNext();
    await s.handleShot(shot(`${item.name}.png`));
  }
  assert.equal(s.copyNext(), null, "全部完成回 null");
  assert.equal(s.state().current, null, "current 也是 null");
});

test("只有目前件未完成時 copyNext 回該件", async t => {
  const { s, shot, dataFile } = setup(t, { "retry.png": [...page, ["讀", "不", "到"]] });
  // 完成除了手套10%以外的所有項
  s.copyNext(); // 手套 10%
  await s.handleShot(shot("retry.png")); // 讀不到，手套 10% 仍未完成
  // 把其他所有項都完成
  const allItems = s.state().items;
  for (let i = 1; i < allItems.length; i++) {
    s.copyNext();
    await s.handleShot(shot(`dummy-${i}.png`));
  }
  // 現在只有手套 10% 未完成
  const current = s.state().current;
  assert.equal(current, "手套攻擊卷軸10%", "當前項應是手套10%");
  const result = s.copyNext();
  assert.equal(result, current, "沒有其他未完成項時回本身");
});

test("截圖搬檔失敗時：存成 ok、標 moveFailed、理由加註、檔案留原地、存檔用原檔名", async t => {
  const { s, shot, shots, dataFile } = setup(t, { "a.png": [...page, glove("1,320,000")] });
  let moveAttempts = 0;
  const failMove = () => {
    moveAttempts++;
    throw new Error("Permission denied");
  };
  const sWithFailMove = createSession({
    date: new Date(2026, 9, 13),
    dataFile,
    ocr: fakeOcr({ "a.png": [...page, glove("1,320,000")] }),
    now: () => new Date(2026, 9, 13, 21, 0, 0),
    move: failMove,
    retryMs: 10, // 測試用快速重試
  });
  sWithFailMove.copyNext();
  await sWithFailMove.handleShot(shot("a.png"));
  const shot0 = sWithFailMove.state().items[0].shots[0];
  assert.equal(shot0.status, "ok", "OCR 成功時 status ok");
  assert.equal(shot0.moveFailed, true, "moveFailed 標記");
  assert.match(shot0.reason, /留在原地/, "reason 含留在原地");
  assert.equal(shot0.file, "a.png", "file 是原檔名");
  assert.ok(fs.existsSync(path.join(shots, "a.png")), "檔案留原地");
  assert.equal(loadData(dataFile).trades.length, 1, "資料存進去");
  assert.ok(moveAttempts >= 5, "重試了 5 次");
});

test("截圖搬檔時名字碰撞：新檔名寫進 shot.file", async t => {
  const { s, shot, shots, dataFile } = setup(t, { "a.png": [...page, glove("1,320,000")] });
  const doneDir = path.join(shots, DONE_DIR);
  fs.mkdirSync(doneDir, { recursive: true });
  fs.writeFileSync(path.join(doneDir, "a.png"), "existing"); // 搶先佔位
  s.copyNext();
  await s.handleShot(shot("a.png"));
  const shot0 = s.state().items[0].shots[0];
  assert.notEqual(shot0.file, "a.png", "檔名改了");
  assert.ok(fs.existsSync(path.join(doneDir, shot0.file)), "新檔名存在");
});
