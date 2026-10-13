import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { createHandler } from "./routes.mjs";
import { emptyData, addTrades, saveData } from "./store.mjs";

function serve(t, handler) {
  const server = http.createServer(handler);
  return new Promise(resolve => server.listen(0, "127.0.0.1", () => {
    t.after(() => server.close());
    const base = `http://127.0.0.1:${server.address().port}`;
    resolve(async (p, body, raw) => {
      const init = raw !== undefined ? { method: "POST", headers: { "content-type": "application/json" }, body: raw }
        : body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {};
      const res = await fetch(base + p, init);
      const type = res.headers.get("content-type") ?? "";
      const buf = Buffer.from(await res.arrayBuffer());
      return { status: res.status, type, text: buf.toString("utf8"), json: type.includes("json") ? JSON.parse(buf.toString("utf8")) : null };
    });
  }));
}

function setup(t, extra = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "price-routes-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const dataFile = path.join(dir, "scania.json");
  const d = emptyData();
  addTrades(d, [
    { tradedAt: "2026-10-12", price: 1000, unitPrice: 1000, qty: 1, attrs: null, flags: [], box: null },
    { tradedAt: "2026-10-12", price: 99, unitPrice: 99, qty: 1, attrs: null, flags: ["跟上次中間價差 5 倍以上"], box: { x: 1, y: 2, w: 3, h: 4 } },
  ], { item: "日之鏢", shot: "a.png", recordedAt: "2026-10-13T21:00:00+08:00" });
  saveData(dataFile, d);
  const shotsDir = path.join(dir, "shots");
  fs.mkdirSync(path.join(shotsDir, "已記價"), { recursive: true });
  fs.writeFileSync(path.join(shotsDir, "已記價", "a.png"), "png");
  let current = null;
  const session = {
    state: () => ({ today: "2026-10-13", current, orphans: [], items: [] }),
    copyNext: () => (current = "日之鏢"),
    setCurrent: n => {
      if (n !== "日之鏢" && n !== "雷之鏢") throw new Error(`今天的清單裡沒有「${n}」`);
      current = n;
    },
  };
  const handler = createHandler({ session, dataFile, shotsDir, getFx: () => null, publish: () => ({ committed: true, pushed: true, sha: "abc" }), ...extra });
  return { handler, dataFile, shotsDir };
}

test("state、next、current", async t => {
  const { handler } = setup(t);
  const get = await serve(t, handler);
  assert.equal((await get("/api/state")).json.server, "雪吉拉");
  assert.equal((await get("/api/next", {})).json.name, "日之鏢");
  assert.equal((await get("/api/current", { name: "雷之鏢" })).json.ok, true);
  assert.equal((await get("/api/state")).json.current, "雷之鏢");
  assert.equal((await get("/api/state")).json.fx.available, false);
});

test("current 給了清單裡沒有的名字：400 加原因，不是 500", async t => {
  const { handler } = setup(t);
  const get = await serve(t, handler);
  const r = await get("/api/current", { name: "不存在的東西" });
  assert.equal(r.status, 400);
  assert.equal(r.json.ok, false);
  assert.match(r.json.error, /不存在的東西/);
});

test("body 不是 JSON：400，不是 500", async t => {
  const { handler } = setup(t);
  const get = await serve(t, handler);
  const r = await get("/api/trade", undefined, "{壞掉");
  assert.equal(r.status, 400);
  assert.ok(r.json.error);
});

test("state 帶監看出錯的原因（沒出錯是 null）", async t => {
  const a = setup(t);
  const getA = await serve(t, a.handler);
  assert.equal((await getA("/api/state")).json.watchError, null);
  const b = setup(t, { getWatchError: () => "截圖資料夾被刪了" });
  const getB = await serve(t, b.handler);
  assert.equal((await getB("/api/state")).json.watchError, "截圖資料夾被刪了");
});

test("state 有匯率資料時 available 是 true、帶更新時間", async t => {
  const { handler } = setup(t, { getFx: () => ({ updatedAt: "2026-10-13T12:00:00Z", days: [{ date: "2026-10-12", close: 100 }] }) });
  const get = await serve(t, handler);
  assert.deepEqual((await get("/api/state")).json.fx, { available: true, updatedAt: "2026-10-13T12:00:00Z" });
});

