// 本機查價頁的 API（server.mjs 只負責接線；這裡可以單獨測）
import fs from "node:fs";
import path from "node:path";
import { SERVER, ALL_ITEMS, EQUIPS } from "./list.mjs";
import { loadData, saveData, confirmTrade, deleteTrade, editTrade } from "./store.mjs";
import { summarize, series, attrKey, MIN_TREND_DAYS } from "./stats.mjs";
import { fxFor, toNtd } from "./fx.mjs";
import { DONE_DIR } from "./session.mjs";

const PAGE_DIR = path.join(import.meta.dirname, "page");
const STATIC = { "/": ["index.html", "text/html; charset=utf-8"], "/app.js": ["app.js", "text/javascript; charset=utf-8"], "/style.css": ["style.css", "text/css; charset=utf-8"] };

const send = (res, status, body, type = "application/json; charset=utf-8") => {
  res.writeHead(status, { "content-type": type, "cache-control": "no-store" });
  res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
};

class BadRequest extends Error {}

/** body 要是 JSON 物件（空 body 當 {}）；null、陣列、數字、字串都算壞掉 */
const readBody = req => new Promise((resolve, reject) => {
  let s = "";
  let settled = false;
  const done = fn => v => { if (!settled) { settled = true; fn(v); } };
  const ok = done(resolve), bad = done(reject);
  req.on("data", c => { s += c; });
  req.on("end", () => {
    let v;
    try { v = s ? JSON.parse(s) : {}; } catch { return bad(new BadRequest("送來的資料不是 JSON")); }
    if (v === null || typeof v !== "object" || Array.isArray(v)) return bad(new BadRequest("送來的資料要是 JSON 物件"));
    ok(v);
  });
  req.on("error", bad);
  req.on("close", () => bad(new BadRequest("連線中途斷了")));
});

/** 截圖先找 已記價\，找不到再找截圖資料夾根目錄（搬不進已記價的會留在那裡） */
function findShot(shotsDir, file) {
  for (const dir of [path.join(shotsDir, DONE_DIR), shotsDir]) {
    const full = path.join(dir, file);
    try {
      if (fs.statSync(full).isFile()) return full;
    } catch { /* 這個資料夾沒有，找下一個 */ }
  }
  return null;
}

/**
 * 資料檔每次請求只 stat 一下，時間跟大小沒變就用上次讀的（頁面每秒打好幾支 API，檔案大了不能每次重讀）。
 * 截圖流程（session）自己也會寫這個檔，所以認檔案不認「誰寫的」；從這裡寫的另外直接清掉快取。
 * 讀出來的物件只准讀不准改；要改的（trade）一律另讀一份。
 */
function makeReader(dataFile, readData) {
  let cached = null; // { key, data }
  const read = () => {
    let key;
    try {
      const st = fs.statSync(dataFile);
      key = `${st.mtimeMs}:${st.size}:${st.ino}`;
    } catch (e) {
      key = e.code === "ENOENT" ? "missing" : null; // 其他 stat 錯誤不快取，讓 loadData 自己報原因
    }
    if (key !== null && cached?.key === key) return cached.data;
    const data = readData(dataFile);
    cached = key === null ? null : { key, data };
    return data;
  };
  read.invalidate = () => { cached = null; };
  return read;
}

const ntdOf = (median, date, days) => {
  const fx = fxFor(date, days);
  return fx ? Math.round(toNtd(median, fx.close) * 10) / 10 : null;
};

