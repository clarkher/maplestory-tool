// 查資料四頁（道具、怪物、任務、技能）的瀏覽器驗收：無頭 Chrome 走 DevTools 協定，手機 375×812、桌機 1280×800。
//
// 用法（先起好網站，例如 npm run dev；要 Node 22 以上）：
//   npm run verify:db                              驗 http://localhost:3000
//   npm run verify:db -- <網址>                    例如測試機 https://maplestory-tool-git-dev-clarkhers-projects.vercel.app
//   npm run verify:db -- <網址> <輸出資料夾>        截圖和 results.json 放這裡（預設：系統暫存資料夾的 maplebook-verify-db／這次的時間）
// 環境變數 CHROME_PATH 可以指定 Chrome（或 Edge、Chromium）；沒指定就找常見的安裝位置。
// 環境變數 VERIFY_ONLY=N10,N13 只跑那幾段（改一個地方時先跑相關的，最後再全部跑一次）。
// 每一項印 PASS／FAIL，有一項沒過就 exit 1。
//
// 為什麼用無頭 Chrome：Claude 的瀏覽器窗格常是隱藏的，requestAnimationFrame 不跑、平滑捲動不播、按返回不還原位置，
// 量不到真的畫面。無頭頁面算看得見，動畫照跑。取樣要在畫完之後（requestAnimationFrame 之後再 setTimeout），
// 不然會量到沒畫出來的那一格。按返回／下一頁一律用 DevTools 的 Page.navigateToHistoryEntry（跟按瀏覽器的返回鍵一樣），
// 不用頁面裡的 history.back()。
// 寫死的資料：綠水靈 210100（出沒地圖展開後卡片很長）、白狼人 8140000（怪物清單第 121 筆，不在前 60 筆）、幼黑格里芬 6230401（掉落全都沒名字）、道具 1302020（不在前 60 筆）、
// 任務 6931 要先完成 6930。遊戲資料改版後對不上時，這幾項會 FAIL 並寫出原因，換成新的 id 就好。
// 也順便驗全站的兩件事（v0.53）：H 開頭＝手指往下滑時導覽列收起來（用 Input.dispatchTouchEvent 模擬手指；
// Input.synthesizeScrollGesture 在無頭 Chrome 只送出按下、放開，畫面不會捲，不能用）；X 開頭＝打寶「自己找」、帶我去選地圖的搜尋框「×」。
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

if (typeof WebSocket === "undefined") {
  console.error("需要 Node 22 以上（用到內建的 WebSocket）");
  process.exit(1);
}

const BASE = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
const STAMP = new Date().toISOString().replace(/[:.]/g, "-");
const OUT = path.resolve(process.argv[3] ?? path.join(os.tmpdir(), "maplebook-verify-db", STAMP));
fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const candidates =
    process.platform === "win32"
      ? [process.env.PROGRAMFILES, process.env["PROGRAMFILES(X86)"], process.env.LOCALAPPDATA]
          .filter(Boolean)
          .flatMap(dir => [
            path.join(dir, "Google/Chrome/Application/chrome.exe"),
            path.join(dir, "Microsoft/Edge/Application/msedge.exe"),
          ])
      : process.platform === "darwin"
        ? [
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
            "/Applications/Chromium.app/Contents/MacOS/Chromium",
          ]
        : [
            "/usr/bin/google-chrome",
            "/usr/bin/google-chrome-stable",
            "/usr/bin/chromium",
            "/usr/bin/chromium-browser",
            "/snap/bin/chromium",
            "/usr/bin/microsoft-edge",
            "/usr/bin/microsoft-edge-stable",
          ];
  const found = candidates.find(file => fs.existsSync(file));
  if (!found) throw new Error("找不到 Chrome，請用環境變數 CHROME_PATH 指定");
  return found;
}

async function getJSON(url) {
  for (let i = 0; i < 100; i++) {
    try { return await (await fetch(url)).json(); } catch { await sleep(200); }
  }
  throw new Error(`DevTools 沒回應：${url}`);
}
/** DevTools 協定的連線。每個指令最多等 timeout，Chrome 掛掉時不會整支卡住 */
function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  const listeners = new Set();
  ws.addEventListener("message", ev => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
    } else if (msg.method) for (const l of listeners) l(msg);
  });
  const opened = new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve);
    ws.addEventListener("error", () => reject(new Error(`連不上 DevTools：${wsUrl}`)));
  });
  const send = (method, params = {}, timeout = 120000) =>
    new Promise((resolve, reject) => {
      const i = ++id;
      const timer = setTimeout(() => {
        pending.delete(i);
        reject(new Error(`DevTools 沒回應（${method}）`));
      }, timeout);
      pending.set(i, {
        resolve: value => { clearTimeout(timer); resolve(value); },
        reject: error => { clearTimeout(timer); reject(error); },
      });
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  return { opened, send, listeners };
}

// 頁面裡的小工具
const H = `
  window.__sleep = ms => new Promise(r => setTimeout(r, ms));
  window.__waitFor = (cond, ms = 20000) => Promise.race([
    new Promise(resolve => {
      if (cond()) return resolve(true);
      const mo = new MutationObserver(() => { if (cond()) { mo.disconnect(); resolve(true); } });
      mo.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
    }),
    new Promise(resolve => setTimeout(() => resolve(false), ms)),
  ]);
  window.__rows = () => [...document.querySelectorAll("li[id^=db-row-]")];
  window.__rowId = i => window.__rows()[i].id.replace("db-row-", "");
  window.__row = id => document.getElementById("db-row-" + id);
  window.__rowBtn = id => document.querySelector("#db-row-" + id + " > button");
  window.__top = id => { const el = window.__row(id); return el ? Math.round(el.getBoundingClientRect().top) : null; };
  window.__tap = id => window.__rowBtn(id).click();
  window.__open = () => window.__rows().filter(li => li.querySelector("article")).map(li => li.id.replace("db-row-", ""));
  // 放在清單最上面的那張卡（從連結打開、那一筆不在清單上）
  window.__topWrap = () => document.getElementById("db-top") ?? document.querySelector("main .scroll-mt-20.pb-2");
  window.__topCard = () => !!window.__topWrap()?.querySelector("article");
  // 卡片下面那顆收起（緊接在卡片後面的按鈕）
  window.__collapseBtn = () => document.querySelector("main article + button");
  // 放在最上面的卡片，上方那顆黏著的「收起」
  window.__topCollapse = () => window.__topWrap()?.querySelector(":scope > button") ?? null;
  window.__headerBottom = () => Math.round(document.querySelector("body > header").getBoundingClientRect().bottom);
  // 桌機右邊那一欄（細節）
  window.__side = () => document.getElementById("db-side") ?? document.querySelector("main .grid > div.min-w-0");
  // 搜尋框有字時右邊的「×」
  window.__clearBtn = (root = document.querySelector("main")) => root.querySelector("button[aria-label='清除搜尋']");
  window.__listTop = () => Math.round(document.querySelector("main ul").getBoundingClientRect().top);
  window.__id = () => new URLSearchParams(location.search).get("id");
  window.__frames = (ms, f) => new Promise(res => {
    const out = []; const t0 = performance.now();
    const tick = () => { out.push(f()); if (performance.now() - t0 < ms) requestAnimationFrame(tick); else res(out); };
    requestAnimationFrame(tick);
  });
  window.__ready = () => window.__waitFor(() => window.__rows().length > 0);
  // 畫完之後才取樣（requestAnimationFrame 之後再排 setTimeout）：記到的是使用者真的看到的那一格
  window.__painted = (ms, f) => new Promise(res => {
    const out = []; const t0 = performance.now();
    const tick = () => setTimeout(() => { out.push(f()); if (performance.now() - t0 < ms) requestAnimationFrame(tick); else res(out); }, 0);
    requestAnimationFrame(tick);
  });
  window.__changes = list => list.filter((f, i) => i === 0 || f !== list[i - 1]);
  window.__search = () => document.querySelector("main input[aria-label^=搜尋]");
  window.__setSearch = v => { const el = window.__search(); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, v); el.dispatchEvent(new Event("input", { bubbles: true })); };
  window.__droppable = () => [...document.querySelectorAll("main label")].find(l => l.textContent.includes("只看打得到的"))?.querySelector("input");
  window.__select = (label, value) => { const el = document.querySelector("main select[aria-label='" + label + "']"); el.value = value; el.dispatchEvent(new Event("change", { bubbles: true })); };
  // 「再載」：看得到的按鈕就按（舊版），不然捲到清單底下讓它自己接上
  window.__moreBtn = () => [...document.querySelectorAll("main button")].find(b => b.textContent.trim().startsWith("再載"));
  window.__shows = el => !!el && el.getBoundingClientRect().width > 2 && el.getBoundingClientRect().height > 2;
  window.__loadMore = async () => {
    const before = window.__rows().length;
    const btn = window.__moreBtn();
    if (window.__shows(btn)) btn.click();
    else window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" });
    await window.__waitFor(() => window.__rows().length > before, 3000);
    await window.__sleep(300);
    return window.__rows().length;
  };
`;

const results = [];
const check = (name, ok, detail) => results.push({ name, ok: !!ok, detail });
const near = (a, b, tol = 3) => typeof a === "number" && Math.abs(a - b) <= tol;
// console 的錯誤、警告、沒接住的例外全部記下來
const consoleProblems = [];
// 只跑某幾段：VERIFY_ONLY=N10,N13（寫段名；「M1–M5」這種一組的，寫 M1 也行），沒給就全部跑
const ONLY = process.env.VERIFY_ONLY?.split(",").map(name => name.trim()).filter(Boolean);
// 一段檢查出錯（例如找不到按鈕）只記這一段失敗，後面照跑
async function section(name, run) {
  if (ONLY?.length && !ONLY.some(want => name === want || name.split("–")[0] === want)) return;
  try {
    await run();
  } catch (error) {
    check(`${name} 執行出錯`, false, String(error?.message ?? error).slice(0, 400));
  }
}

// 每次用乾淨的瀏覽器資料；埠交給 Chrome 自己挑（寫在 DevToolsActivePort），幾支一起跑不會撞
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "maplebook-verify-db-profile-"));
let chrome = null;
let browser = null;
let page = null;

