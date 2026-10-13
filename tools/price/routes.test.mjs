import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import net from "node:net";
import { createHandler } from "./routes.mjs";
import { emptyData, addTrades, saveData, loadData } from "./store.mjs";

function serve(t, handler) {
  const server = http.createServer(handler);
  return new Promise(resolve => server.listen(0, "127.0.0.1", () => {
    t.after(() => server.close());
    const port = server.address().port;
    const base = `http://127.0.0.1:${port}`;
    const get = async (p, body, raw) => {
      const init = raw !== undefined ? { method: "POST", headers: { "content-type": "application/json" }, body: raw }
        : body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {};
      const res = await fetch(base + p, init);
      const type = res.headers.get("content-type") ?? "";
      const buf = Buffer.from(await res.arrayBuffer());
      return { status: res.status, type, text: buf.toString("utf8"), json: type.includes("json") ? JSON.parse(buf.toString("utf8")) : null };
    };
    get.port = port;
    resolve(get);
  }));
}

/** 直接寫原始請求行（fetch 不會送出壞網址）；收到「網址不對」或 1.5 秒後，回傳收到的字 */
function rawRequest(port, text) {
  return new Promise(resolve => {
    let buf = "";
    let finished = false;
    const sock = net.connect(port, "127.0.0.1", () => sock.write(text));
    const timer = setTimeout(() => finish(), 1500);
    function finish() {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      sock.destroy();
      resolve(buf);
    }
    sock.on("data", c => { buf += c; if (buf.includes("網址不對")) finish(); });
    sock.on("error", finish);
    sock.on("close", finish);
  });
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
  assert.deepEqual(item.series[0].points, [{ date: "2026-10-12", median: 1000, count: 1, ntd: null }]);
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

test("shot 只給 .png：別的副檔名（就算檔案在）一律 400", async t => {
  const { handler, shotsDir } = setup(t);
  const get = await serve(t, handler);
  fs.writeFileSync(path.join(shotsDir, "已記價", "notes.txt"), "secret");
  fs.writeFileSync(path.join(shotsDir, "已記價", "x.png.json"), "{}");
  assert.equal((await get("/shot?file=notes.txt")).status, 400);
  assert.equal((await get("/shot?file=x.png.json")).status, 400);
  assert.equal((await get("/shot?file=a")).status, 400);
  fs.writeFileSync(path.join(shotsDir, "已記價", "B.PNG"), "upper");
  assert.equal((await get("/shot?file=B.PNG")).status, 200, "副檔名大小寫不拘");
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

test("壞網址（GET //[）：回 400，工具不會當掉，接著照常回應", async t => {
  const { handler } = setup(t);
  const get = await serve(t, handler);
  const raw = await rawRequest(get.port, "GET //[ HTTP/1.1\r\nHost: x\r\n\r\n");
  assert.match(raw, /^HTTP\/1\.1 400 /);
  assert.match(raw, /網址不對/);
  assert.equal((await get("/api/state")).status, 200, "壞網址之後伺服器還活著");
});

test("handler 不管哪裡丟錯都不會變成沒人接的 rejection（連回應都寫不出去也一樣）", async t => {
  const { handler } = setup(t);
  const rejections = [];
  const onRej = e => rejections.push(e);
  process.on("unhandledRejection", onRej);
  t.after(() => process.off("unhandledRejection", onRej));
  const res = { writeHead() { throw new Error("連線已經斷了"); }, end() {}, headersSent: false, destroyed: true };
  await handler({ url: "//[", method: "GET", on() {} }, res);
  await handler({ url: "/api/state", method: "GET", on() {} }, res);
  await new Promise(r => setTimeout(r, 50));
  assert.deepEqual(rejections, []);
});

test("body 是 null、陣列、數字、字串：400（不是 500），資料不動", async t => {
  const { handler, dataFile } = setup(t);
  const get = await serve(t, handler);
  const before = fs.readFileSync(dataFile, "utf8");
  for (const raw of ["null", "[1,2]", "5", '"abc"', "true"]) {
    for (const p of ["/api/trade", "/api/current"]) {
      const r = await get(p, undefined, raw);
      assert.equal(r.status, 400, `${p} 收到 ${raw}`);
      assert.match(r.json.error, /JSON 物件/);
    }
  }
  assert.equal(fs.readFileSync(dataFile, "utf8"), before);
});

test("item 的走勢：每個點用自己那天的匯率換台幣；沒有匯率的天是 null", async t => {
  const { handler, dataFile } = setup(t, {
    getFx: () => ({ updatedAt: "x", days: [{ date: "2026-10-11", close: 2000 }, { date: "2026-10-12", close: 3000 }] }),
  });
  const d = emptyData();
  const rec = day => ({ item: "手套攻擊卷軸10%", shot: "a.png", recordedAt: `${day}T21:00:00+08:00` });
  const one = (day, price) => [{ tradedAt: day, price, unitPrice: price, qty: 1, attrs: null, flags: [], box: null }];
  addTrades(d, one("2026-10-01", 50_000_000), rec("2026-10-01"));
  addTrades(d, one("2026-10-11", 50_000_000), rec("2026-10-11"));
  addTrades(d, one("2026-10-12", 50_000_000), rec("2026-10-12"));
  saveData(dataFile, d);
  const get = await serve(t, handler);
  const item = (await get(`/api/item?name=${encodeURIComponent("手套攻擊卷軸10%")}`)).json;
  assert.deepEqual(item.series[0].points.map(p => [p.date, p.ntd]), [
    ["2026-10-01", null],
    ["2026-10-11", 1000],
    ["2026-10-12", 1500],
  ]);
});

test("item 的走勢：缺的那天往前最多 3 天找匯率", async t => {
  const { handler, dataFile } = setup(t, { getFx: () => ({ updatedAt: "x", days: [{ date: "2026-10-09", close: 2000 }] }) });
  const d = emptyData();
  addTrades(d, [{ tradedAt: "2026-10-11", price: 50_000_000, unitPrice: 50_000_000, qty: 1, attrs: null, flags: [], box: null }], { item: "日之鏢", shot: "a.png", recordedAt: "2026-10-11T21:00:00+08:00" });
  saveData(dataFile, d);
  const get = await serve(t, handler);
  const item = (await get(`/api/item?name=${encodeURIComponent("日之鏢")}`)).json;
  assert.equal(item.series[0].points[0].ntd, 1000);
});

test("資料檔有變才重讀：沒變不重讀；外面改了、或從 trade 改了，下一次就讀新的", async t => {
  let reads = 0;
  const { handler, dataFile } = setup(t, { readData: file => { reads++; return loadData(file); } });
  const get = await serve(t, handler);
  await get("/api/summary");
  await get("/api/review");
  await get(`/api/item?name=${encodeURIComponent("日之鏢")}`);
  await get("/api/summary");
  assert.equal(reads, 1, "四次請求、檔案沒變，只讀一次");
  // 外面（截圖流程）寫了新資料：大小跟時間都變，下一次要讀到
  const d = loadData(dataFile);
  addTrades(d, [{ tradedAt: "2026-10-12", price: 4321, unitPrice: 4321, qty: 1, attrs: null, flags: [], box: null }], { item: "雷之鏢", shot: "b.png", recordedAt: "2026-10-13T22:00:00+08:00" });
  saveData(dataFile, d);
  const rows = (await get("/api/summary")).json.rows;
  assert.equal(reads, 2);
  assert.equal(rows.find(r => r.item === "雷之鏢").median, 4321);
  // 從頁面按「刪掉這筆」：寫完下一次讀到的是新的
  const id = (await get("/api/review")).json.trades[0].id;
  assert.equal((await get("/api/trade", { id, action: "delete" })).json.ok, true);
  assert.equal((await get("/api/review")).json.trades.length, 0);
  // 檔案被刪掉：當成空資料，不要拿舊的
  fs.rmSync(dataFile);
  assert.equal((await get("/api/summary")).json.rows.find(r => r.item === "日之鏢").count, 0);
});