test("summary 9 件全列；item 有走勢跟明細；review 只有黃色", async t => {
  const { handler } = setup(t);
  const get = await serve(t, handler);
  const rows = (await get("/api/summary")).json.rows;
  assert.equal(rows.length, 9);
  assert.equal(rows.find(r => r.item === "日之鏢").median, 1000);
  const item = (await get(`/api/item?name=${encodeURIComponent("日之鏢")}`)).json;
  assert.equal(item.trades.length, 2);
  assert.deepEqual(item.series[0].points, [{ date: "2026-10-12", median: 1000, count: 1 }]);
  assert.equal((await get("/api/review")).json.trades.length, 1);
});

test("trade 確認後 review 清空；finish 回 push 結果", async t => {
  const { handler } = setup(t);
  const get = await serve(t, handler);
  const id = (await get("/api/review")).json.trades[0].id;
  assert.equal((await get("/api/trade", { id, action: "confirm" })).json.ok, true);
  assert.equal((await get("/api/review")).json.trades.length, 0);
  assert.equal((await get("/api/finish", {})).json.pushed, true);
});

test("trade 做不到的（亂填、找不到、沒有這個動作）回 400 且資料不動", async t => {
  const { handler, dataFile } = setup(t);
  const get = await serve(t, handler);
  const id = (await get("/api/review")).json.trades[0].id;
  const before = fs.readFileSync(dataFile, "utf8");
  const bad = await get("/api/trade", { id, action: "edit", patch: { price: 99, unitPrice: 50, qty: 1 } });
  assert.equal(bad.status, 400);
  assert.equal(bad.json.ok, false);
  assert.equal((await get("/api/trade", { id: "nope", action: "delete" })).status, 400);
  assert.equal((await get("/api/trade", { id, action: "亂來" })).status, 400);
  assert.equal(fs.readFileSync(dataFile, "utf8"), before);
  assert.equal((await get("/api/review")).json.trades.length, 1);
});

test("trade 改成對得起來的數字：存起來、變確認過", async t => {
  const { handler } = setup(t);
  const get = await serve(t, handler);
  const id = (await get("/api/review")).json.trades[0].id;
  assert.equal((await get("/api/trade", { id, action: "edit", patch: { price: 990, unitPrice: 99, qty: 10 } })).json.ok, true);
  assert.equal((await get("/api/review")).json.trades.length, 0);
});

test("finish 推失敗：500 加原因", async t => {
  const { handler } = setup(t, { publish: () => { throw new Error("不在 price-data 分支上，不推"); } });
  const get = await serve(t, handler);
  const r = await get("/api/finish", {});
  assert.equal(r.status, 500);
  assert.match(r.json.error, /price-data/);
});

test("shot 只給已記價裡的檔名；擋路徑穿越", async t => {
  const { handler } = setup(t);
  const get = await serve(t, handler);
  assert.equal((await get("/shot?file=a.png")).status, 200);
  assert.equal((await get("/shot?file=a.png")).type, "image/png");
  assert.equal((await get(`/shot?file=${encodeURIComponent("../scania.json")}`)).status, 400);
  assert.equal((await get(`/shot?file=${encodeURIComponent("..\\scania.json")}`)).status, 400);
  assert.equal((await get(`/shot?file=${encodeURIComponent("sub/a.png")}`)).status, 400);
  assert.equal((await get(`/shot?file=${encodeURIComponent("a\\b.png")}`)).status, 400);
  assert.equal((await get("/shot")).status, 400);
  assert.equal((await get("/shot?file=nope.png")).status, 404);
});

test("shot：搬不進已記價、留在截圖資料夾根目錄的也找得到；兩邊都有先給已記價的", async t => {
  const { handler, shotsDir } = setup(t);
  const get = await serve(t, handler);
  fs.writeFileSync(path.join(shotsDir, "stuck.png"), "root-copy");
  const stuck = await get("/shot?file=stuck.png");
  assert.equal(stuck.status, 200);
  assert.equal(stuck.text, "root-copy");
  fs.writeFileSync(path.join(shotsDir, "a.png"), "root-copy");
  assert.equal((await get("/shot?file=a.png")).text, "png", "已記價裡的優先");
});

test("shot 的路徑是資料夾、不是檔案：404，不是 500", async t => {
  const { handler, shotsDir } = setup(t);
  const get = await serve(t, handler);
  fs.mkdirSync(path.join(shotsDir, "dir.png"));
  assert.equal((await get("/shot?file=dir.png")).status, 404);
});

test("頁面跟靜態檔", async t => {
  const { handler } = setup(t);
  const get = await serve(t, handler);
  assert.match((await get("/")).type, /text\/html/);
  assert.match((await get("/app.js")).type, /javascript/);
  assert.match((await get("/style.css")).type, /text\/css/);
  assert.equal((await get("/nope")).status, 404);
});