try {
  const chromePath = findChrome();
  let chromeError = null;
  chrome = spawn(chromePath, [
    "--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`,
    "--no-first-run", "--no-default-browser-check", "--disable-extensions", "--hide-scrollbars", "--window-size=1280,900", "about:blank",
  ], { stdio: "ignore" });
  chrome.on("error", error => { chromeError = error; });

  let port = 0;
  for (let i = 0; i < 150 && !port; i++) {
    if (chromeError) throw new Error(`開不了 Chrome（${chromePath}）：${chromeError.message}`);
    try {
      port = Number(fs.readFileSync(path.join(profile, "DevToolsActivePort"), "utf8").split("\n")[0]);
    } catch {
      // Chrome 還沒寫好
    }
    if (!port) await sleep(200);
  }
  if (!port) throw new Error("Chrome 的 DevTools 沒起來");
  const version = await getJSON(`http://127.0.0.1:${port}/json/version`);
  const pageTarget = (await getJSON(`http://127.0.0.1:${port}/json/list`)).find(t => t.type === "page");
  if (!pageTarget) throw new Error("Chrome 沒有可以操作的分頁");
  browser = connect(version.webSocketDebuggerUrl);
  page = connect(pageTarget.webSocketDebuggerUrl);
  await Promise.all([browser.opened, page.opened]);
  await page.send("Page.enable");
  await page.send("Runtime.enable");
  page.listeners.add(m => {
    if (m.method === "Runtime.consoleAPICalled" && (m.params.type === "error" || m.params.type === "warning")) {
      consoleProblems.push(`${m.params.type}: ${m.params.args.map(a => a.value ?? a.description ?? "").join(" ").slice(0, 200)}`);
    }
    if (m.method === "Runtime.exceptionThrown") consoleProblems.push(`exception: ${(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text).slice(0, 200)}`);
  });

  const evaluate = async expression => {
    const r = await page.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 600));
    return r.result.value;
  };
  const ev = body => evaluate(`(async () => { ${H} ${body} })()`);
  const loadEvent = () =>
    new Promise(res => {
      const l = m => { if (m.method === "Page.loadEventFired") { page.listeners.delete(l); res(); } };
      page.listeners.add(l);
    });
  const navigate = async url => {
    const loaded = loadEvent();
    const r = await page.send("Page.navigate", { url });
    if (r.errorText) throw new Error(`打不開 ${url}（${r.errorText}）：網站有起來嗎？`);
    await loaded;
  };
  const reload = async () => {
    const loaded = loadEvent();
    await page.send("Page.reload", {});
    await loaded;
  };
  const shot = async file => {
    const r = await page.send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(path.join(OUT, file), Buffer.from(r.data, "base64"));
  };
  const mobile = () => page.send("Emulation.setDeviceMetricsOverride", { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
  const desktop = () => page.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  const reduceMotion = on =>
    page.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: on ? "reduce" : "no-preference" }] });
  // 手指：開了觸控模擬才送得出 touch 事件（只在 H 開頭那幾段開，跑完關掉）
  const touchMode = on => page.send("Emulation.setTouchEmulationEnabled", on ? { enabled: true, maxTouchPoints: 5 } : { enabled: false });
  const touchAt = (type, x, y) =>
    page.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y, id: 1, radiusX: 4, radiusY: 4, force: 1 }] });
  /** 手指在畫面上往上推 dy px（頁面往下捲）；負的是往下拉（頁面往上捲）。放開後等慣性停、導覽列動畫跑完 */
  const swipe = async (dy, x = 190) => {
    const from = dy > 0 ? 640 : 220;
    const steps = Math.max(6, Math.round(Math.abs(dy) / 30));
    await touchAt("touchStart", x, from);
    for (let i = 1; i <= steps; i++) {
      await touchAt("touchMove", x, from - (dy * i) / steps);
      await sleep(16);
    }
    await touchAt("touchEnd", x, from - dy);
    await sleep(800);
  };
  /** 手指點一下（不移動） */
  const fingerTap = async (x, y) => {
    await touchAt("touchStart", x, y);
    await sleep(40);
    await touchAt("touchEnd", x, y);
  };
  /** 跟按瀏覽器的返回／下一頁一樣（不是頁面自己呼叫 history.back）：量按返回一律這樣按 */
  const traverse = async delta => {
    const history = await page.send("Page.getNavigationHistory");
    const entry = history.entries[history.currentIndex + delta];
    if (!entry) throw new Error(`沒有第 ${history.currentIndex + delta} 筆歷史紀錄`);
    await page.send("Page.navigateToHistoryEntry", { entryId: entry.id });
  };
  /** 按返回（或下一頁），同時逐格記 expr 的值；painted：畫完之後才取樣。回傳有變的那幾格 */
  const traverseRecording = async (delta, ms, expr, painted = false) => {
    await evaluate(`(() => { ${H} window.__fp = window.${painted ? "__painted" : "__frames"}(${ms}, () => ${expr}); return 1; })()`);
    await traverse(delta);
    return evaluate(`window.__fp.then(list => list.filter((f, i) => i === 0 || f !== list[i - 1]))`);
  };
  /** 清掉記住的搜尋、篩選、已載入筆數（下一次整頁打開時才生效），每一段從預設的清單開始 */
  const clearRemembered = () =>
    evaluate(`Object.keys(sessionStorage).filter(k => k.startsWith("ms-db:")).forEach(k => sessionStorage.removeItem(k)); 1`);
  const fresh = async pathname => {
    await clearRemembered();
    await navigate(BASE + pathname);
    const shown = await ev(`const ok = await __ready(); await __sleep(600); return ok ? null : (document.body?.innerText ?? "").slice(0, 120);`);
    // 清單沒出來（網站沒起來、部署被回收、程式掛了）：直接講畫面上是什麼，不要讓後面的檢查報看不懂的錯
    if (shown !== null) throw new Error(`${BASE + pathname} 的清單沒出來，畫面上是：${shown.replace(/\s+/g, " ")}`);
  };

  await mobile();
  await navigate(BASE + "/db");
  await evaluate(`localStorage.setItem("ms-profile", JSON.stringify({ level: 45, job: 110 })); localStorage.setItem("ms-theme", "light"); "ok"`);

  // ── 手機：點一筆、換一筆、收起 ──

  await section("M1–M5", async () => {
    // M1 點第 3 筆：細節展開在那一列下面、那一列捲到導覽列下方、歷史紀錄留了「從清單點開」的記號
    await fresh("/db/items");
    let r = await ev(`const id = __rowId(2); window.scrollTo({ top: 0, behavior: "instant" }); await __sleep(200);
      __tap(id); await __waitFor(() => __id() === id); await __sleep(1300);
      return { id, open: __open(), rowTop: __top(id), marker: history.state?.dbFromList ?? null, topCard: __topCard() };`);
    check("M1 手機點一筆：細節展開在那一列下面", r.open.length === 1 && r.open[0] === r.id && !r.topCard, r);
    check("M1 那一列捲到導覽列下方（約 80px）", near(r.rowTop, 80), r.rowTop);
    check("M1 歷史紀錄有「從清單點開」記號", r.marker === r.id, r.marker);
    await shot("m1-open.png");

    // M2 開著第 3 筆時點第 9 筆：第 9 筆那一列不會先往上跳（放回手指的位置），最後停在導覽列下方，只開一張
    r = await ev(`const a = __id(); const b = __rowId(8);
      __row(b).scrollIntoView({ block: "center", behavior: "instant" }); await __sleep(300);
      const before = __top(b); const aHeight = Math.round(__row(a).getBoundingClientRect().height);
      const framesP = __frames(1500, () => __top(b)); __tap(b); const frames = await framesP;
      return { a, b, before, aHeight, firstFrames: frames.slice(0, 5), end: __top(b), open: __open(), marker: history.state?.dbFromList ?? null };`);
    const firstMove = r.firstFrames.find(v => v !== r.before) ?? r.before;
    check("M2 換點另一筆：手指那一列第一格沒有往上跳一張卡的高度", firstMove > r.before - r.aHeight / 2, { before: r.before, firstFrames: r.firstFrames, cardAHeight: r.aHeight });
    check("M2 最後停在導覽列下方、只開一張", near(r.end, 80) && r.open.length === 1 && r.open[0] === r.b, { end: r.end, open: r.open });
    check("M2 開著別筆時點開的不留記號", r.marker === null, r.marker);

    // M3 再點一次開著的那一筆：收起
    r = await ev(`const b = __id(); __tap(b); await __waitFor(() => __id() === null, 3000); await __sleep(500);
      return { b, id: __id(), open: __open(), rowTop: __top(b) };`);
    check("M3 再點一次開著的那一筆：收起", r.id === null && r.open.length === 0, r);
    check("M3 收起後那一列在導覽列下方", near(r.rowTop, 80), r.rowTop);

    // M4 從清單點開（有記號）→ 按卡片下面的「收起」：網址回到沒有 id、上一頁不多一筆
    r = await ev(`const id = __rowId(20); __row(id).scrollIntoView({ block: "center", behavior: "instant" }); await __sleep(300);
      const tapTop = __top(id); const len0 = history.length; __tap(id); await __waitFor(() => __id() === id); await __sleep(1200);
      __collapseBtn().scrollIntoView({ block: "center", behavior: "instant" }); await __sleep(200);
      const framesP = __painted(900, () => __top(id));
      __collapseBtn().click(); const frames = await framesP; await __waitFor(() => __id() === null, 3000); await __sleep(300);
      const focused = document.activeElement === __rowBtn(id);
      return { id, tapTop, idAfter: __id(), open: __open(), rowTop: __top(id), focused, lenDelta: history.length - len0, frames: __changes(frames) };`);
    check("M4 收起（從清單點開的）：卡片收掉、網址沒有 id", r.idAfter === null && r.open.length === 0, r);
    check("M4 收起後那一列在導覽列下方", near(r.rowTop, 80), { rowTop: r.rowTop, frames: r.frames });
    check("M4 收起時沒有先閃到點之前的位置、也不滑（那一列逐格位置不超過 2 個）", r.frames.length <= 2 && !r.frames.slice(0, -1).some(v => near(v, r.tapTop, 6) && !near(r.tapTop, 80, 6)), { tapTop: r.tapTop, frames: r.frames });
    check("M4 收起後焦點回到那一列", r.focused, r.focused);
    await shot("m4-after-collapse.png");

    // M5 開著 A 再點 B（沒有記號）→ 收起 B：直接收掉，不會跳回 A
    r = await ev(`const a = __rowId(4), b = __rowId(6); window.scrollTo({ top: 0, behavior: "instant" }); await __sleep(200);
      __tap(a); await __waitFor(() => __id() === a); await __sleep(1200);
      __tap(b); await __waitFor(() => __id() === b); await __sleep(1200);
      __collapseBtn().click(); await __waitFor(() => __id() !== b, 3000); await __sleep(700);
      return { a, b, idAfter: __id(), open: __open(), rowTop: __top(b) };`);
    check("M5 收起（開著別筆時點開的）：直接收掉，不跳回上一筆", r.idAfter === null && r.open.length === 0, r);
    check("M5 收起後那一列在導覽列下方", near(r.rowTop, 80), r.rowTop);
  });

  // M6 從網址打開：在清單上 → 展開在那一列下面並跳過去；不在清單上 → 放在清單最上面並跳過去
  await section("M6", async () => {
    await fresh("/db/items");
    const nearId = await ev(`return __rowId(40);`);
    await navigate(`${BASE}/db/items?id=${nearId}`);
    let r = await ev(`await __ready(); await __sleep(900); return { open: __open(), rowTop: __top(${JSON.stringify(nearId)}), topCard: __topCard() };`);
    check("M6 網址打開（清單第 41 筆）：展開在那一列下面、跳到導覽列下方", r.open[0] === nearId && near(r.rowTop, 80) && !r.topCard, r);
    await navigate(`${BASE}/db/items?id=1302020`);
    r = await ev(`await __ready(); await __sleep(900); const card = __topWrap();
      return { topCard: __topCard(), open: __open(), cardTop: card ? Math.round(card.getBoundingClientRect().top) : null, inList: !!__row("1302020") };`);
    check("M6 網址打開（不在前 60 筆）：放在清單最上面、跳到那張卡", r.topCard && r.open.length === 0 && !r.inList && near(r.cardTop, 80), r);
    await shot("m6-top-card.png");
  });

  // M7 同一頁的連結（任務「要先完成」）：跳到新的那一筆
  await section("M7", async () => {
    await clearRemembered();
    await navigate(`${BASE}/db/quests?id=6931`);
    const r = await ev(`await __ready(); await __sleep(900);
      const link = [...document.querySelectorAll("main article a")].find(a => /[?&]id=6930/.test(a.getAttribute("href") || ""));
      if (!link) return { skipped: "找不到要先完成的連結" };
      link.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })); link.click();
      await __waitFor(() => __id() === "6930", 5000); await __sleep(900);
      const card = __topWrap();
      return { id: __id(), open: __open(), topCard: __topCard(), rowTop: __top("6930"), cardTop: card ? Math.round(card.getBoundingClientRect().top) : null };`);
    check("M7 同頁連結（要先完成）：跳到新的那一筆", !r.skipped && r.id === "6930" && ((r.open[0] === "6930" && near(r.rowTop, 80)) || (r.topCard && near(r.cardTop, 80))), r);
  });

  // ── 手機：按返回、離開再回來、記住搜尋篩選 ──

  // M8 頁內返回（v0.28）：A → B（開著 A 點 B）→ 返回：回到 A，位置是點 B 之前的位置
  await section("M8", async () => {
    await fresh("/db/items");
    const ctx = await ev(`const a = __rowId(3), b = __rowId(10); __tap(a); await __waitFor(() => __id() === a); await __sleep(1200);
      __row(b).scrollIntoView({ block: "end", behavior: "instant" }); await __sleep(300);
      const yBeforeB = Math.round(scrollY); __tap(b); await __waitFor(() => __id() === b); await __sleep(1200);
      return { a, b, yBeforeB };`);
    const frames = await traverseRecording(-1, 1000, "Math.round(scrollY)");
    let r = await ev(`await __waitFor(() => __id() === ${JSON.stringify(ctx.a)}, 3000); await __sleep(300);
      return { id: __id(), open: __open(), yAfterBack: Math.round(scrollY) };`);
    r = { ...ctx, ...r, frames };
    check("M8 頁內返回：回到上一筆", r.id === r.a && r.open[0] === r.a, r);
    check("M8 頁內返回：回到點下一筆前的位置", near(r.yAfterBack, r.yBeforeB), { yBeforeB: r.yBeforeB, yAfterBack: r.yAfterBack });
    check("M8 頁內返回：直接跳、不滑", r.frames.length <= 3, r.frames);
  });

  // M9 離開再返回（沒開卡片）：第一個畫面就有清單（不閃載入中），捲回原位
  await section("M9", async () => {
    await fresh("/db/items");
    // 捲到底會自動多載一批：等它停下來再記離開的位置
    const ctx = await ev(`window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }); await __sleep(800);
      const leftY = Math.round(scrollY);
      document.querySelector("header nav a[href='/db']").click(); await __waitFor(() => location.pathname === "/db"); await __sleep(800);
      window.__first = { rows: -1, loading: null };
      window.__mo = new MutationObserver(() => { if (location.pathname === "/db/items" && window.__first.rows < 0 && __search()) window.__first = { rows: __rows().length, loading: document.querySelector("main").textContent.includes("載入中") }; });
      window.__mo.observe(document.documentElement, { childList: true, subtree: true });
      return { leftY };`);
    const frames = await traverseRecording(-1, 1200, "Math.round(scrollY)");
    let r = await ev(`await __waitFor(() => location.pathname === "/db/items"); await __sleep(300); window.__mo.disconnect();
      return { firstRows: window.__first.rows, firstLoading: window.__first.loading, backY: Math.round(scrollY) };`);
    r = { ...ctx, ...r, frames };
    check("M9 離開再返回：第一個畫面就有清單（不閃載入中）", r.firstRows >= 60 && r.firstLoading === false, r);
    check("M9 離開再返回：捲回原位", near(r.backY, r.leftY), { leftY: r.leftY, backY: r.backY });
    check("M9 離開再返回：直接跳、不滑", r.frames.length <= 3, r.frames);
  });

  await section("M10–M11", async () => {
    // M10 有搜尋＋篩選＋多載過：離開再返回，清單一樣、捲回原位
    await fresh("/db/items");
    const ctx = await ev(`__setSearch("帽"); await __sleep(400);
      __droppable()?.click(); await __sleep(400);
      const before = __rows().length; await __loadMore();
      // 捲到靠近底部時可能又自動多載一批：等它停下來，離開前那一刻的筆數才準
      window.scrollTo({ top: document.documentElement.scrollHeight - 1600, behavior: "instant" }); await __sleep(800);
      const rows = __rows().length; const leftY = Math.round(scrollY);
      document.querySelector("header nav a[href='/db']").click(); await __waitFor(() => location.pathname === "/db"); await __sleep(800);
      return { rowsBeforeMore: before, rowsBefore: rows, leftY };`);
    const frames = await traverseRecording(-1, 1200, "Math.round(scrollY)");
    let r = await ev(`await __waitFor(() => location.pathname === "/db/items"); await __sleep(300);
      return { query: __search().value, droppable: __droppable()?.checked, rowsAfter: __rows().length, backY: Math.round(scrollY) };`);
    r = { ...ctx, ...r, frames };
    check("M10 搜尋、篩選、多載過的筆數都還在", r.query === "帽" && r.droppable === true && r.rowsBefore > r.rowsBeforeMore && r.rowsAfter === r.rowsBefore, r);
    check("M10 捲回原位", near(r.backY, r.leftY), { leftY: r.leftY, backY: r.backY });
    check("M10 直接跳、不滑", r.frames.length <= 3, r.frames);

    // M11 從選單再進來（站內點頁首「查資料」再點「道具」，不是返回）：記住的搜尋還在、第一個畫面就有清單、從頂端開始
    r = await ev(`document.querySelector("header nav a[href='/db']").click(); await __waitFor(() => location.pathname === "/db"); await __sleep(800); let firstRows = -1;
      const mo = new MutationObserver(() => { if (location.pathname === "/db/items" && firstRows < 0 && __search()) firstRows = __rows().length; });
      mo.observe(document.documentElement, { childList: true, subtree: true });
      document.querySelector('main a[href="/db/items"]').click(); await __waitFor(() => location.pathname === "/db/items"); await __sleep(1200); mo.disconnect();
      return { query: __search().value, firstRows, y: Math.round(scrollY) };`);
    check("M11 從選單再進來：記住的搜尋還在、第一個畫面就有清單、從頂端開始", r.query === "帽" && r.firstRows > 0 && r.y === 0, r);
  });

  // M12 開著卡片離開（點卡片裡的怪物連結）再返回：卡片還開著、捲回原位
  await section("M12", async () => {
    await fresh("/db/items");
    const ctx = await ev(`window.scrollTo({ top: 0, behavior: "instant" }); await __sleep(300);
      let id = null, link = null;
      for (let i = 0; i < 30 && !link; i++) {
        id = __rowId(i); __tap(id); await __waitFor(() => __id() === id); await __sleep(700);
        link = [...document.querySelectorAll("#db-row-" + id + " article a")].find(a => (a.getAttribute("href") || "").startsWith("/db/monsters"));
        if (!link) { __tap(id); await __waitFor(() => __id() === null); await __sleep(300); }
      }
      if (!link) return { skipped: "前 30 筆找不到有怪物連結的道具" };
      link.scrollIntoView({ block: "center", behavior: "instant" }); await __sleep(300);
      const leftY = Math.round(scrollY);
      link.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })); link.click(); await __waitFor(() => location.pathname === "/db/monsters"); await __sleep(1200);
      return { id, leftY };`);
    let r = ctx;
    if (!ctx.skipped) {
      const frames = await traverseRecording(-1, 1200, "Math.round(scrollY)");
      r = await ev(`await __waitFor(() => location.pathname === "/db/items"); await __sleep(300); return { open: __open(), backY: Math.round(scrollY) };`);
      r = { ...ctx, ...r, frames };
    }
    check("M12 開著卡片離開再返回：卡片還開著", !r.skipped && r.open[0] === r.id, r);
    check("M12 開著卡片離開再返回：捲回原位", !r.skipped && near(r.backY, r.leftY), { leftY: r.leftY, backY: r.backY, skipped: r.skipped });
    check("M12 開著卡片離開再返回：直接跳、不滑", !r.skipped && r.frames.length <= 3, r.frames);
  });

  // M13 「誰能用」選〇〇能用的：離開再返回，篩選還在、清單一樣、捲回原位（角色要同步讀，第一個畫面就套上）
  await section("M13", async () => {
    await fresh("/db/items");
    const ctx = await ev(`const mine = document.querySelector("main select[aria-label='誰能用']");
      if (!mine || ![...mine.options].some(o => o.value === "usable")) return { skipped: "沒有「誰能用」下拉或「〇〇能用的」選項" };
      __select("誰能用", "usable"); await __sleep(500);
      const firstId = __rowId(0);
      // 捲到靠近底部時可能又自動多載一批：等它停下來，離開前那一刻的筆數才準
      window.scrollTo({ top: document.documentElement.scrollHeight - 1400, behavior: "instant" }); await __sleep(800);
      const rows = __rows().length; const leftY = Math.round(scrollY);
      document.querySelector("header nav a[href='/db']").click(); await __waitFor(() => location.pathname === "/db"); await __sleep(800);
      window.__firstFirstId = null;
      window.__mo = new MutationObserver(() => { if (location.pathname === "/db/items" && window.__firstFirstId === null && __rows().length) window.__firstFirstId = __rowId(0); });
      window.__mo.observe(document.documentElement, { childList: true, subtree: true });
      return { rowsBefore: rows, firstId, leftY };`);
    let r = ctx;
    if (!ctx.skipped) {
      await traverse(-1);
      r = await ev(`await __waitFor(() => location.pathname === "/db/items"); await __sleep(1500); window.__mo.disconnect();
        const mine2 = document.querySelector("main select[aria-label='誰能用']");
        return { checked: mine2?.value === "usable", rowsAfter: __rows().length, firstFirstId: window.__firstFirstId, backY: Math.round(scrollY) };`);
      r = { ...ctx, ...r };
    }
    check("M13 〇〇能用的：返回後第一個畫面就套上篩選、清單一樣", !r.skipped && r.checked && r.rowsAfter === r.rowsBefore && r.firstFirstId === r.firstId, r);
    check("M13 〇〇能用的：捲回原位", !r.skipped && near(r.backY, r.leftY), { leftY: r.leftY, backY: r.backY });
  });

  // M14 技能頁：展開在那一筆下面、職業篩選離開再回來還在
  await section("M14", async () => {
    await fresh("/db/skills");
    const r = await ev(`const select = document.querySelector("main select"); const option = [...select.options].find(o => o.value && o.textContent.includes("狂戰士")) ?? select.options[1];
      select.value = option.value; select.dispatchEvent(new Event("change", { bubbles: true })); await __sleep(500);
      const id = __rowId(2); __tap(id); await __waitFor(() => __id() === id); await __sleep(1200);
      const open = __open(); const rowTop = __top(id);
      document.querySelector("header nav a[href='/db']").click(); await __waitFor(() => location.pathname === "/db"); await __sleep(800);
      document.querySelector('main a[href="/db/skills"]').click(); await __waitFor(() => location.pathname === "/db/skills"); await __sleep(1000);
      const kept = document.querySelector("main select").value;
      return { id, open, rowTop, chosen: option.value, kept };`);
    check("M14 技能頁：展開在那一筆下面、捲到導覽列下方", r.open[0] === r.id && near(r.rowTop, 80), r);
    check("M14 技能頁：職業篩選離開再回來還在", r.kept === r.chosen, r);
  });

  // M15 從清單點開後，「收起」連點兩下：只收起，不會連退兩頁離開這一頁
  await section("M15", async () => {
    await fresh("/db/items");
    const r = await ev(`const id = __rowId(5); __tap(id); await __waitFor(() => __id() === id); await __sleep(1200);
      const btn = __collapseBtn(); btn.click(); btn.click(); await __sleep(1500);
      return { path: location.pathname, id: __id(), open: __open() };`);
    check("M15 收起連點兩下：還在道具頁、只是收起", r.path === "/db/items" && r.id === null && r.open.length === 0, r);
  });

  // M16 同一列極快連點兩下（畫面還沒更新就點第二下）：只開一次、紀錄只多一筆，之後收起正常
  await section("M16", async () => {
    await fresh("/db/items");
    const ctx = await ev(`const id = __rowId(7); __tap(id); __tap(id);
      await __waitFor(() => __id() === id); await __sleep(1200);
      return { id, openAfterTaps: __open() };`);
    // 只多一筆紀錄的話，按一次返回就回到沒開卡片的清單；多兩筆的話還會停在同一筆
    await traverse(-1);
    const idAfterOneBack = await ev(`await __waitFor(() => __id() === null, 2000); await __sleep(400); return __id();`);
    await traverse(+1);
    let r = await ev(`await __waitFor(() => __id() === ${JSON.stringify(ctx.id)}, 2000); await __sleep(600);
      __collapseBtn().click(); await __waitFor(() => __id() === null, 3000); await __sleep(700);
      return { idAfter: __id(), open: __open(), path: location.pathname };`);
    r = { ...ctx, idAfterOneBack, ...r };
    check("M16 連點同一列：只開一次、紀錄只多一筆（返回一次就回到清單）", r.openAfterTaps[0] === r.id && r.idAfterOneBack === null, r);
    check("M16 連點同一列之後：收起正常、還在這頁", r.idAfter === null && r.open.length === 0 && r.path === "/db/items", r);
  });

  // M17 點 X 後馬上點 Y（畫面還沒更新）：開的是 Y、Y 不帶記號，收起 Y 不會跳回 X
  await section("M17", async () => {
    await fresh("/db/items");
    const r = await ev(`const x = __rowId(2), y = __rowId(9); __tap(x); __tap(y);
      await __waitFor(() => __id() === y); await __sleep(1200);
      const marker = history.state?.dbFromList ?? null; const open = __open();
      __collapseBtn().click(); await __waitFor(() => __id() !== y, 3000); await __sleep(700);
      return { x, y, open, marker, idAfter: __id(), openAfter: __open() };`);
    check("M17 點 X 馬上點 Y：開的是 Y、Y 不帶記號", r.open.length === 1 && r.open[0] === r.y && r.marker === null, r);
    check("M17 收起 Y：不會跳回 X", r.idAfter === null && r.openAfter.length === 0, r);
  });

  // M18 從清單點開、往下讀到卡片中段後重新整理（v0.57）：停在原本讀到的地方，不跳回卡片頂端，卡片還開在那一列下面；
  // 再按收起：不會整頁重載（同一份頁面），收起、那一列在導覽列下方
  await section("M18", async () => {
    await fresh("/db/monsters");
    const ctx = await ev(`const id = "210100"; window.scrollTo({ top: 0, behavior: "instant" }); await __sleep(200);
      __tap(id); await __waitFor(() => __id() === id); await __sleep(1300);
      // 出沒地圖按「看全部」把卡片撐長（記在這次瀏覽裡，重新整理後一樣長），再往下讀到卡片中段
      [...__row(id).querySelectorAll("article button")].find(b => b.textContent.includes("看全部"))?.click(); await __sleep(400);
      const rowAt = __top(id) + Math.round(scrollY); const cardHeight = Math.round(__row(id).getBoundingClientRect().height);
      window.scrollTo({ top: rowAt + Math.min(1200, Math.round(cardHeight / 2)), behavior: "instant" }); await __sleep(600);
      return { id, rowAt, cardHeight, leftY: Math.round(scrollY) };`);
    await reload();
    const after = await ev(`await __ready(); await __sleep(1500); const id = ${JSON.stringify(ctx.id)}; const y = Math.round(scrollY);
      return { y, open: __open(), rowAt: __row(id) ? __top(id) + y : null };`);
    check("M18 讀到卡片中段重新整理：停在原本讀到的地方（不跳回卡片頂端）、卡片還開在那一列下面",
      ctx.cardHeight > 1500 && after.open[0] === ctx.id && near(after.y, ctx.leftY), { ...ctx, ...after });
    await shot("m18-after-reload.png");
    const r = await ev(`const origin = performance.timeOrigin; const marker = history.state?.dbFromList ?? null;
      __collapseBtn().click(); await __waitFor(() => __id() === null, 3000); await __sleep(800);
      return { id: ${JSON.stringify(ctx.id)}, markerSurvived: marker, sameDoc: performance.timeOrigin === origin, idAfter: __id(), open: __open(), rowTop: __top(${JSON.stringify(ctx.id)}) };`);
    check("M18 重新整理後收起：同一份頁面（沒有整頁重載）、收起、那一列在導覽列下方", r.sameDoc && r.idAfter === null && r.open.length === 0 && near(r.rowTop, 80), r);
  });

  // M19 搜尋、篩選重新整理後還在（記到關掉分頁為止）
  await section("M19", async () => {
    await fresh("/db/items");
    await ev(`__setSearch("帽"); await __sleep(300); __droppable()?.click(); await __sleep(400); return 1;`);
    await reload();
    const r = await ev(`await __ready(); await __sleep(600); return { query: __search().value, droppable: __droppable()?.checked };`);
    check("M19 重新整理後搜尋、篩選還在", r.query === "帽" && r.droppable === true, r);
  });

  // M20 卡片搬家（v0.57）：開在清單第 121 筆的白狼人讀到卡片中段後重新整理——重新整理後清單只剩前 60 筆、卡片搬到清單最上面，
  // 一樣停在卡片裡讀到的那一段（離卡片那一塊頂端一樣遠），不是卡片頂端
  await section("M20", async () => {
    await fresh("/db/monsters");
    const ctx = await ev(`const id = "8140000";
      for (let i = 0; i < 4 && !__row(id); i++) await __loadMore();
      if (!__row(id)) return { skipped: "多載四次還是沒有白狼人" };
      __row(id).scrollIntoView({ block: "center", behavior: "instant" }); await __sleep(300);
      __tap(id); await __waitFor(() => __id() === id); await __sleep(1300);
      const blockAt = __top(id) + Math.round(scrollY); const cardHeight = Math.round(__row(id).getBoundingClientRect().height);
      window.scrollTo({ top: blockAt + Math.min(500, Math.round(cardHeight / 2)), behavior: "instant" }); await __sleep(600);
      return { id, blockAt, cardHeight, leftY: Math.round(scrollY), offset: Math.round(scrollY) - blockAt };`);
    let r = ctx;
    if (!ctx.skipped) {
      await reload();
      const after = await ev(`await __ready(); await __sleep(1500); const wrap = __topWrap(); const y = Math.round(scrollY);
        return { y, topCard: __topCard(), inList: !!__row("8140000"), blockAtAfter: wrap ? Math.round(wrap.getBoundingClientRect().top) + y : null };`);
      r = { ...ctx, ...after, offsetAfter: after.blockAtAfter === null ? null : after.y - after.blockAtAfter };
      await shot("m20-moved-card.png");
    }
    check("M20 卡片搬家（重新整理後清單只剩 60 筆、卡片搬到最上面）：停在卡片裡讀到的那一段，不是卡片頂端",
      !r.skipped && r.topCard && !r.inList && r.offset > 100 && near(r.offsetAfter, r.offset), r);
  });

  // ── 手機：v0.39 長卡片收起、卡片不搬家、按返回補救、捲到底自動載入、減少動態效果 ──

  // N1 長卡片（綠水靈：出沒地圖全部展開＋十幾樣掉落）：開著的那一列寫「收起」，往下看時黏在導覽列下面，點它收起
  await section("N1", async () => {
    await fresh("/db/monsters");
    let r = await ev(`const id = "210100"; window.scrollTo({ top: 0, behavior: "instant" }); await __sleep(200);
      __tap(id); await __waitFor(() => __id() === id); await __sleep(1300);
      const label = __rowBtn(id).textContent; const otherLabel = __rowBtn(__rowId(0)).textContent;
      // 出沒地圖先只列 5 張（v0.51），按「看全部」把卡片撐長再往下看
      [...__row(id).querySelectorAll("article button")].find(b => b.textContent.includes("看全部"))?.click(); await __sleep(400);
      window.scrollBy({ top: 1500, behavior: "instant" }); await __sleep(400);
      const header = __headerBottom(); const stuck = Math.round(__rowBtn(id).getBoundingClientRect().top);
      return { id, label, otherLabel, header, stuck, cardHeight: Math.round(__row(id).getBoundingClientRect().height) };`);
    check("N1 開著的那一列寫「收起」，其他列不寫", r.label.includes("收起") && !r.otherLabel.includes("收起"), { label: r.label, other: r.otherLabel });
    check("N1 往下看長卡片時，那一列黏在導覽列下面", r.cardHeight > 2000 && near(r.stuck, r.header, 2), r);
    await shot("n1-sticky-row.png");
    r = await ev(`const id = "210100"; __rowBtn(id).click(); await __waitFor(() => __id() === null, 3000); await __sleep(600);
      return { idAfter: __id(), open: __open(), rowTop: __top(id), focused: document.activeElement === __rowBtn(id) };`);
    check("N1 點黏著的那一列：收起、那一列放回導覽列下方、焦點在那一列", r.idAfter === null && r.open.length === 0 && near(r.rowTop, 80) && r.focused, r);
  });

  // N2 從連結打開、放在清單最上面的卡片（白狼人在第 121 筆）：上方一顆「收起」，往下看時黏在導覽列下面
  await section("N2", async () => {
    await clearRemembered();
    await navigate(`${BASE}/db/monsters?id=8140000`);
    let r = await ev(`await __ready(); await __sleep(900); const btn = __topCollapse();
      const controls = btn ? document.getElementById(btn.getAttribute("aria-controls") ?? "") : null;
      const a11y = { expanded: btn?.getAttribute("aria-expanded"), controlsCard: !!controls?.querySelector("article") };
      window.scrollBy({ top: 900, behavior: "instant" }); await __sleep(400);
      return { topCard: __topCard(), hasBtn: !!btn, a11y, header: __headerBottom(), stuck: btn ? Math.round(btn.getBoundingClientRect().top) : null };`);
    check("N2 最上面的卡片：上方有「收起」，往下看時黏在導覽列下面", r.topCard && r.hasBtn && near(r.stuck, r.header, 2), r);
    check("N2 最上面那顆「收起」告訴讀螢幕軟體：已展開、管的是下面那張卡", r.a11y.expanded === "true" && r.a11y.controlsCard, r.a11y);
    await shot("n2-sticky-top.png");
    r = await ev(`const btn = __topCollapse(); if (!btn) return { missing: true };
      btn.click(); await __waitFor(() => __id() === null, 3000); await __sleep(600);
      return { idAfter: __id(), topCard: __topCard(), listTop: __listTop() };`);
    check("N2 按上方的「收起」：收起、回到清單開頭", !r.missing && r.idAfter === null && !r.topCard && near(r.listTop, 80), r);
  });

  // N3 卡片不搬家：放在最上面的卡片，清單多載、把那一筆載進來，卡片還是在最上面；點清單上那一筆，卡片才搬到它下面
  await section("N3", async () => {
    await clearRemembered();
    await navigate(`${BASE}/db/monsters?id=8140000`);
    let r = await ev(`await __ready(); await __sleep(900); const id = "8140000";
      const inListBefore = !!__row(id); const rows = await __loadMore();
      window.scrollTo({ top: 0, behavior: "instant" }); await __sleep(300);
      return { inListBefore, rows, inList: !!__row(id), topCard: __topCard(), open: __open(), expanded: __rowBtn(id)?.getAttribute("aria-expanded") };`);
    check("N3 多載、那一筆載進清單了：卡片還是在最上面，沒有搬到清單中間", !r.inListBefore && r.inList && r.topCard && r.open.length === 0, r);
    check("N3 卡片在最上面時，清單上那一列告訴讀螢幕軟體「已展開」", r.expanded === "true", r.expanded);
    r = await ev(`const id = "8140000"; if (!__row(id)) return { missing: true }; const len0 = history.length;
      __row(id).scrollIntoView({ block: "center", behavior: "instant" }); await __sleep(300);
      __tap(id); await __sleep(150); __tap(id); await __sleep(1500);
      return { id: __id(), open: __open(), topCard: __topCard(), rowTop: __top(id), pushed: history.length - len0 };`);
    check("N3 點清單上那一筆（連點兩下）：卡片搬到那一列下面、沒有被第二下收掉、那一列捲到導覽列下方、不多一筆紀錄", !r.missing && r.id === "8140000" && r.open[0] === "8140000" && !r.topCard && near(r.rowTop, 80) && r.pushed === 0, r);
  });

  // N4 卡片展開在那一列下面，搜尋把那一列拿掉 → 移到最上面；清掉搜尋，那一列回來了，卡片還是在最上面；按上方的收起回到清單開頭
  await section("N4", async () => {
    await fresh("/db/items");
    let r = await ev(`const id = __rowId(5); __tap(id); await __waitFor(() => __id() === id); await __sleep(1200);
      window.scrollTo({ top: 0, behavior: "instant" }); await __sleep(200);
      __setSearch("沒有這種道具zz"); await __sleep(500);
      const whileSearching = { topCard: __topCard(), open: __open() };
      __setSearch(""); await __sleep(500);
      return { id, whileSearching, topCard: __topCard(), open: __open(), inList: !!__row(id) };`);
    check("N4 那一列被搜尋拿掉：卡片移到最上面", r.whileSearching.topCard && r.whileSearching.open.length === 0, r.whileSearching);
    check("N4 清掉搜尋、那一列回來了：卡片還是在最上面，不搬回清單中間", r.topCard && r.open.length === 0 && r.inList, r);
    r = await ev(`const btn = __topCollapse(); if (!btn) return { missing: true };
      btn.click(); await __waitFor(() => __id() === null, 3000); await __sleep(600);
      return { idAfter: __id(), listTop: __listTop() };`);
    check("N4 收起最上面的卡片（那一筆也在清單上）：回到清單開頭，不是跳到那一列", !r.missing && r.idAfter === null && near(r.listTop, 80), r);
  });

  // N10 卡片在最上面（那一列也在清單上）→ 往下點別筆 → 按返回：卡片還在最上面、回到點別筆之前的位置（不被補救拉走）
  await section("N10", async () => {
    await fresh("/db/items");
    const ctx = await ev(`const x = __rowId(5); __tap(x); await __waitFor(() => __id() === x); await __sleep(1200);
      window.scrollTo({ top: 0, behavior: "instant" }); await __sleep(200);
      __setSearch("沒有這種道具zz"); await __sleep(500); __setSearch(""); await __sleep(600);
      const pinned = __topCard() && !!__row(x) && __open().length === 0;
      const y = __rowId(30); __row(y).scrollIntoView({ block: "center", behavior: "instant" }); await __sleep(400);
      const yBefore = Math.round(scrollY);
      __tap(y); await __waitFor(() => __id() === y); await __sleep(1300);
      return { x, y, pinned, yBefore };`);
    const frames = await traverseRecording(-1, 1200, "Math.round(scrollY)", true);
    let r = await ev(`await __waitFor(() => __id() === ${JSON.stringify(ctx.x)}, 3000); await __sleep(400);
      return { id: __id(), topCard: __topCard(), open: __open(), backY: Math.round(scrollY) };`);
    r = { ...ctx, ...r, frames };
    check("N10 卡片在最上面（那一列也在清單上）→ 點別筆 → 按返回：卡片還在最上面", r.pinned && r.id === r.x && r.topCard && r.open.length === 0, r);
    check("N10 按返回回到點別筆之前的位置，不被拉走", near(r.backY, r.yBefore), { yBefore: r.yBefore, backY: r.backY, frames });
  });

  // N11 卡片在最上面（那一筆後來載進清單）→ 從卡片裡的連結離開 → 按返回：卡片還在最上面、捲回原位
  await section("N11", async () => {
    await clearRemembered();
    await navigate(`${BASE}/db/monsters?id=8140000`);
    const ctx = await ev(`await __ready(); await __sleep(900); const id = "8140000";
      await __loadMore(); window.scrollTo({ top: 0, behavior: "instant" }); await __sleep(300);
      const pinned = __topCard() && !!__row(id);
      const link = [...(__topWrap()?.querySelectorAll("article a") ?? [])].find(a => (a.getAttribute("href") || "").startsWith("/db/items"));
      if (!link) return { skipped: "白狼人卡片裡找不到道具連結" };
      link.scrollIntoView({ block: "center", behavior: "instant" }); await __sleep(300);
      const leftY = Math.round(scrollY);
      link.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })); link.click();
      await __waitFor(() => location.pathname === "/db/items"); await __sleep(1000);
      return { id, pinned, leftY };`);
    let r = ctx;
    if (!ctx.skipped) {
      const frames = await traverseRecording(-1, 1200, "Math.round(scrollY)", true);
      r = await ev(`await __waitFor(() => location.pathname === "/db/monsters"); await __sleep(500);
        return { topCard: __topCard(), open: __open(), backY: Math.round(scrollY) };`);
      r = { ...ctx, ...r, frames };
    }
    check("N11 卡片在最上面（那一筆後來載進清單）→ 從卡片的連結離開 → 按返回：卡片還在最上面、捲回原位", !r.skipped && r.pinned && r.topCard && r.open.length === 0 && near(r.backY, r.leftY), r);
  });

  // N5 按返回後位置對不上：開著卡片離開，在別處改了篩選（記憶整頁共用），按返回回來 → 那一筆和卡片要看得到，而且直接跳
  await section("N5", async () => {
    await fresh("/db/items");
    const ctx = await ev(`let id = null, link = null;
      for (let i = 30; i < 60 && !link; i++) {
        id = __rowId(i); __row(id).scrollIntoView({ block: "center", behavior: "instant" }); await __sleep(150);
        __tap(id); await __waitFor(() => __id() === id); await __sleep(900);
        link = [...document.querySelectorAll("#db-row-" + id + " article a")].find(a => (a.getAttribute("href") || "").startsWith("/db/monsters"));
        if (!link) { __tap(id); await __waitFor(() => __id() === null); await __sleep(400); }
      }
      if (!link) return { skipped: "第 31～60 筆找不到有怪物連結的道具" };
      link.scrollIntoView({ block: "center", behavior: "instant" }); await __sleep(300);
      const leftY = Math.round(scrollY);
      link.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })); link.click();
      await __waitFor(() => location.pathname === "/db/monsters"); await __sleep(1000);
      document.querySelector("header nav a[href='/db']").click(); await __waitFor(() => location.pathname === "/db"); await __sleep(800);
      document.querySelector('main a[href="/db/items"]').click(); await __waitFor(() => location.pathname === "/db/items"); await __ready(); await __sleep(800);
      __select("道具分類", "消耗"); await __sleep(800);
      return { id, leftY };`);
    let r = ctx;
    if (!ctx.skipped) {
      await traverse(-1);
      await ev(`await __waitFor(() => location.pathname === "/db"); await __sleep(700); return 1;`);
      await traverse(-1);
      await ev(`await __waitFor(() => location.pathname === "/db/monsters"); await __sleep(900); return 1;`);
      const frames = await traverseRecording(-1, 1200, "Math.round(scrollY)", true);
      r = await ev(`const id = ${JSON.stringify(ctx.id)};
        await __waitFor(() => location.pathname === "/db/items" && __id() === id, 3000); await __sleep(400);
        const block = __row(id)?.querySelector("article") ? __row(id) : __topWrap();
        const rect = block ? block.getBoundingClientRect() : null;
        return { backY: Math.round(scrollY), category: document.querySelector("main select[aria-label='道具分類']").value,
          top: rect && Math.round(rect.top), bottom: rect && Math.round(rect.bottom), header: __headerBottom(), view: innerHeight };`);
      r = { ...ctx, ...r, frames };
    }
    check("N5 按返回、中途在別處改了篩選：那一筆和卡片看得到（跳到導覽列下方）", !r.skipped && r.category === "消耗" && r.bottom > r.header && r.top < r.view && near(r.top, 80), r);
    check("N5 補救時直接跳、不滑", !r.skipped && r.frames.length <= 3, r.frames);
    await shot("n5-back-rescued.png");
  });

  // N6 按返回不誤跳：開著卡片、自己捲去看清單別處（卡片不在畫面上）再離開，返回時照離開時的位置
  await section("N6", async () => {
    await fresh("/db/items");
    const ctx = await ev(`const id = __rowId(3); __tap(id); await __waitFor(() => __id() === id); await __sleep(1200);
      window.scrollBy({ top: 3000, behavior: "instant" }); await __sleep(800);
      const leftY = Math.round(scrollY); const cardBottom = Math.round(__row(id).getBoundingClientRect().bottom);
      document.querySelector("header nav a[href='/db']").click(); await __waitFor(() => location.pathname === "/db"); await __sleep(800);
      return { id, leftY, cardBottom };`);
    await traverse(-1);
    let r = await ev(`await __waitFor(() => location.pathname === "/db/items"); await __sleep(800); return { backY: Math.round(scrollY), open: __open() };`);
    r = { ...ctx, ...r };
    check("N6 離開時卡片不在畫面上、清單沒變：返回照離開時的位置，不跳回卡片", r.cardBottom < 0 && r.open[0] === r.id && near(r.backY, r.leftY), r);
  });

  // N12 卡片開著時按過「跳到主要內容」（瀏覽器多一筆不是 Next 管的紀錄），之後打字、按返回、按下一頁：不會整頁重載
  await section("N12", async () => {
    await fresh("/db/items");
    const ctx = await ev(`const id = __rowId(3); __tap(id); await __waitFor(() => __id() === id); await __sleep(1200);
      const origin = performance.timeOrigin;
      document.querySelector('a[href="#main"]').click(); await __sleep(300);
      const skipped = location.hash === "#main" && history.state === null;
      const name = __rowBtn(id).querySelector("span.truncate")?.textContent ?? "";
      __setSearch(name); await __sleep(700);
      return { id, origin, skipped, name };`);
    await traverse(-1);
    await ev(`await __sleep(800); return 1;`);
    await traverse(+1);
    let r = await ev(`await __sleep(1500); return { sameDoc: performance.timeOrigin === ${ctx.origin}, path: location.pathname, hash: location.hash };`);
    r = { ...ctx, ...r };
    check("N12 卡片開著時按過「跳到主要內容」：之後按返回、下一頁不會整頁重載", r.skipped && r.sameDoc && r.path === "/db/items", r);
  });

  // N13 同一頁裡按返回也會補救：開著 X → 點 Y → 在 Y 這筆改篩選（X 不在清單上了）→ 按返回回到 X：X 的卡片要看得到，而且直接跳
  // （同一頁按返回時 Next 收到 popstate 就同步重畫，比 DbBrowser 自己的 popstate 監聽還早）
  await section("N13", async () => {
    await fresh("/db/items");
    const ctx = await ev(`const x = __rowId(30); __row(x).scrollIntoView({ block: "center", behavior: "instant" }); await __sleep(300);
      __tap(x); await __waitFor(() => __id() === x); await __sleep(1200);
      const y = __rowId(45); __row(y).scrollIntoView({ block: "center", behavior: "instant" }); await __sleep(300);
      __tap(y); await __waitFor(() => __id() === y); await __sleep(1200);
      __select("道具分類", "消耗"); await __sleep(800);
      return { x, y };`);
    const frames = await traverseRecording(-1, 1200, "Math.round(scrollY)", true);
    let r = await ev(`const x = ${JSON.stringify(ctx.x)}; await __waitFor(() => __id() === x, 3000); await __sleep(400);
      const block = __row(x)?.querySelector("article") ? __row(x) : __topWrap();
      const rect = block ? block.getBoundingClientRect() : null;
      return { id: __id(), category: document.querySelector("main select[aria-label='道具分類']").value,
        top: rect && Math.round(rect.top), bottom: rect && Math.round(rect.bottom), header: __headerBottom(), view: innerHeight };`);
    r = { ...ctx, ...r, frames };
    check("N13 同一頁按返回、清單在別筆被改過：那一筆和卡片看得到（跳到導覽列下方）", r.id === r.x && r.category === "消耗" && r.bottom > r.header && r.top < r.view && near(r.top, 80), r);
    check("N13 補救時直接跳、不滑", r.frames.length <= 3, r.frames);
  });

  // N14 怪物卡：出沒地圖不列還沒開放的圖、先列 5 張（現在就能去、刷怪點多的在前）＋「看全部 N 張」；
  // 掉落物不列沒有名字的道具；卡片下面那顆按鈕寫「收起」。答案拿網站自己的資料檔（怪物、地圖、道具）另外算
  const N14_DATA = `
    const urlOf = name => performance.getEntriesByType("resource").map(e => e.name).find(u => u.includes("/data/" + name + ".json")) ?? "/data/" + name + ".json";
    const [monsterData, mapData, itemData] = await Promise.all(["monsters", "maps", "items"].map(name => fetch(urlOf(name)).then(res => res.json())));
    const byId = new Map(itemData.map(item => [item.id, item]));
    const expect = id => {
      const m = monsterData.find(x => x.id === id);
      const mapIds = [...new Set([...(m.sp ?? []).map(x => x[0]), ...m.maps])];
      const openMaps = mapIds.filter(mapId => mapData[String(mapId)]?.zh).length;
      const namedDrops = m.drops.filter(itemId => byId.get(itemId) && !byId.get(itemId).un).length;
      return { openMaps, hiddenMaps: mapIds.length - openMaps, namedDrops, hiddenDrops: m.drops.length - namedDrops };
    };
    const sectionOf = (card, title) => [...card.querySelectorAll("section")].find(s => s.querySelector("h3")?.textContent.startsWith(title));
    const noteOf = section => [...(section?.querySelectorAll("p") ?? [])].map(p => p.textContent.trim()).find(t => t.startsWith("另有") || t.includes("都還沒")) ?? null;
  `;
  await section("N14", async () => {
    await fresh("/db/monsters");
    let r = await ev(`${N14_DATA}
      const id = "210100"; __tap(id); await __waitFor(() => __id() === id); await __sleep(1200);
      const want = expect(210100);
      const card = __row(id).querySelector("article");
      const maps = sectionOf(card, "出沒地圖");
      const rows = () => [...maps.querySelectorAll("ul > li")];
      const spawnsOf = li => { const m = li.textContent.match(/(\\d+) 個刷怪點/); return m ? Number(m[1]) : -1; };
      const header = Number(maps.querySelector("h3").textContent.match(/(\\d+) 張/)?.[1]);
      const before = rows().length;
      const more = [...maps.querySelectorAll("button")].find(b => b.textContent.includes("看全部"));
      const moreText = more ? more.textContent.trim() : null;
      // 用鍵盤按（先把焦點放上去再按）：按鈕按完會不見，焦點要落在新列出來的第一列
      more?.focus(); more?.click(); await __sleep(500);
      const sixth = rows()[before];
      const focusInSixth = !!sixth && sixth.contains(document.activeElement);
      const after = rows().map(li => ({ spawns: spawnsOf(li), later: li.textContent.includes("10/15 開放") }));
      return { want, header, before, moreText, focusInSixth, active: document.activeElement?.textContent?.trim().slice(0, 20) ?? null, after, note: noteOf(maps),
        unopened: card.textContent.includes("未開放地圖"), bottom: card.nextElementSibling?.textContent.trim() ?? null };`);
    const sorted = r.after.every((row, i, all) => i === 0 || (all[i - 1].later === row.later ? all[i - 1].spawns >= row.spawns : !all[i - 1].later && row.later));
    check("N14 出沒地圖只列開放的圖，先列 5 張，下面一顆「看全部 N 張」", r.header === r.want.openMaps && r.before === Math.min(5, r.header) && r.moreText === `看全部 ${r.want.openMaps} 張`, { want: r.want, header: r.header, before: r.before, moreText: r.moreText });
    check("N14 按「看全部」：全部列出來，現在就能去、刷怪點多的在前", r.after.length === r.want.openMaps && sorted, { count: r.after.length, rows: r.after.slice(0, 8) });
    check("N14 按「看全部」後焦點落在新列出來的第一列（用鍵盤、讀螢幕的人不會被丟回頁首）", r.focusInSixth, r.active);
    check("N14 還沒開放的圖不列，最後寫另有幾張", !r.unopened && r.note === `另有 ${r.want.hiddenMaps} 張還沒開放的地圖沒列出來`, { note: r.note, want: r.want, unopened: r.unopened });
    check("N14 卡片下面那顆按鈕寫「收起」", r.bottom === "收起", r.bottom);

    // 展開後點掉落物離開，再按返回：還是展開的，剛剛點的那一樣回到原本的位置
    const ctx = await ev(`const id = "210100"; const card = __row(id).querySelector("article");
      const link = [...card.querySelectorAll("a[href^='/db/items']")][0];
      link.scrollIntoView({ block: "center", behavior: "instant" }); await __sleep(300);
      const href = link.getAttribute("href"); const topBefore = Math.round(link.getBoundingClientRect().top);
      link.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })); link.click();
      await __waitFor(() => location.pathname === "/db/items"); await __sleep(1000);
      return { href, topBefore };`);
    await traverse(-1);
    r = await ev(`await __waitFor(() => location.pathname === "/db/monsters" && __id() === "210100"); await __sleep(600);
      const card = __row("210100")?.querySelector("article") ?? __topWrap()?.querySelector("article");
      const maps = [...card.querySelectorAll("section")].find(s => s.querySelector("h3")?.textContent.startsWith("出沒地圖"));
      const link = card.querySelector("a[href='" + ${JSON.stringify(ctx.href)} + "']");
      return { rows: maps.querySelectorAll("ul > li").length, more: [...maps.querySelectorAll("button")].some(b => b.textContent.includes("看全部")),
        topAfter: link ? Math.round(link.getBoundingClientRect().top) : null };`);
    check("N14 展開後離開再按返回：還是展開的，剛點的那一樣回到原本的位置", !r.more && r.rows > 5 && near(r.topAfter, ctx.topBefore, 8), { ...ctx, ...r });

    // 白狼人：掉落物只列有名字的，最後寫另有幾樣
    await clearRemembered();
    await navigate(`${BASE}/db/monsters?id=8140000`);
    r = await ev(`await __ready(); await __sleep(900); ${N14_DATA}
      const want = expect(8140000); const card = __topWrap()?.querySelector("article");
      const drops = sectionOf(card, "掉落物");
      const header = Number(drops.querySelector("h3").textContent.match(/(\\d+) 樣/)?.[1]);
      const chips = [...drops.querySelectorAll("ul > li")].map(li => li.textContent.trim());
      return { want, header, chips: chips.length, unnamed: chips.filter(t => t.startsWith("未命名")).length, note: noteOf(drops) };`);
    check("N14 掉落物不列沒有名字的道具，最後寫另有幾樣", r.header === r.want.namedDrops && r.chips === r.header && r.unnamed === 0 && r.note === `另有 ${r.want.hiddenDrops} 樣還沒有名字的道具沒列出來`, r);
    await shot("n14-monster-card.png");

    // 幼黑格里芬：掉的全都沒有名字——標題不寫樣數，寫「掉的 N 樣道具都還沒有名字，沒列出來」
    await navigate(`${BASE}/db/monsters?id=6230401`);
    r = await ev(`await __ready(); await __sleep(900); ${N14_DATA}
      const want = expect(6230401);
      const card = __row("6230401")?.querySelector("article") ?? __topWrap()?.querySelector("article");
      const drops = sectionOf(card, "掉落物");
      return { want, title: drops?.querySelector("h3")?.textContent.trim() ?? null, chips: drops?.querySelectorAll("ul > li").length ?? null, note: noteOf(drops) };`);
    check("N14 掉的全都沒有名字：不列、寫「掉的 N 樣道具都還沒有名字，沒列出來」", r.want.namedDrops === 0 && r.title === "掉落物" && r.chips === 0 && r.note === `掉的 ${r.want.hiddenDrops} 樣道具都還沒有名字，沒列出來`, r);
  });

  // N15 自動載入接到 600 筆就停，換成看得到的「再載 120 筆」（道具清單有好幾千筆，不停的話頁尾永遠滑不到）
  await section("N15", async () => {
    await fresh("/db/items");
    // 一直捲到底：每次自動接一批，接到不再變多為止（最多 8 次）
    let r = await ev(`const counts = [__rows().length];
      for (let i = 0; i < 8; i++) {
        const before = __rows().length;
        window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" });
        await __waitFor(() => __rows().length > before, 1500); await __sleep(500);
        counts.push(__rows().length);
        if (__rows().length === before) break;
      }
      const btn = __moreBtn(); const footer = document.querySelector("body > footer")?.getBoundingClientRect();
      return { counts, btnShown: __shows(btn), btnText: btn?.textContent.trim() ?? null,
        footerInView: !!footer && footer.top < innerHeight && footer.bottom <= innerHeight + 1,
        remembered: JSON.parse(sessionStorage.getItem("ms-db:db:道具:visible") ?? "null") };`);
    check("N15 捲到底自動接到剛好 600 筆就停（再捲到底也不再接）", JSON.stringify(r.counts) === JSON.stringify([60, 180, 300, 420, 540, 600, 600]) && r.remembered === 600, r);
    check("N15 到 600 筆：清單下面一顆看得到的「再載 120 筆」，頁尾滑得到", r.btnShown && r.btnText === "再載 120 筆" && r.footerInView, r);
    await shot("n15-more-button.png");
    r = await ev(`const btn = __moreBtn(); btn.focus(); btn.click(); await __waitFor(() => __rows().length > 600, 3000); await __sleep(400);
      return { rows: __rows().length, remembered: JSON.parse(sessionStorage.getItem("ms-db:db:道具:visible") ?? "null"),
        btnStill: __shows(__moreBtn()), focusOnBtn: !!__moreBtn() && document.activeElement === __moreBtn() };`);
    check("N15 按「再載 120 筆」：多 120 筆、記住筆數；按鈕還在、焦點留在按鈕上（可以一直按）", r.rows === 720 && r.remembered === 720 && r.btnStill && r.focusOnBtn, r);
  });

  // N16 搜尋框有字時右邊一顆「×」：按了字清掉、清單回到原本、焦點留在搜尋框
  await section("N16", async () => {
    await fresh("/db/items");
    const r = await ev(`const none = !__clearBtn(); const firstBefore = __rowId(0); const rowsBefore = __rows().length;
      __setSearch("帽"); await __sleep(500);
      const btn = __clearBtn(); const shown = __shows(btn); const firstWhileSearching = __rowId(0);
      btn?.click(); await __sleep(600);
      return { none, shown, firstBefore, firstWhileSearching, query: __search().value, focused: document.activeElement === __search(),
        gone: !__clearBtn(), firstAfter: __rowId(0), rowsBefore, rowsAfter: __rows().length };`);
    check("N16 搜尋框沒字時沒有「×」、有字時右邊出現「×」", r.none && r.shown, r);
    check("N16 按「×」：字清掉、清單回到原本、焦點留在搜尋框、「×」不見", r.query === "" && r.focused && r.gone && r.firstWhileSearching !== r.firstBefore && r.firstAfter === r.firstBefore && r.rowsAfter === r.rowsBefore, r);
  });

  // X1 打寶「自己找」的搜尋框也有「×」
  await section("X1", async () => {
    await navigate(`${BASE}/plan/farm`);
    const r = await ev(`await __waitFor(() => !!document.querySelector("main input[aria-label='搜尋道具']"));
      const input = document.querySelector("main input[aria-label='搜尋道具']"); const box = input.parentElement;
      const none = !__clearBtn(box);
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, "楓葉"); input.dispatchEvent(new Event("input", { bubbles: true }));
      await __sleep(400); const btn = __clearBtn(box); const shown = __shows(btn);
      btn?.click(); await __sleep(400);
      return { none, shown, value: input.value, focused: document.activeElement === input, gone: !__clearBtn(box) };`);
    check("X1 打寶「自己找」：有字時出現「×」，按了字清掉、焦點留在搜尋框", r.none && r.shown && r.value === "" && r.focused && r.gone, r);
  });

  // X2 帶我去選地圖：有字時「×」清掉字；已經選了地圖、按「更改」後還沒打字時，那顆「×」照舊是「取消更改」
  await section("X2", async () => {
    await navigate(`${BASE}/go`);
    const r = await ev(`const picker = () => [...document.querySelectorAll("main div.relative")].find(d => d.firstElementChild?.textContent === "要去哪裡");
      const inputOf = () => picker()?.querySelector("input");
      await __waitFor(() => !!inputOf());
      const setValue = v => { const el = inputOf(); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, v); el.dispatchEvent(new Event("input", { bubbles: true })); };
      const box = () => inputOf()?.parentElement ?? null;
      const none = !__clearBtn(box());
      setValue("弓箭手"); await __sleep(500);
      const shown = __shows(__clearBtn(box()));
      __clearBtn(box())?.click(); await __sleep(400);
      const cleared = { value: inputOf().value, focused: document.activeElement === inputOf(), gone: !__clearBtn(box()) };
      // 選一張圖，再按「更改」
      setValue("弓箭手村"); await __waitFor(() => !!picker()?.querySelector("ul button"), 5000);
      picker().querySelector("ul button").click(); await __sleep(600);
      const change = picker()?.querySelector("button");
      const changed = !!change && change.textContent.includes("更改");
      change?.click(); await __sleep(400);
      const cancelBefore = !!box()?.querySelector("button[aria-label='取消更改']") && !__clearBtn(box());
      setValue("天空"); await __sleep(400);
      const typing = { clear: !!__clearBtn(box()), cancel: !!box()?.querySelector("button[aria-label='取消更改']") };
      __clearBtn(box())?.click(); await __sleep(400);
      const cancelAfter = !!box()?.querySelector("button[aria-label='取消更改']") && inputOf()?.value === "";
      return { none, shown, cleared, changed, cancelBefore, typing, cancelAfter };`);
    check("X2 帶我去選地圖：有字時出現「×」，按了字清掉、焦點留在搜尋框", r.none && r.shown && r.cleared.value === "" && r.cleared.focused && r.cleared.gone, r);
    check("X2 已選地圖按「更改」：沒字時是「取消更改」，打字後換成清掉字的「×」（只會有一顆），清掉後又變回「取消更改」", r.changed && r.cancelBefore && r.typing.clear && !r.typing.cancel && r.cancelAfter, r);
  });

  // N7 捲到底自動載入：沒有看得到的「再載」按鈕，捲到清單底下就自動接上 120 筆，筆數記住
  await section("N7", async () => {
    await fresh("/db/items");
    let r = await ev(`const visibleMore = __shows(__moreBtn()); const before = __rows().length;
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" });
      await __waitFor(() => __rows().length > before, 3000); await __sleep(400);
      return { visibleMore, before, after: __rows().length, remembered: JSON.parse(sessionStorage.getItem("ms-db:db:道具:visible") ?? "null") };`);
    check("N7 沒有看得到的「再載」按鈕", r.visibleMore === false, r);
    check("N7 捲到清單底下：自動多載 120 筆、記住筆數", r.before === 60 && r.after === 180 && r.remembered === 180, r);
    // N8 讀螢幕的人：看不到的「再載」按鈕還在，按了一樣多載
    r = await ev(`window.scrollTo({ top: 0, behavior: "instant" }); await __sleep(300);
      const btn = __moreBtn(); if (!btn) return { missing: true };
      const before = __rows().length; const hidden = !__shows(btn); btn.click();
      await __waitFor(() => __rows().length > before, 3000); await __sleep(300);
      return { hidden, text: btn.textContent.trim(), before, after: __rows().length };`);
    check("N8 讀螢幕用的「再載」按鈕：平常看不到、按了多載 120 筆", !r.missing && r.hidden && r.after === r.before + 120, r);
  });

  // N9 減少動態效果：點一筆，那一列直接跳到導覽列下方（不滑）；沒開照舊平滑
  await section("N9", async () => {
    for (const reduce of [true, false]) {
      await reduceMotion(reduce);
      await fresh("/db/quests");
      const r = await ev(`const id = __rowId(3); window.scrollTo({ top: 0, behavior: "instant" }); await __sleep(300);
        const before = __top(id); const framesP = __painted(900, () => __top(id)); __tap(id); const frames = await framesP;
        return { id, before, end: __top(id), frames: __changes(frames) };`);
      if (reduce) check("N9 減少動態效果（手機）：點一筆直接跳到導覽列下方、不滑", near(r.end, 80) && r.frames.length <= 2, r);
      else check("N9 沒開減少動態效果（手機）：照舊平滑捲過去", near(r.end, 80) && r.frames.length >= 4, r);
    }
  });
  await reduceMotion(false);

  // ── 手機：手指往下滑時導覽列收起來，往上滑一點就出來；網站自己捲不收（v0.53，全站） ──

  await section("H1–H10", async () => {
    await mobile();
    await touchMode(true);
    try {
      await fresh("/db/items");
      const y0 = await ev(`return Math.round(scrollY);`);
      await swipe(500);
      // 陰影拿掉後 Tailwind 會留幾層全透明、0px 的陰影：扣掉這些還剩東西才算看得到
      let r = await ev(`const shadow = getComputedStyle(document.querySelector("body > header")).boxShadow;
        return { y: Math.round(scrollY), header: __headerBottom(), shadow, shadowShown: shadow !== "none" && shadow.replace(/rgba\\(0, 0, 0, 0\\) 0px 0px 0px 0px/g, "").replace(/[ ,]/g, "") !== "" };`);
      check("H1 手指往下滑：導覽列收起來（下緣的陰影也拿掉，畫面頂端不留一條影子）", r.y > y0 + 300 && r.header <= 0 && !r.shadowShown, { y0, ...r });
      await shot("h1-header-hidden.png");
      const yHidden = r.y;
      await swipe(-40);
      r = await ev(`const shadow = getComputedStyle(document.querySelector("body > header")).boxShadow;
        return { y: Math.round(scrollY), header: __headerBottom(), shadowShown: shadow !== "none" && shadow.replace(/rgba\\(0, 0, 0, 0\\) 0px 0px 0px 0px/g, "").replace(/[ ,]/g, "") !== "" };`);
      check("H2 往上滑一點：導覽列出來（陰影也回來）", r.y < yHidden && r.y > 200 && r.header >= 60 && r.shadowShown, { yHidden, ...r });

      // H3 導覽列收著時點一筆（手指點，不移動）：網站自己捲，導覽列不跑出來；那一列放到畫面最上面附近（不留導覽列的空位）
      await swipe(300);
      const pos = await ev(`const id = __rowId(30); const b = __rowBtn(id); b.scrollIntoView({ block: "center", behavior: "instant" }); await __sleep(400);
        const rc = b.getBoundingClientRect(); return { id, x: Math.round(rc.left + rc.width / 2), y: Math.round(rc.top + rc.height / 2), header: __headerBottom() };`);
      await fingerTap(pos.x, pos.y);
      r = await ev(`await __waitFor(() => __id() === ${JSON.stringify(pos.id)}, 3000); await __sleep(1400);
        return { id: __id(), header: __headerBottom(), rowTop: __top(${JSON.stringify(pos.id)}) };`);
      check("H3 導覽列收著時點一筆：網站自己捲，導覽列不跑出來；那一列放到畫面最上面", pos.header <= 0 && r.id === pos.id && r.header <= 0 && near(r.rowTop, 15), { pos, ...r });

      // H4 長卡片開著（綠水靈展開）：導覽列收起來，黏住的那一列貼到最上面；往上滑一點導覽列出來，那一列跟著回到導覽列下面
      await fresh("/db/monsters");
      await ev(`const id = "210100"; __tap(id); await __waitFor(() => __id() === id); await __sleep(1200);
        [...__row(id).querySelectorAll("article button")].find(b => b.textContent.includes("看全部"))?.click(); await __sleep(400); return 1;`);
      await swipe(700);
      r = await ev(`return { header: __headerBottom(), stuck: Math.round(__rowBtn("210100").getBoundingClientRect().top) };`);
      check("H4 導覽列收起來：黏住的那一列跟著貼到最上面", r.header <= 0 && near(r.stuck, 0, 2), r);
      await shot("h4-sticky-row-top.png");
      await swipe(-40);
      r = await ev(`return { header: __headerBottom(), stuck: Math.round(__rowBtn("210100").getBoundingClientRect().top) };`);
      check("H4 往上滑一點、導覽列出來：那一列跟著回到導覽列下面", r.header >= 60 && near(r.stuck, r.header, 2), r);

      // H5 網站自己捲不收也不叫出來：手指點一筆（不移動）讓網站往下捲，導覽列在的不收；
      // 收著的時候手指點一筆、再按返回（網站往上捲回原位），收著的也不跑出來
      await fresh("/db/items");
      const tapAt = async index => {
        const pos = await ev(`const id = __rowId(${index}); const b = __rowBtn(id); const rc = b.getBoundingClientRect();
          return { id, x: Math.round(rc.left + rc.width / 2), y: Math.round(rc.top + rc.height / 2) };`);
        await fingerTap(pos.x, pos.y);
        return ev(`await __waitFor(() => __id() === ${JSON.stringify(pos.id)}, 3000); await __sleep(1400);
          return { id: __id(), y: Math.round(scrollY), header: __headerBottom() };`);
      };
      // 手指點得到的：畫面裡、離頂端 300px 以下的第一列
      const visibleRow = () => ev(`const rows = __rows(); return rows.indexOf(rows.find(l => l.getBoundingClientRect().top > 300 && l.getBoundingClientRect().bottom < innerHeight - 40));`);
      await ev(`window.scrollTo({ top: 0, behavior: "instant" }); await __sleep(300); return 1;`);
      const shownBefore = await ev(`return { header: __headerBottom() };`);
      const shownTap = { before: shownBefore, after: await tapAt(await visibleRow()) };
      check("H5 導覽列在的時候手指點一筆（網站往下捲）：導覽列不收", shownTap.before.header >= 60 && shownTap.after.y > 200 && shownTap.after.header >= 60, shownTap);
      await traverse(-1);
      await ev(`await __waitFor(() => __id() === null, 3000); await __sleep(600); window.scrollTo({ top: 1500, behavior: "instant" }); await __sleep(400); return 1;`);
      await swipe(300);
      const yBeforeTap = await ev(`return Math.round(scrollY);`);
      const hiddenTap = { index: await visibleRow(), header: await ev(`return __headerBottom();`) };
      const hiddenAfterTap = await tapAt(hiddenTap.index);
      await traverse(-1);
      const hiddenBack = await ev(`await __waitFor(() => __id() === null, 3000); await __sleep(900); return { y: Math.round(scrollY), header: __headerBottom() };`);
      check("H5 導覽列收著的時候手指點一筆、再按返回（網站捲回原位）：導覽列一直收著、回到點之前的位置",
        hiddenTap.header <= 0 && hiddenAfterTap.header <= 0 && hiddenBack.header <= 0 && near(hiddenBack.y, yBeforeTap, 3), { yBeforeTap, hiddenTap, hiddenAfterTap, hiddenBack });

      // H6 收著的時候用鍵盤移到導覽列上：導覽列出來（不然焦點在看不到的地方）
      await swipe(500);
      r = await ev(`const hiddenBefore = __headerBottom() <= 0; document.querySelector("body > header a").focus(); await __sleep(500);
        return { hiddenBefore, header: __headerBottom() };`);
      check("H6 收著的時候用鍵盤移到導覽列：導覽列出來", r.hiddenBefore && r.header >= 60, r);

      // H7 收著的時候網站自己捲回頁面最上面（例如 iPhone 點狀態列）：導覽列出來，不會留一塊空白
      await swipe(250);
      const hiddenBefore = await ev(`return __headerBottom() <= 0;`);
      r = await ev(`window.scrollTo({ top: 0, behavior: "instant" }); await __sleep(600); return { y: Math.round(scrollY), header: __headerBottom() };`);
      check("H7 收著的時候回到頁面最上面：導覽列出來", hiddenBefore && r.y === 0 && r.header >= 60, { hiddenBefore, ...r });

      // H8 平板、觸控筆電：手指收起來之後改用觸控板、滑鼠滾輪往上捲，導覽列一樣出來
      await ev(`window.scrollTo({ top: 1500, behavior: "instant" }); await __sleep(400); return 1;`);
      await swipe(300);
      const hiddenWheel = await ev(`return __headerBottom() <= 0;`);
      await page.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: 190, y: 400, deltaX: 0, deltaY: -120 });
      r = await ev(`await __sleep(700); return { header: __headerBottom() };`);
      check("H8 手指收起來之後用觸控板、滑鼠滾輪往上捲：導覽列出來", hiddenWheel && r.header >= 60, { hiddenWheel, ...r });

      // H9 收著的時候換到別頁（點卡片裡的掉落物）：新頁面照「導覽列在」放卡片，導覽列回來不會蓋住卡片標題
      // （道具頁先載過，換過去第一個畫面就有清單、馬上跳到卡片——這時候最容易照收著的位置放）
      await fresh("/db/items");
      await ev(`window.next.router.push("/db/monsters?id=210100");
        await __waitFor(() => location.pathname === "/db/monsters" && !!__row("210100")?.querySelector("article"), 10000); await __sleep(1200); return 1;`);
      await swipe(400);
      const hiddenCross = await ev(`return __headerBottom() <= 0;`);
      r = await ev(`const link = __row("210100")?.querySelector("article a[href^='/db/items']");
        if (!link) return { skipped: "綠水靈卡片裡找不到道具連結" };
        const id = new URLSearchParams(link.getAttribute("href").split("?")[1]).get("id");
        link.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })); link.click();
        await __waitFor(() => location.pathname === "/db/items" && __id() === id, 10000); await __sleep(1300);
        const inline = !!__row(id)?.querySelector("article"); const block = inline ? __row(id) : __topWrap();
        const title = block?.querySelector("article h2")?.getBoundingClientRect(); const stuck = (inline ? __rowBtn(id) : __topCollapse())?.getBoundingClientRect();
        return { id, header: __headerBottom(), blockTop: block ? Math.round(block.getBoundingClientRect().top) : null,
          titleTop: title ? Math.round(title.top) : null, stuckBottom: stuck ? Math.round(stuck.bottom) : null };`);
      check("H9 導覽列收著時點卡片裡的掉落物換到道具頁：導覽列出來、卡片放在導覽列下方、標題沒被蓋住",
        hiddenCross && !r.skipped && r.header >= 60 && near(r.blockTop, 80) && r.titleTop > r.stuckBottom, { hiddenCross, ...r });

      // H10 收著的時候點「看打法」換到組隊圖解的那一段：那一段放在導覽列下方（約 80px），導覽列回來不會蓋住標題
      await ev(`window.scrollTo({ top: 1500, behavior: "instant" }); await __sleep(400); return 1;`);
      await swipe(300);
      const hiddenGuide = await ev(`return __headerBottom() <= 0;`);
      r = await ev(`window.next.router.push("/guide#pq-moon");
        await __waitFor(() => location.pathname === "/guide" && !!document.getElementById("pq-moon"), 10000); await __sleep(1500);
        return { header: __headerBottom(), sectionTop: Math.round(document.getElementById("pq-moon").getBoundingClientRect().top) };`);
      check("H10 導覽列收著時點「看打法」換到組隊圖解：那一段放在導覽列下方、標題沒被蓋住", hiddenGuide && r.header >= 60 && near(r.sectionTop, 80), { hiddenGuide, ...r });
    } finally {
      await touchMode(false);
    }
  });

  // ── 桌機 ──

  // 桌機：右邊那一欄、沒有收起按鈕；再點同一筆不收起；網址打開不捲
  await section("D1–D3", async () => {
    await desktop();
    await fresh("/db/items");
    let r = await ev(`const id = __rowId(2); __tap(id); await __waitFor(() => __id() === id); await __sleep(1200);
      const side = document.querySelector("main .grid > div.min-w-0 article");
      const anyCollapse = [...document.querySelectorAll("main button")].some(b => b.textContent.includes("收起"));
      return { inline: __open(), side: !!side, collapse: anyCollapse };`);
    check("D1 桌機點一筆：細節在右邊那一欄、沒有收起按鈕", r.side && r.inline.length === 0 && !r.collapse, r);
    await shot("d1-desktop.png");
    r = await ev(`const before = history.length; const id = __id(); __tap(id); await __sleep(600); return { id: __id(), side: !!document.querySelector("main .grid > div.min-w-0 article"), pushed: history.length - before };`);
    check("D2 桌機再點同一筆：不收起、不多一筆紀錄", r.id !== null && r.side && r.pushed === 0, r);
    await navigate(`${BASE}/db/items?id=1302020`);
    r = await ev(`await __ready(); await __sleep(900); return { y: Math.round(scrollY), side: !!document.querySelector("main .grid > div.min-w-0 article") };`);
    check("D3 桌機網址打開：細節在右邊、不捲", r.side && r.y === 0, r);
  });

  // D4 桌機、減少動態效果：右邊那一欄自己捲到下面，再點同一筆，那一欄捲回卡片頂端——開了直接跳，沒開照舊平滑；頁面都不動
  await section("D4", async () => {
    await desktop();
    for (const reduce of [true, false]) {
      await reduceMotion(reduce);
      await fresh("/db/monsters");
      const r = await ev(`const id = "210100"; __tap(id); await __waitFor(() => __id() === id); await __sleep(1000);
        const side = __side(); [...side.querySelectorAll("button")].find(b => b.textContent.includes("看全部"))?.click(); await __sleep(400);
        side.scrollTo({ top: 900, behavior: "instant" }); await __sleep(300);
        const before = Math.round(side.scrollTop); const y = Math.round(scrollY);
        const framesP = __painted(1200, () => Math.round(side.scrollTop)); __tap(id); const frames = await framesP;
        return { before, end: Math.round(side.scrollTop), frames: __changes(frames), pageMoved: Math.round(scrollY) - y };`);
      if (reduce) check("D4 減少動態效果（桌機）：再點同一筆，右邊那一欄直接跳回卡片頂端、不滑", r.before > 300 && r.end === 0 && r.frames.length <= 2 && r.pageMoved === 0, r);
      else check("D4 沒開減少動態效果（桌機）：再點同一筆，右邊那一欄平滑捲回卡片頂端", r.before > 300 && r.end === 0 && r.frames.length >= 4 && r.pageMoved === 0, r);
    }
  });
  await reduceMotion(false);

  // D5 桌機：右邊那一欄黏在導覽列下面；清單捲到很下面再點一筆，頁面不跳回上面，右邊直接換成那一筆、從頭顯示
  await section("D5", async () => {
    await desktop();
    await fresh("/db/monsters");
    // 先開綠水靈、看全部（卡片很長），右邊那一欄捲到 600：換一筆後要回到卡片頂端，才看得出有沒有「從頭顯示」
    const r = await ev(`const a = "210100"; __tap(a); await __waitFor(() => __id() === a); await __sleep(1000);
      const side = __side(); [...side.querySelectorAll("button")].find(b => b.textContent.includes("看全部"))?.click(); await __sleep(400);
      side.scrollTo({ top: 600, behavior: "instant" }); await __sleep(300); const sideBefore = Math.round(side.scrollTop);
      const b = __rowId(40); __row(b).scrollIntoView({ block: "center", behavior: "instant" }); await __sleep(400);
      const y = Math.round(scrollY); const header = __headerBottom();
      __tap(b); await __waitFor(() => __id() === b); await __sleep(1200);
      const rect = side.getBoundingClientRect();
      return { sideBefore, y, yAfter: Math.round(scrollY), header, sideTop: Math.round(rect.top), sideBottom: Math.round(rect.bottom), view: innerHeight,
        scrollTop: Math.round(side.scrollTop), name: __rowBtn(b).querySelector("span.truncate")?.textContent ?? "", title: side.querySelector("article h2")?.textContent ?? "" };`);
    check("D5 桌機清單捲到下面點一筆：頁面不跳回上面", r.y > 1000 && Math.abs(r.yAfter - r.y) <= 2, r);
    check("D5 右邊那一欄黏在導覽列下面、整欄在畫面裡", r.sideTop >= r.header && r.sideTop <= r.header + 16 && r.sideBottom <= r.view, r);
    check("D5 右邊換成新點的那一筆、從卡片頂端開始（原本那張捲到一半）", r.sideBefore > 300 && r.scrollTop === 0 && r.name !== "" && r.title.includes(r.name), r);
    await shot("d5-desktop-sticky.png");
  });

  // D6 桌機長卡片（綠水靈展開）：整張放不下時在右邊那一欄裡自己捲，滾輪捲的是那一欄、頁面不動
  await section("D6", async () => {
    await desktop();
    await fresh("/db/monsters");
    const ctx = await ev(`const id = "210100"; __tap(id); await __waitFor(() => __id() === id); await __sleep(1000);
      const side = __side(); [...side.querySelectorAll("button")].find(b => b.textContent.includes("看全部"))?.click(); await __sleep(400);
      // 頁面往下捲一點，那一欄黏住了再量（在頁面最上面時那一欄還在原本的位置，下緣本來就在畫面外）
      window.scrollTo({ top: 600, behavior: "instant" }); await __sleep(400);
      const rect = side.getBoundingClientRect();
      return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2), overflow: side.scrollHeight - side.clientHeight,
        bottom: Math.round(rect.bottom), view: innerHeight, pageY: Math.round(scrollY) };`);
    await page.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: ctx.x, y: ctx.y, deltaX: 0, deltaY: 400 });
    const r = await ev(`await __sleep(900); return { scrollTop: Math.round(__side().scrollTop), pageY: Math.round(scrollY) };`);
    check("D6 桌機長卡片：在右邊那一欄裡自己捲（滾輪捲的是那一欄，頁面不動）", ctx.overflow > 200 && ctx.bottom <= ctx.view && r.scrollTop > 100 && r.pageY === ctx.pageY, { ...ctx, ...r });
  });

  // D7 桌機清單整個列完、捲到最底（頁尾出來了，右邊那一欄被往上推走一截）再點最後一筆：頁面往上一點，卡片頂端出來
  await section("D7", async () => {
    // 很矮的桌機畫面（1280×450）：頁尾出來時上面只剩約 50px，哪一張卡片都放不下、一定被推走
    await page.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 450, deviceScaleFactor: 1, mobile: false });
    await fresh("/db/items");
    // 先開一筆（右邊那一欄有一張卡，捲到最底時才會被頁尾往上推）
    const r = await ev(`__setSearch("帽"); await __sleep(600);
      const first = __rowId(0); __tap(first); await __waitFor(() => __id() === first); await __sleep(800);
      for (let i = 0; i < 12; i++) {
        const before = __rows().length; const btn = __moreBtn();
        if (__shows(btn)) btn.click(); else window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" });
        await __waitFor(() => __rows().length > before, 1500); await __sleep(300);
        if (__rows().length === before) break;
      }
      const count = [...document.querySelectorAll("main p")].map(p => p.textContent.trim()).find(t => /^[0-9,]+ 筆$/.test(t)) ?? "";
      const total = Number(count.replace(/[^0-9]/g, "") || 0);
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }); await __sleep(500);
      const side = __side(); const pushedBy = Math.round(parseFloat(getComputedStyle(side).top) - side.getBoundingClientRect().top);
      const yBefore = Math.round(scrollY);
      const id = __rowId(__rows().length - 1); __tap(id); await __waitFor(() => __id() === id); await __sleep(1300);
      const rect = side.getBoundingClientRect(); const row = __row(id).getBoundingClientRect();
      return { rows: __rows().length, total, pushedBy, yBefore, yAfter: Math.round(scrollY), header: __headerBottom(), sideTop: Math.round(rect.top),
        rowTop: Math.round(row.top), rowBottom: Math.round(row.bottom), view: innerHeight };`);
    check("D7 清單到底、右邊那一欄被往上推走時點最後一筆：頁面往上一點、卡片頂端出來、點的那一筆還在畫面上",
      r.rows === r.total && r.pushedBy > 20 && r.yAfter < r.yBefore && r.sideTop >= r.header && r.sideTop <= r.header + 16 && r.rowTop >= r.header && r.rowBottom <= r.view, r);
  });

  // D8 桌機右邊那一欄捲到卡片中段：重新整理、點卡片裡的連結離開再按返回、同一頁點別筆再按返回，都回到原本讀到的地方
  await section("D8", async () => {
    await desktop();
    await fresh("/db/monsters");
    // 開綠水靈、看全部（卡片很長），那一欄捲到 900；捲動停下來才記進紀錄，等一下
    await ev(`const id = "210100"; __tap(id); await __waitFor(() => __id() === id); await __sleep(1000);
      const side = __side(); [...side.querySelectorAll("button")].find(b => b.textContent.includes("看全部"))?.click(); await __sleep(400);
      side.scrollTo({ top: 900, behavior: "instant" }); await __sleep(700); return 1;`);
    await reload();
    const afterReload = await ev(`await __ready(); await __waitFor(() => !!__side()?.querySelector("article")); await __sleep(1200); return Math.round(__side().scrollTop);`);

    // 點卡片裡的掉落物離開，再按返回
    const left = await ev(`const side = __side(); side.scrollTo({ top: 900, behavior: "instant" }); await __sleep(700);
      const link = side.querySelector("a[href^='/db/items']"); if (!link) return { skipped: "綠水靈卡片裡找不到道具連結" };
      link.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })); link.click();
      await __waitFor(() => location.pathname === "/db/items"); await __sleep(1000); return {};`);
    let afterBack = null;
    if (!left.skipped) {
      await traverse(-1);
      afterBack = await ev(`await __waitFor(() => location.pathname === "/db/monsters" && __id() === "210100"); await __waitFor(() => !!__side()?.querySelector("article"));
        await __sleep(1200); return Math.round(__side().scrollTop);`);
    }

    // 同一頁點別筆（那一筆從卡片頂端開始），再按返回
    const same = await ev(`const side = __side(); side.scrollTo({ top: 700, behavior: "instant" }); await __sleep(700);
      const other = __rows().map(li => li.id.replace("db-row-", "")).find(x => x !== "210100");
      __tap(other); await __waitFor(() => __id() === other); await __sleep(1000);
      return { other, otherTop: Math.round(__side().scrollTop) };`);
    await traverse(-1);
    const afterSameBack = await ev(`await __waitFor(() => __id() === "210100", 3000); await __sleep(1000); return Math.round(__side().scrollTop);`);

    check("D8 桌機右邊那一欄捲到卡片中段，重新整理：回到原本讀到的地方", near(afterReload, 900, 8), { afterReload });
    check("D8 點卡片裡的連結離開再按返回：右邊那一欄回到原本讀到的地方", !left.skipped && near(afterBack, 900, 8), { ...left, afterBack });
    check("D8 同一頁點別筆（從卡片頂端開始）再按返回：回到原本讀到的地方", same.otherTop === 0 && near(afterSameBack, 700, 8), { ...same, afterSameBack });
  });

  // H11 桌機用滑鼠滾輪往下捲：導覽列不收（只有手指滑才收）
  await section("H11", async () => {
    await desktop();
    await fresh("/db/items");
    await page.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: 200, y: 400, deltaX: 0, deltaY: 1500 });
    const r = await ev(`await __sleep(1200); return { y: Math.round(scrollY), header: __headerBottom() };`);
    check("H11 桌機滑鼠滾輪往下捲：導覽列不收", r.y > 800 && r.header >= 60, r);
  });
} catch (error) {
  results.push({ name: "ERROR", ok: false, detail: String(error?.stack ?? error).slice(0, 800) });
} finally {
  // Browser.close 有時不回應（WebSocket 先斷）：最多等 2 秒，再把整個 Chrome 收掉
  if (browser) {
    try { await Promise.race([browser.send("Browser.close", {}, 2000), sleep(2000)]); } catch {}
  }
  if (chrome?.pid) {
    if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(chrome.pid), "/T", "/F"], { stdio: "ignore" });
    else chrome.kill("SIGKILL");
  }
  await sleep(500);
  try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch {}
}
check("console 沒有錯誤、警告、例外", consoleProblems.length === 0, [...new Set(consoleProblems)].slice(0, 8));
fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(results, null, 2));
for (const x of results) console.log(`${x.ok ? "PASS" : "FAIL"}  ${x.name}${x.ok ? "" : "  " + JSON.stringify(x.detail).slice(0, 400)}`);
const failed = results.filter(x => !x.ok).length;
console.log(`\n${results.length - failed}／${results.length} 項通過；截圖和 results.json 在 ${OUT}`);
process.exit(failed ? 1 : 0);