export function createHandler({ session, dataFile, shotsDir, getFx, publish, getWatchError = () => null, readData = loadData }) {
  const readCached = makeReader(dataFile, readData);

  async function handle(req, res) {
    let url;
    try {
      url = new URL(req.url, "http://localhost");
    } catch {
      return send(res, 400, { error: "網址不對" });
    }
    const p = url.pathname;
    if (req.method === "GET" && STATIC[p]) {
      const [file, type] = STATIC[p];
      return send(res, 200, fs.readFileSync(path.join(PAGE_DIR, file)), type);
    }
    if (req.method === "GET" && p === "/api/state") {
      const fx = getFx();
      return send(res, 200, {
        server: SERVER, ...session.state(),
        fx: { available: !!fx?.days?.length, updatedAt: fx?.updatedAt ?? null },
        watchError: getWatchError() ?? null,
      });
    }
    if (req.method === "POST" && p === "/api/next") return send(res, 200, { name: session.copyNext() });
    if (req.method === "POST" && p === "/api/current") {
      const { name } = await readBody(req);
      try {
        session.setCurrent(name);
      } catch (e) {
        return send(res, 400, { ok: false, error: e.message });
      }
      return send(res, 200, { ok: true });
    }
    if (req.method === "GET" && p === "/api/summary") {
      const trades = readCached().trades;
      const days = getFx()?.days ?? null;
      return send(res, 200, { rows: ALL_ITEMS.map(item => summarize(trades, item, days)) });
    }
    if (req.method === "GET" && p === "/api/item") {
      const name = url.searchParams.get("name");
      const trades = readCached().trades;
      const days = getFx()?.days ?? null;
      const mine = trades.filter(t => t.item === name);
      const keys = EQUIPS.has(name) ? [...new Set(mine.filter(t => t.status === "ok").map(t => attrKey(t.attrs)))].sort() : [null];
      return send(res, 200, {
        summary: summarize(trades, name, days),
        // 台幣每個點用「那一天」的匯率算（不是拿最新一天的匯率套全部）；那天沒有匯率就是 null
        series: keys.map(key => ({ key, points: series(trades, name, key).map(pt => ({ ...pt, ntd: ntdOf(pt.median, pt.date, days) })) })),
        trades: [...mine].sort((a, b) => b.tradedAt.localeCompare(a.tradedAt)),
        minTrendDays: MIN_TREND_DAYS,
      });
    }
    if (req.method === "GET" && p === "/api/review") {
      return send(res, 200, { trades: readCached().trades.filter(t => t.status === "review") });
    }
    if (req.method === "POST" && p === "/api/trade") {
      const { id, action, patch } = await readBody(req);
      const data = readData(dataFile); // 要改的另讀一份，不動快取裡那份
      const ok = action === "confirm" ? confirmTrade(data, id) : action === "delete" ? deleteTrade(data, id) : action === "edit" ? editTrade(data, id, patch ?? {}) : false;
      if (ok) {
        saveData(dataFile, data);
        readCached.invalidate();
      }
      return send(res, ok ? 200 : 400, { ok });
    }
    if (req.method === "POST" && p === "/api/finish") {
      try { return send(res, 200, await publish()); } catch (e) { return send(res, 500, { error: e.message }); }
    }
    if (req.method === "GET" && p === "/shot") {
      const file = url.searchParams.get("file") ?? "";
      if (!file || file !== path.basename(file) || /[\\/]/.test(file) || file.includes("..") || !/\.png$/i.test(file)) return send(res, 400, { error: "檔名不對（只給 .png 截圖）" });
      const full = findShot(shotsDir, file);
      if (!full) return send(res, 404, { error: "找不到這張截圖" });
      return send(res, 200, fs.readFileSync(full), "image/png");
    }
    return send(res, 404, { error: "沒有這個頁面" });
  }

  // 這層保證 handle 丟什麼錯都在這裡收掉：回得出去就回 400/500，連回應都寫不出去（連線已斷）就放掉。絕不讓 rejection 沒人接。
  return async (req, res) => {
    try {
      await handle(req, res);
    } catch (e) {
      try {
        send(res, e instanceof BadRequest ? 400 : 500, { error: e.message });
      } catch {
        try { res.destroy?.(); } catch { /* 沒有地方可以回了 */ }
      }
    }
  };
}
