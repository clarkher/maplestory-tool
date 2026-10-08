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
// G 開頭＝v0.55 起的道具頁篩選：搜職業名（法師）時清單分兩組小標、選了種類整頁重新整理後種類還在、「〇〇能用」「現在就能穿」兩顆標籤的規則
// （寫死：小標那段搜「法師」、種類「單手劍」；標籤那段用狂戰士 Lv.45、分類「消耗」）。
// G2＝v0.58 的任務頁：「只看我現在接得到的」清單中間的小標照快過期、剛解鎖、隨時可以補的順序，任務卡的「我做完了」（打勾、收起後那一列不見、
// 重新整理後還在、桌機的小字不再寫「要先做」），清單不列「開發測試用」。位置也量（逐格，±1px）：開著卡片打勾、取消打勾，卡片裡的按鈕跟清單順序都不動（寫死任務 2323）；
// 清單很下面（第 70 列以後）的任務打勾，卡片留在那一列下面、那一列跟按鈕不動、載出來的筆數不被收回 60 筆，收起後原本的下一列放到導覽列下方，
// 最後一列收起就看前一列（不跳回清單開頭）；怪物資料載不到（擋掉 monsters.json）時清單照列、沒有建議等級（寫死：角色 Lv.35 槍騎兵，跑完換回前面存的狂戰士 Lv.45）。
// G3＝v0.60 的怪物頁：「適合我練的」「包含低 5 級」兩顆標籤手機 375、360 寬都在同一排、只能開一顆、點開著的就關，開了標籤下面小字寫等級範圍（Lv.30–40；僧侶再接職業規則），清單的等級範圍、順序、筆數、小字（Lv.35 · 經驗 405）照怪物資料另外算，整頁重新整理後標籤還開著，僧侶照玩家的 35 級算職業規則；「連沒有名字的怪一起列」只在資料真的有沒名字的怪時才出現（寫死：角色 Lv.35 槍騎兵、僧侶，跑完換回前面存的狂戰士 Lv.45）。
// S1＝v0.71 的技能頁：遊戲資料沒有分等級數值的技能（skills.json 沒有 levels）點開不會整頁掛掉，卡片寫原因、沒有數值表（寫死：神匠之魂 1003 從清單點、肥肥的弱點攻擊 9000 直接打開網址）。
// S2＝v0.74 的技能卡：效果行不露出 #代號（改寫滿級那一級的遊戲原文）、好幾級但沒有數值的一級一列放遊戲原文、隱身術 20 級那列放原文、
// 魔力淨化寫沒有每一級的數字、說明尾巴的「#」拿掉（寫死：槍連擊 1311001、隱身術 4001003、魔力淨化 2000000、劍氣縱橫 1001005；槍連擊手機桌機都看）。
// S3＝v0.78 的技能卡 12 項：存了角色先篩你這一轉的職業、所需技能連結、表頭單位、標出你點得到第幾級、表頭黏住、文字表標出變了的數字、衝鋒用客戶端數值、
// 壞圖示、韓文說明、到期的活動技能（角色 Lv.45 狂戰士；「還沒點滿」暫時換 Lv.32 槍騎兵）。v0.78 起 S1 先把職業篩選記成「全部職業」（不然初心者技能不在清單上）。
// 篩選的標籤按鈕（button[aria-pressed]）用 __tag／__pressed 找、看。
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
  // 篩選的標籤按鈕（FilterTag：button[aria-pressed]）：__tag 用文字找、__pressed 看開著沒
  window.__pressed = el => el?.getAttribute("aria-pressed") === "true";
  window.__tag = text => [...document.querySelectorAll("main button[aria-pressed]")].find(b => b.textContent.trim() === text);
  window.__droppable = () => window.__tag("只看打得到的");
  // 「〇〇能用」那顆（文字跟著角色的職業走，所以用結尾找）
  window.__mine = () => [...document.querySelectorAll("main button[aria-pressed]")].find(b => b.textContent.trim().endsWith("能用"));
  // 清單中間的小標：清單那個 ul 底下沒有 db-row- 的 id 的那幾列（不看卡片裡的 ul）
  window.__heads = () => [...(window.__rows()[0]?.parentElement?.children ?? [])].filter(li => !li.id).map(li => li.textContent.trim());
  // 搜尋框下面那行「N 筆」
  window.__count = () => [...document.querySelectorAll("main p")].map(p => p.textContent.trim()).find(t => /^[0-9,]+ 筆$/.test(t)) ?? "";
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
  /** 按一下 Enter（真的按鍵事件，送到現在有焦點的地方） */
  const pressEnter = async () => {
    const key = { key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 };
    await page.send("Input.dispatchKeyEvent", { type: "keyDown", text: "\r", ...key });
    await page.send("Input.dispatchKeyEvent", { type: "keyUp", ...key });
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

  // M7 同一頁的連結（任務「要先完成」）：跳到新的那一筆，中間不會先閃到頁面最上面
  await section("M7", async () => {
    await clearRemembered();
    await navigate(`${BASE}/db/quests?id=6931`);
    const r = await ev(`await __ready(); await __sleep(900);
      const link = [...document.querySelectorAll("main article a")].find(a => /[?&]id=6930/.test(a.getAttribute("href") || ""));
      if (!link) return { skipped: "找不到要先完成的連結" };
      const before = Math.round(scrollY); const framesP = __painted(1200, () => Math.round(scrollY));
      link.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })); link.click();
      await __waitFor(() => __id() === "6930", 5000); const frames = __changes(await framesP); await __sleep(300);
      const card = __topWrap();
      return { before, frames, id: __id(), open: __open(), topCard: __topCard(), rowTop: __top("6930"), cardTop: card ? Math.round(card.getBoundingClientRect().top) : null };`);
    check("M7 同頁連結（要先完成）：跳到新的那一筆", !r.skipped && r.id === "6930" && ((r.open[0] === "6930" && near(r.rowTop, 80)) || (r.topCard && near(r.cardTop, 80))), r);
    check("M7 同頁連結：跳過去時不會先閃到頁面最上面", !r.skipped && r.before > 10 && r.frames.every(y => y > 10), { before: r.before, frames: r.frames });
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
      return { query: __search().value, droppable: __pressed(__droppable()), rowsAfter: __rows().length, backY: Math.round(scrollY) };`);
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

  // M13 按「〇〇能用」標籤：離開再返回，篩選還在、清單一樣、捲回原位（角色要同步讀，第一個畫面就套上）
  await section("M13", async () => {
    await fresh("/db/items");
    const ctx = await ev(`const mine = __mine();
      if (!mine) return { skipped: "沒有「〇〇能用」標籤" };
      mine.click(); await __sleep(500);
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
        return { checked: __pressed(__mine()), rowsAfter: __rows().length, firstFirstId: window.__firstFirstId, backY: Math.round(scrollY) };`);
      r = { ...ctx, ...r };
    }
    check("M13 〇〇能用：返回後第一個畫面就套上篩選、清單一樣", !r.skipped && r.checked && r.rowsAfter === r.rowsBefore && r.firstFirstId === r.firstId, r);
    check("M13 〇〇能用：捲回原位", !r.skipped && near(r.backY, r.leftY), { leftY: r.leftY, backY: r.backY });
  });

  // M14 技能頁：展開在那一筆下面、職業篩選離開再回來還在
  await section("M14", async () => {
    await fresh("/db/skills");
    const r = await ev(`const select = document.querySelector("main select"); const option = [...select.options].find(o => o.value && o.textContent.includes("火毒巫師")) ?? select.options[1];
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

  // S1 遊戲資料沒有分等級數值的技能（skills.json 沒有 levels）點開不會整頁掛掉（v0.71；之前整頁「This page couldn't load」）：
  // 卡片照列說明、寫原因、沒有數值表。神匠之魂 1003 在預設清單前幾列，從清單點；肥肥的弱點攻擊 9000 直接打開網址
  await section("S1", async () => {
    // 整頁掛掉時畫面只剩 Next 的錯誤頁（This page couldn't load）
    const CRASHED = `document.body.innerText.includes("couldn")`;
    const CARD = `({ crashed: ${CRASHED}, title: document.querySelector("main article h2")?.textContent ?? null,
      text: document.querySelector("main article")?.textContent ?? "", table: !!document.querySelector("main article table") })`;
    await fresh("/db/skills");
    // v0.78 起存了角色會先篩你這一轉的職業（開頭存的狂戰士），初心者技能不在清單上：先記成「全部職業」再重新載入
    await evaluate(`sessionStorage.setItem("ms-db:db:技能:job", '""'); 1`);
    await reload();
    await ev(`await __ready(); await __sleep(600); return 1;`);
    const r = await ev(`const id = "1003";
      if (!__row(id)) return { skipped: "預設清單前 60 筆沒有神匠之魂 1003" };
      __tap(id); await __waitFor(() => !!__row(id)?.querySelector("article") || ${CRASHED}); await __sleep(800);
      return { open: __open(), ...${CARD} };`);
    check("S1 從清單點開神匠之魂 1003：卡片打開、不會整頁掛掉", !r.skipped && !r.crashed && r.open[0] === "1003" && r.title?.includes("神匠之魂"), r);
    check("S1 神匠之魂的卡片：照列說明、寫「遊戲資料沒有這個技能每一級的數值」、沒有數值表",
      !r.skipped && r.text.includes("借用匠人之魂") && r.text.includes("遊戲資料沒有這個技能每一級的數值") && !r.table, r);
    await shot("s1-list-1003.png");
    await clearRemembered();
    await navigate(BASE + "/db/skills?id=9000");
    const d = await ev(`await __waitFor(() => !!document.querySelector("main article") || ${CRASHED}); await __sleep(800); return ${CARD};`);
    check("S1 直接打開 ?id=9000（肥肥的弱點攻擊）：卡片在、照列說明、寫原因、沒有數值表",
      !d.crashed && d.title?.includes("肥肥的弱點攻擊") && d.text.includes("給予肥肥150%的傷害")
      && d.text.includes("遊戲資料沒有這個技能每一級的數值") && !d.table, d);
    await shot("s1-direct-9000.png");
  });

  // S2 技能卡的效果行跟每一級的數值（v0.74；使用者 10/08 看候選截圖選 B）：效果樣板有 #mpCon 這種代號的，改寫
  // 「滿級效果（N 級）：滿級那一級的遊戲原文」；槍連擊這類好幾級但遊戲資料沒有數值的，一級一列放每一級的遊戲原文；
  // 隱身術 20 級整列沒數值，那一列放原文；魔力淨化 16 級原文都一樣，照實寫沒有每一級的數字；說明尾巴的「#」拿掉。
  // 都直接打開網址；槍連擊手機 375、桌機 1280 都看，隱身術 20 級那句原文看手機 375、360 寬會不會撐出左右滑
  await section("S2", async () => {
    // 前面哪一段停在別的寬度也不影響：先回手機 375
    await mobile();
    const CARD = `(() => {
      const card = document.querySelector("main article");
      if (!card) return null;
      // 「效果：」或「滿級效果（30 級）：」
      const effect = [...card.querySelectorAll("p")].find(p => /效果(（\\d+ 級）)?：$/.test(p.firstElementChild?.textContent ?? ""));
      const table = card.querySelector("table");
      return {
        title: card.querySelector("h2")?.textContent ?? "",
        // 標題旁的 #1311001 是技能編號，不算
        text: card.textContent.replace(/#\\d+/g, ""),
        effect: effect?.textContent ?? null,
        heads: table ? [...table.querySelectorAll("thead th")].map(th => th.textContent.trim()) : [],
        rows: table ? [...table.querySelectorAll("tbody tr")].map(tr => [...tr.children].map(cell => ({ text: cell.textContent.trim(), span: cell.colSpan }))) : [],
        // 表格比外框寬＝手機上要左右滑才看得完
        fits: table ? table.scrollWidth <= table.parentElement.clientWidth + 1 : null,
      };
    })()`;
    const open = async id => {
      await clearRemembered();
      await navigate(`${BASE}/db/skills?id=${id}`);
      return ev(`await __waitFor(() => !!document.querySelector("main article table, main article section")); await __sleep(800); return ${CARD};`);
    };

    const spear = await open(1311001);
    check("S2 槍連擊：效果行是「滿級效果（30 級）：消耗MP24, 攻擊力170%, 對三名怪物三次攻擊」",
      spear?.effect === "滿級效果（30 級）：消耗MP24, 攻擊力170%, 對三名怪物三次攻擊", spear?.effect);
    check("S2 槍連擊：各等級數值一級一列放遊戲原文（表頭等級／效果、30 列，第 1、30 列照抄遊戲資料）",
      spear?.heads.join("|") === "等級|效果" && spear.rows.length === 30
        && spear.rows[0][1]?.text === "消耗MP10, 攻擊力55%, 對一名怪物兩次攻擊"
        && spear.rows[29][1]?.text === "消耗MP24, 攻擊力170%, 對三名怪物三次攻擊",
      { heads: spear?.heads, rows: spear?.rows.length, first: spear?.rows[0], last: spear?.rows[29] });
    check("S2 槍連擊：手機 375 寬原文會換行，表格不用左右滑", spear?.fits === true, spear?.fits);
    check("S2 槍連擊：卡片上沒有「#」（效果樣板的代號、說明殘留的都沒有）", spear && !spear.text.includes("#"), spear?.text.slice(0, 300));
    await shot("s2-spear-mobile.png");

    const stealth = await open(4001003);
    check("S2 隱身術：第 20 級整列放遊戲原文「消耗MP5, 隱身200秒，移動速度 正常」（佔三欄），不是一排「—」",
      stealth?.rows.length === 20 && stealth.rows[19].length === 2
        && stealth.rows[19][1].text === "消耗MP5, 隱身200秒，移動速度 正常" && stealth.rows[19][1].span === 3, stealth?.rows[19]);
    check("S2 隱身術：第 19 級照舊是數字（消耗 MP 6、持續時間 190、移動速度 -1）",
      stealth?.rows[18]?.map(cell => cell.text).join("|") === "19|6|190|-1", stealth?.rows[18]);
    check("S2 隱身術：效果行是滿級那一句", stealth?.effect === "滿級效果（20 級）：消耗MP5, 隱身200秒，移動速度 正常", stealth?.effect);
    check("S2 隱身術：手機 375 寬，20 級那句原文不會把表格撐出左右滑", stealth?.fits === true, stealth?.fits);
    try {
      await page.send("Emulation.setDeviceMetricsOverride", { width: 360, height: 800, deviceScaleFactor: 2, mobile: true });
      const narrow = await open(4001003);
      check("S2 隱身術：手機 360 寬（安卓常見），20 級那句原文一樣不會把表格撐出左右滑", narrow?.fits === true, narrow?.fits);
      await shot("s2-stealth-360.png");
    } finally {
      await mobile();
    }

    const mpRecovery = await open(2000000);
    check("S2 魔力淨化：效果行照原句、寫「遊戲資料這 16 級寫的都是同一句…沒有每一級的數字」、沒有表",
      mpRecovery?.effect === "效果：增加一定量的MP的恢復量" && mpRecovery.text.includes("遊戲資料這 16 級寫的都是同一句")
        && mpRecovery.text.includes("沒有每一級的數字") && mpRecovery.rows.length === 0,
      { effect: mpRecovery?.effect, rows: mpRecovery?.rows.length, text: mpRecovery?.text.slice(-120) });

    const slash = await open(1001005);
    check("S2 劍氣縱橫：效果行是「滿級效果（20 級）：消耗HP16和MP14, 攻擊力130%」，數值表照舊（20 列、消耗 HP／消耗 MP／傷害（%））",
      slash?.effect === "滿級效果（20 級）：消耗HP16和MP14, 攻擊力130%" && slash.rows.length === 20
        && slash.heads.join("|") === "等級|消耗 HP|消耗 MP|傷害（%）",
      { effect: slash?.effect, heads: slash?.heads, rows: slash?.rows.length });
    check("S2 劍氣縱橫：卡片上沒有「#」（上游說明尾巴「所需技能：魔天一擊1等級以上#」，v0.78 起所需技能另外列成「魔天一擊 1 級以上」）",
      slash?.text.includes("所需技能：魔天一擊 1 級以上") && !slash.text.includes("#"), slash?.text.slice(0, 200));

    // 中間出錯也要切回手機，後面的段才不會在桌機寬跑
    try {
      await desktop();
      const wide = await open(1311001);
      check("S2 桌機 1280：槍連擊右邊的卡片一樣一級一列放原文、效果行是滿級那一句",
        wide?.rows.length === 30 && wide.effect === "滿級效果（30 級）：消耗MP24, 攻擊力170%, 對三名怪物三次攻擊" && wide.fits === true,
        { rows: wide?.rows.length, effect: wide?.effect, fits: wide?.fits });
      await shot("s2-spear-desktop.png");
    } finally {
      await mobile();
    }
  });

  // S3 技能卡 12 項優化（v0.78；使用者 10/08「全修」）：預設篩你這一轉的職業、所需技能做成連結、表頭單位、
  // 標出你點得到第幾級、表頭黏住、文字表標出變了的數字、說明開頭的最高等級拿掉、韓文說明不列、2009 年到期的活動技能不列。
  // 角色照開頭存的 Lv.45 狂戰士（110）；「還沒點滿」那條暫時換成 Lv.32 槍騎兵，跑完換回來
  await section("S3", async () => {
    await mobile();
    const JOB_KEY = "ms-db:db:技能:job";
    const setProfile = (level, job) => evaluate(`localStorage.setItem("ms-profile", JSON.stringify({ level: ${level}, job: ${job} })); 1`);
    const CARD = `(() => {
      const card = document.querySelector("main article");
      if (!card) return null;
      const table = card.querySelector("table");
      const rows = table ? [...table.querySelectorAll("tbody tr")] : [];
      const bg = tr => getComputedStyle(tr).backgroundColor;
      return {
        title: card.querySelector("h2")?.textContent ?? "",
        text: card.textContent,
        desc: card.querySelector("p.whitespace-pre-wrap")?.textContent ?? null,
        req: [...card.querySelectorAll("p")].find(p => p.textContent.startsWith("所需技能："))?.textContent ?? null,
        reqLinks: [...card.querySelectorAll("p a[href]")].map(a => ({ text: a.textContent, href: a.getAttribute("href") })),
        heads: table ? [...table.querySelectorAll("thead th")].map(th => th.textContent.trim()) : [],
        note: [...card.querySelectorAll("section p")].find(p => p.textContent.startsWith("你 Lv."))?.textContent ?? null,
        // 標橘的列：底色跟一般列不一樣的那幾列（第幾級）
        marked: rows.map((tr, i) => bg(tr) !== "rgba(0, 0, 0, 0)" ? i + 1 : 0).filter(Boolean),
        bold: rows.map(tr => [...tr.querySelectorAll("td b")].map(b => b.textContent)),
      };
    })()`;
    const open = async id => {
      await navigate(`${BASE}/db/skills?id=${id}`);
      return ev(`await __waitFor(() => !!document.querySelector("main article section")); await __sleep(800); return ${CARD};`);
    };

    // 預設篩你這一轉的職業；自己選過「全部職業」就照你選的，重新整理也一樣
    await fresh("/db/skills");
    const f = await ev(`const select = document.querySelector("main select"); return { value: select.value, rows: __rows().length };`);
    check("S3 沒選過職業：存了 Lv.45 狂戰士，技能頁先篩狂戰士（8 個）", f.value === "110" && f.rows === 8, f);
    const all = await ev(`const select = document.querySelector("main select");
      const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set;
      set.call(select, ""); select.dispatchEvent(new Event("change", { bubbles: true }));
      await __waitFor(() => __rows().length > 8); await __sleep(600);
      return { value: select.value, rows: __rows().length, saved: sessionStorage.getItem(${JSON.stringify(JOB_KEY)}) };`);
    await reload();
    const kept = await ev(`await __ready(); await __sleep(600); return { value: document.querySelector("main select").value, rows: __rows().length };`);
    check("S3 自己選「全部職業」：清單變全部、重新整理後還是全部（不會又被篩回狂戰士）",
      all.value === "" && all.rows > 8 && all.saved === '""' && kept.value === "" && kept.rows > 8, { all, kept });

    // 所需技能、表頭單位、標出點得到第幾級、說明開頭
    const slash = await open(1001005);
    check("S3 劍氣縱橫：說明開頭沒有「[最高等級：20]」、尾巴的所需技能拆出去", slash?.desc === "消耗HP、MP以作為裝備的武器對周圍的敵人進行整體攻擊。", slash?.desc);
    check("S3 劍氣縱橫：另一行寫「所需技能：魔天一擊 1 級以上」，魔天一擊是連到 ?id=1001004 的連結",
      slash?.req === "所需技能：魔天一擊 1 級以上" && slash.reqLinks.some(link => link.text === "魔天一擊" && link.href === "/db/skills?id=1001004"),
      { req: slash?.req, links: slash?.reqLinks });
    check("S3 劍氣縱橫：表頭補單位「傷害（%）」", slash?.heads.join("|") === "等級|消耗 HP|消耗 MP|傷害（%）", slash?.heads);
    check("S3 劍氣縱橫（一轉，要先學魔天一擊）× Lv.45 狂戰士：寫「扣掉所需技能也夠把這招點滿（20 級）」、標橘第 20 列",
      slash?.note === "你 Lv.45：扣掉所需技能也夠把這招點滿（20 級），標橘的那一列。" && slash.marked.join(",") === "20", { note: slash?.note, marked: slash?.marked });
    const jump = await ev(`const link = [...document.querySelectorAll("main article p a")].find(a => a.textContent === "魔天一擊");
      link.click(); await __waitFor(() => location.search.includes("1001004")); await __sleep(1000);
      return { path: location.pathname, search: location.search, title: document.querySelector("main article h2")?.textContent ?? "" };`);
    check("S3 點所需技能「魔天一擊」：留在技能頁、卡片換成魔天一擊", jump.path === "/db/skills" && jump.search === "?id=1001004" && jump.title.includes("魔天一擊"), jump);

    try {
      await setProfile(32, 130);
      const fire = await open(1301007);
      // 神聖之火要先把禦魔陣點到 3 級：7 點扣 3 點，只到第 4 級（第一版沒扣、寫第 7 級，code review 抓到）
      check("S3 神聖之火（二轉）× Lv.32 槍騎兵：寫「二轉到現在有 7 點，扣掉所需技能 3 點，這招最多到第 4 級」、標橘第 4 列",
        fire?.note === "你 Lv.32：二轉到現在有 7 點，扣掉所需技能 3 點，這招最多到第 4 級，標橘的那一列。" && fire.marked.join(",") === "4", { note: fire?.note, marked: fire?.marked });
      await setProfile(30, 110);
      const quick = await open(1101004);
      check("S3 快速之劍 × Lv.30 狂戰士（只有 1 點、所需技能要先花 5 點）：寫「還差 5 點才點得到這招」、不標任何一列",
        quick?.note === "你 Lv.30：二轉到現在有 1 點，所需技能要先花 5 點，還差 5 點才點得到這招。" && quick.marked.length === 0, { note: quick?.note, marked: quick?.marked });
      const other = await open(2001004);
      check("S3 不是自己職業線的技能（法師的魔靈彈）不寫、不標", other && other.note === null && other.marked.length === 0, { note: other?.note, marked: other?.marked });
    } finally {
      await setProfile(45, 110);
    }

    // 文字表：跟上一級不一樣的數字加粗
    const spear = await open(1311001);
    check("S3 槍連擊：第 6 級加粗的是變了的數字（13、80、兩），第 1 級不加粗",
      spear?.bold[5]?.join("|") === "13|80|兩" && spear.bold[0]?.length === 0, { row1: spear?.bold[0], row6: spear?.bold[5] });

    // 表頭黏住：蓄能激發 40 級，捲到 30 級附近，表頭貼在「收起」那一列下面
    const charge = await open(5110001);
    const stick = await ev(`document.documentElement.style.setProperty("scroll-behavior", "auto", "important");
      const rows = [...document.querySelectorAll("main article tbody tr")];
      window.scrollTo(0, rows[29].getBoundingClientRect().top + window.scrollY - 400); await __sleep(500);
      const th = document.querySelector("main article thead th").getBoundingClientRect();
      const bar = (document.querySelector("main li [aria-expanded='true']") ?? document.querySelector("#db-top > button")).getBoundingClientRect();
      return { thTop: Math.round(th.top), barBottom: Math.round(bar.bottom), row1Top: Math.round(rows[0].getBoundingClientRect().top) };`);
    check("S3 蓄能激發：捲到 30 級附近，表頭還貼在「收起」那一列下面（第 1 列早就捲出畫面）",
      charge?.title.includes("蓄能激發") && near(stick.thTop, stick.barBottom, 2) && stick.row1Top < stick.thTop, stick);
    await shot("s3-sticky-mobile.png");
    try {
      await desktop();
      await open(5110001);
      const pane = await ev(`const card = document.querySelector("main article"); const box = card.parentElement.closest("[class*='overflow-y-auto']");
        const rows = [...card.querySelectorAll("tbody tr")];
        box.scrollTop = rows[29].offsetTop; await __sleep(500);
        return { thTop: Math.round(card.querySelector("thead th").getBoundingClientRect().top), boxTop: Math.round(box.getBoundingClientRect().top), row1Top: Math.round(rows[0].getBoundingClientRect().top) };`);
      check("S3 桌機：右邊那一欄捲到 30 級附近，表頭貼在那一欄頂端", near(pane.thTop, pane.boxTop, 10) && pane.row1Top < pane.thTop, pane);
      await shot("s3-sticky-desktop.png");
    } finally {
      await mobile();
    }

    // 衝鋒：上游只有文字，改用台服客戶端的每一級數值（data/client/skills.json）
    const dash = await open(5001005);
    const dashRows = await ev(`return [...document.querySelectorAll("main article tbody tr")].map(tr => [...tr.children].map(cell => cell.textContent.trim()).join("|"));`);
    check("S3 衝鋒：數值表是消耗 MP／移動速度／跳躍力／持續時間（秒），第 1 級 14、12、1、4，第 10 級 5、30、10、20（客戶端原值）",
      dash?.heads.join("|") === "等級|消耗 MP|移動速度|跳躍力|持續時間（秒）" && dashRows[0] === "1|14|12|1|4" && dashRows[9] === "10|5|30|10|20",
      { heads: dash?.heads, first: dashRows[0], last: dashRows[9] });

    // 壞掉的圖示：向下跳躍換成皇家騎士團版同一張、木妖的弱點攻擊不放圖
    await open(1006);
    const jumpIcon = await ev(`const img = document.querySelector("main article header img"); await __waitFor(() => img?.complete); return { src: img?.getAttribute("src") ?? null, width: img?.naturalWidth ?? 0 };`);
    check("S3 向下跳躍 1006：圖示換成我們自己放的那張（public/skill-icons/1006.png，載得到）", jumpIcon.src === "/skill-icons/1006.png" && jumpIcon.width > 0, jumpIcon);
    await open(9001);
    const woodIcon = await ev(`return { img: !!document.querySelector("main article header img"), title: document.querySelector("main article h2")?.textContent ?? "" };`);
    check("S3 木妖的弱點攻擊 9001：找不到可靠的圖就不放（不放壞掉的綠色雜訊）", woodIcon.title.includes("木妖") && !woodIcon.img, woodIcon);

    // 韓文說明、到期的活動技能
    const yeti = await open(1018);
    check("S3 雪吉拉騎士 1018：卡片沒有韓文、效果行是中文", yeti && !/\p{Script=Hangul}/u.test(yeti.text) && yeti.text.includes("跳躍力 120"), yeti?.text.slice(0, 200));
    await navigate(`${BASE}/db/skills?id=1014`);
    const gone = await ev(`await __ready(); await __sleep(1500); return { card: !!document.querySelector("main article"), row: !!document.getElementById("db-row-1014") };`);
    check("S3 宇宙衝鋒 1014（2009 年到期）不列：直接打開網址也沒有卡片", !gone.card && !gone.row, gone);
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

  // M18 從清單點開、往下讀到卡片中段後重新整理（v0.62）：停在原本讀到的地方，不跳回卡片頂端，卡片還開在那一列下面；
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
    const r = await ev(`await __ready(); await __sleep(600); return { query: __search().value, droppable: __pressed(__droppable()) };`);
    check("M19 重新整理後搜尋、篩選還在", r.query === "帽" && r.droppable === true, r);
  });

  // M20 卡片搬家（v0.62）：開在清單第 121 筆的白狼人讀到卡片中段後重新整理——重新整理後清單只剩前 60 筆、卡片搬到清單最上面，
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
    // 搜尋有沒有改到清單看「N 筆」，不看第一列：預設清單的第一列剛好是帽子（平凡的草帽），搜「帽」排第一的也是它
    const r = await ev(`const none = !__clearBtn(); const firstBefore = __rowId(0); const rowsBefore = __rows().length; const countBefore = __count();
      __setSearch("帽"); await __sleep(500);
      const btn = __clearBtn(); const shown = __shows(btn); const countWhileSearching = __count();
      btn?.click(); await __sleep(600);
      return { none, shown, firstBefore, countBefore, countWhileSearching, query: __search().value, focused: document.activeElement === __search(),
        gone: !__clearBtn(), firstAfter: __rowId(0), countAfter: __count(), rowsBefore, rowsAfter: __rows().length };`);
    check("N16 搜尋框沒字時沒有「×」、有字時右邊出現「×」", r.none && r.shown, r);
    check("N16 按「×」：字清掉、清單回到原本、焦點留在搜尋框、「×」不見", r.query === "" && r.focused && r.gone && r.countWhileSearching !== r.countBefore && r.countAfter === r.countBefore && r.firstAfter === r.firstBefore && r.rowsAfter === r.rowsBefore, r);
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

    // 提示字「例如 …」舉的每個例子都要搜得到（以前寫的「楓葉」打寶找不到）
    const ex = await ev(`const input = document.querySelector("main input[aria-label='搜尋道具']"); const section = input.closest("section");
      const words = (input.placeholder.split("例如")[1] ?? "").split("、").map(w => w.trim()).filter(Boolean);
      const counts = {};
      for (const w of words) {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, w); input.dispatchEvent(new Event("input", { bubbles: true }));
        await __sleep(400); counts[w] = section.querySelectorAll("ul li").length;
      }
      return { placeholder: input.placeholder, words, counts };`);
    check("X1 打寶「自己找」的提示字：舉的例子每個都搜得到", ex.words.length >= 2 && ex.words.every(w => ex.counts[w] > 0), ex);
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

  // X3 手機在搜尋框按 Enter（鍵盤上的鍵寫「搜尋」）：鍵盤收起來（焦點離開搜尋框），打的字和結果都還在
  await section("X3", async () => {
    await mobile();
    await touchMode(true);
    try {
      const boxes = [
        { name: "查資料", path: "/db/items", input: "main input[aria-label^=搜尋]", word: "帽" },
        { name: "打寶「自己找」", path: "/plan/farm", input: "main input[aria-label='搜尋道具']", word: "藥水" },
        { name: "帶我去選地圖", path: "/go", input: "main input[aria-label='要去哪裡']", word: "弓箭手" },
      ];
      for (const box of boxes) {
        if (box.path === "/db/items") await fresh(box.path);
        else await navigate(`${BASE}${box.path}`);
        const before = await ev(`await __waitFor(() => !!document.querySelector(${JSON.stringify(box.input)})); await __sleep(600);
          const input = document.querySelector(${JSON.stringify(box.input)}); input.focus();
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, ${JSON.stringify(box.word)}); input.dispatchEvent(new Event("input", { bubbles: true }));
          await __sleep(500);
          return { hint: input.getAttribute("enterkeyhint"), coarse: matchMedia("(pointer: coarse)").matches, focused: document.activeElement === input };`);
        await pressEnter();
        const after = await ev(`await __sleep(400); const input = document.querySelector(${JSON.stringify(box.input)});
          return { focused: document.activeElement === input, value: input.value };`);
        check(`X3 手機在${box.name}的搜尋框按 Enter：鍵盤上寫「搜尋」，按了收起鍵盤、打的字還在`,
          before.hint === "search" && before.coarse && before.focused && !after.focused && after.value === box.word, { ...before, after });
      }
    } finally {
      await touchMode(false);
    }
  });

  // N17 卡片裡的「路線」：讀螢幕軟體念「到〇〇的路線」（以前一整排都只念「路線」，分不出是哪張圖），畫面上還是寫「路線」
  await section("N17", async () => {
    await fresh("/db/monsters");
    let r = await ev(`const id = "210100"; __tap(id); await __waitFor(() => __id() === id); await __sleep(1000);
      const maps = [...__row(id).querySelectorAll("article section")].find(s => s.querySelector("h3")?.textContent.startsWith("出沒地圖"));
      const li = maps?.querySelector("ul > li");
      const go = li?.querySelector("a[href^='/go?to=']");
      return { name: li?.querySelector("span.truncate")?.textContent ?? "", label: go?.getAttribute("aria-label") ?? null, text: go?.textContent.trim() ?? null };`);
    check("N17 怪物卡出沒地圖的「路線」：讀螢幕軟體念「到〇〇的路線」，畫面上還是寫「路線」", r.name !== "" && r.label === `到${r.name}的路線` && r.text === "路線", r);
    // 任務卡的 NPC：念 NPC 的名字（兩個 NPC 都在還沒開放的地圖時，念地圖名會兩顆都是「到未開放地圖的路線」）；
    // 地圖開放時多念地名，同名的 NPC 在不同地方也分得出來（69098 有兩個「漢斯」）
    const npcButtons = id => ev(`await __ready(); await __sleep(900);
      return [...document.querySelectorAll("main article a[href^='/go?to=']")].map(go => {
        const box = go.closest("div");
        return { npc: box?.querySelector("p.font-bold")?.textContent ?? "", map: box?.querySelector("p.flex span.truncate")?.textContent ?? "",
          label: go.getAttribute("aria-label"), text: go.textContent.trim() };
      });`);
    const want = b => b.map === "未開放地圖" ? `到${b.npc}那裡的路線` : `到${b.npc}那裡（${b.map}）的路線`;
    for (const quest of ["6931", "69098"]) {
      await clearRemembered();
      await navigate(`${BASE}/db/quests?id=${quest}`);
      const buttons = await npcButtons(quest);
      check(`N17 任務卡 NPC 的「路線」（${quest}）：讀螢幕軟體念「到〇〇那裡的路線」，地圖開放時多念地名，畫面上還是寫「路線」`,
        buttons.length > 0 && buttons.every(b => b.npc !== "" && b.label === want(b) && b.text === "路線"), buttons);
    }
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
      // 本機 dev server 第一次開 /guide 要先編譯：多等一下，等不到就寫原因
      r = await ev(`window.next.router.push("/guide#pq-moon");
        await __waitFor(() => location.pathname === "/guide" && !!document.getElementById("pq-moon"), 30000); await __sleep(1500);
        const section = document.getElementById("pq-moon");
        if (!section) return { skipped: "換到 /guide 後找不到 #pq-moon（" + location.pathname + "）" };
        return { header: __headerBottom(), sectionTop: Math.round(section.getBoundingClientRect().top) };`);
      check("H10 導覽列收著時點「看打法」換到組隊圖解：那一段放在導覽列下方、標題沒被蓋住", hiddenGuide && !r.skipped && r.header >= 60 && near(r.sectionTop, 80), { hiddenGuide, ...r });
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

  // D9 桌機點卡片裡連到同一頁另一筆的連結（任務「要先完成」）：頁面不跳回最上面，右邊換成那一筆、從卡片頂端開始
  await section("D9", async () => {
    await desktop();
    await clearRemembered();
    await navigate(`${BASE}/db/quests?id=6931`);
    const r = await ev(`await __ready(); await __sleep(900);
      window.scrollTo({ top: 1500, behavior: "instant" }); await __sleep(500); const y = Math.round(scrollY);
      const link = [...(__side()?.querySelectorAll("article a") ?? [])].find(a => /[?&]id=6930/.test(a.getAttribute("href") || ""));
      if (!link) return { skipped: "6931 的卡片裡找不到 6930 的連結" };
      link.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })); link.click();
      await __waitFor(() => __id() === "6930", 5000); await __sleep(1000);
      return { y, yAfter: Math.round(scrollY), id: __id(), title: __side().querySelector("article h2")?.textContent ?? "", sideScroll: Math.round(__side().scrollTop) };`);
    check("D9 桌機點卡片裡的「要先完成」（同一頁的另一筆）：頁面不跳回最上面、右邊換成那一筆從頂端開始",
      !r.skipped && r.y > 1000 && Math.abs(r.yAfter - r.y) <= 2 && r.id === "6930" && r.sideScroll === 0, r);
  });

  // D10 桌機清單整個列完、捲到最底（右邊那一欄被頁尾往上推走）再點卡片裡的「要先完成」：頁面往上一點，新卡片的標題出來
  await section("D10", async () => {
    // 跟 D7 一樣用很矮的桌機畫面，卡片一定放不下、一定被推走
    await page.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 450, deviceScaleFactor: 1, mobile: false });
    await clearRemembered();
    await navigate(`${BASE}/db/quests?id=6931`);
    const r = await ev(`await __ready(); await __sleep(900);
      for (let i = 0; i < 20; i++) {
        const before = __rows().length; const btn = __moreBtn();
        if (__shows(btn)) btn.click(); else window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" });
        await __waitFor(() => __rows().length > before, 1500); await __sleep(300);
        if (__rows().length === before) break;
      }
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }); await __sleep(500);
      const side = __side(); const pushedBy = Math.round(parseFloat(getComputedStyle(side).top) - side.getBoundingClientRect().top);
      const link = [...side.querySelectorAll("article a")].find(a => /[?&]id=6930/.test(a.getAttribute("href") || ""));
      if (!link) return { skipped: "6931 的卡片裡找不到 6930 的連結" };
      const yBefore = Math.round(scrollY);
      link.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })); link.click();
      await __waitFor(() => __id() === "6930", 5000); await __sleep(1300);
      const title = side.querySelector("article h2")?.getBoundingClientRect();
      return { pushedBy, yBefore, yAfter: Math.round(scrollY), id: __id(), header: __headerBottom(), sideTop: Math.round(side.getBoundingClientRect().top),
        titleTop: title ? Math.round(title.top) : null };`);
    check("D10 清單到底、右邊那一欄被往上推走時點卡片裡的「要先完成」：頁面往上一點、新卡片的標題出來",
      !r.skipped && r.pushedBy > 20 && r.id === "6930" && r.yAfter < r.yBefore && r.sideTop >= r.header && r.sideTop <= r.header + 16 && r.titleTop > r.header, r);
  });

  // X4 電腦在搜尋框按 Enter：不動，焦點留在搜尋框（可以接著打）
  await section("X4", async () => {
    await desktop();
    await fresh("/db/items");
    await ev(`const input = __search(); input.focus(); __setSearch("帽"); await __sleep(400); return 1;`);
    await pressEnter();
    const r = await ev(`await __sleep(400); return { focused: document.activeElement === __search(), value: __search().value, coarse: matchMedia("(pointer: coarse)").matches };`);
    check("X4 電腦在搜尋框按 Enter：焦點留在搜尋框、字還在", !r.coarse && r.focused && r.value === "帽", r);
  });

  // H11 桌機用滑鼠滾輪往下捲：導覽列不收（只有手指滑才收）
  await section("H11", async () => {
    await desktop();
    await fresh("/db/items");
    await page.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: 200, y: 400, deltaX: 0, deltaY: 1500 });
    const r = await ev(`await __sleep(1200); return { y: Math.round(scrollY), header: __headerBottom() };`);
    check("H11 桌機滑鼠滾輪往下捲：導覽列不收", r.y > 800 && r.header >= 60, r);
  });

  // ── v0.55：道具頁篩選換成標籤、搜職業名分兩組小標、整頁重新整理後種類還在 ──

  // G1 道具頁搜職業名：清單中間先「法師能用的裝備」再「名字或說明提到法師的」；每一組底下的道具對得上（答案拿網站自己的道具資料另外算：
  // 需求職業 reqJob 的位元 2＝法師）；搜一般的字、清空搜尋都沒有小標；搜初心者第一組寫「初心者專用的裝備」
  await section("G1", async () => {
    await mobile();
    await fresh("/db/items");
    const r = await ev(`
      const urlOf = name => performance.getEntriesByType("resource").map(e => e.name).find(u => u.includes("/data/" + name + ".json")) ?? "/data/" + name + ".json";
      const itemData = await fetch(urlOf("items")).then(res => res.json());
      const byId = new Map(itemData.map(item => [String(item.id), item]));
      // 「裝備」分類、需求職業是 1～31 的職業組合而且有法師（位元 2）；0 是不限職業，不算
      const usable = id => { const item = byId.get(id); const job = item?.c === "裝備" ? item.eq?.reqJob : undefined; return typeof job === "number" && job > 0 && job < 32 && (job & 2) !== 0; };
      __setSearch("法師"); await __sleep(700);
      // 法師能用的有三百多件，要多載幾批才看得到第二個小標
      for (let i = 0; i < 8 && __heads().length < 2; i++) await __loadMore();
      window.scrollTo({ top: 0, behavior: "instant" }); await __sleep(300);
      const groups = []; const stray = [];
      let current = null;
      for (const li of __rows()[0].parentElement.children) {
        if (!li.id) { current = { head: li.textContent.trim(), ids: [] }; groups.push(current); }
        else if (current) current.ids.push(li.id.replace("db-row-", ""));
        else stray.push(li.id);
      }
      const searched = { heads: groups.map(g => g.head), sizes: groups.map(g => g.ids.length), stray: stray.length,
        firstRow: groups[0]?.ids[0] ?? null, firstRowUsable: groups[0]?.ids[0] ? usable(groups[0].ids[0]) : null,
        upperAllUsable: groups[0]?.ids.every(usable) ?? null, lowerNoneUsable: groups[1]?.ids.every(id => !usable(id)) ?? null };
      return searched;`);
    await shot("g1-search-job-heads.png");
    check("G1 搜「法師」：清單中間兩個小標，先「法師能用的裝備」再「名字或說明提到法師的」", r.heads.length === 2 && r.heads[0] === "法師能用的裝備" && r.heads[1] === "名字或說明提到法師的", r);
    check("G1 搜「法師」：第一個小標後面第一列的道具法師能用", r.firstRowUsable === true, { firstRow: r.firstRow, firstRowUsable: r.firstRowUsable });
    check("G1 搜「法師」：上面那組每一件法師都能用、下面那組都不是，小標前面沒有零散的列",
      r.upperAllUsable === true && r.lowerNoneUsable === true && r.stray === 0 && r.sizes.every(size => size > 0), { sizes: r.sizes, stray: r.stray, upperAllUsable: r.upperAllUsable, lowerNoneUsable: r.lowerNoneUsable });

    const others = await ev(`
      __setSearch("初心者"); await __sleep(700);
      const novice = __heads();
      __setSearch("帽"); await __sleep(700);
      const plain = __heads(); const plainRows = __rows().length;
      __setSearch("法師"); await __sleep(700);
      const before = __heads().length;
      __setSearch(""); await __sleep(700);
      return { novice, plain, plainRows, before, cleared: __heads(), rows: __rows().length };`);
    check("G1 搜「初心者」：第一組寫「初心者專用的裝備」", others.novice[0] === "初心者專用的裝備", others.novice);
    // 清單是空的也「沒有小標」，所以要同時有列（搜帽有東西）才算數
    check("G1 搜一般的字（帽）：不分組、沒有小標", others.plain.length === 0 && others.plainRows > 0, { plain: others.plain, plainRows: others.plainRows });
    check("G1 清空搜尋：小標都不見、清單照常", others.before > 0 && others.cleared.length === 0 && others.rows > 0, others);
  });

  // G2 任務頁（v0.58）。手機：按「只看我現在接得到的」→ 清單中間的小標只會是「快過期，先做這些」「剛解鎖」「隨時可以補」、照這個順序（有的才出現）；
  // 第一列打開、按卡片裡的「我做完了」→ 卡片還在、那一列標「做完了」，收起後那一列不見、整頁重新整理後也不再列；清單裡沒有「開發測試用」。
  // 開著卡片打勾、取消打勾（任務 2323，有別的任務要先做它）：按鈕在畫面上不動、清單順序不動；第 70 列以後的任務、最後一列也各打勾、收起一次，量那一列跟接著看的那一列放在哪。
  // 桌機：前置還沒做的那一列，按了「我做完了」小字不再寫「要先做」（寫等級），再按一次取消就寫回來。最後擋掉 monsters.json，清單要照列。
  // 角色用 Lv.35 槍騎兵（寫死：三段都有）；打勾的任務記在 localStorage 的 ms-done-quests，跑完清掉、角色換回最前面存的狂戰士 Lv.45
  await section("G2", async () => {
    const HEADS = ["快過期，先做這些", "剛解鎖", "隨時可以補"];
    const setMine = (level, job) =>
      evaluate(`localStorage.setItem("ms-profile", JSON.stringify({ level: ${level}, job: ${job} })); localStorage.removeItem("ms-done-quests"); "ok"`);
    const digits = text => Number(String(text).replace(/[^0-9]/g, ""));
    await mobile();
    await setMine(35, 130);
    try {
      await fresh("/db/quests");
      // 一般清單（沒按標籤）：有標籤、搜「開發測試用」一筆都沒有
      const general = await ev(`
        const tag = __tag("只看我現在接得到的");
        __setSearch("開發測試用"); await __sleep(700);
        const dev = { count: __count(), rows: __rows().length };
        __setSearch(""); await __sleep(600);
        return { hasTag: !!tag, pressed: __pressed(tag), dev, rowsAfter: __rows().length };`);
      check("G2 角色是 Lv.35 槍騎兵：任務頁有「只看我現在接得到的」標籤、一開始沒按", general.hasTag && general.pressed === false, general);
      check("G2 一般清單搜「開發測試用」：一筆都沒有（不列開發測試任務）", general.dev.rows === 0 && general.dev.count === "0 筆" && general.rowsAfter > 0, general);

      // 一般清單的排法：整份載出來，小字的等級（Lv.30、建議 Lv.18）由低到高；沒寫需求等級的照建議等級插進去，推不出來（小字只寫分類）的排最後
      const sorted = await ev(`
        const total = Number(__count().replace(/[^0-9]/g, ""));
        for (let i = 0; i < 12 && __rows().length < total; i++) await __loadMore();
        const levelIn = note => { const at = note.indexOf("Lv."); const rest = at < 0 ? "" : note.slice(at + 3); return /^[0-9]+$/.test(rest) ? Number(rest) : null; };
        const notes = __rows().map(li => li.querySelector(":scope > button .tabular-nums")?.textContent.trim() ?? "");
        const levels = notes.map(levelIn);
        const firstUnknown = levels.indexOf(null);
        const known = firstUnknown < 0 ? levels : levels.slice(0, firstUnknown);
        window.scrollTo({ top: 0, behavior: "instant" }); await __sleep(300);
        return { total, rows: notes.length, suggested: notes.filter(note => note.startsWith("建議 Lv.")).length, unknown: levels.filter(level => level === null).length,
          ascending: known.every((level, i) => i === 0 || level >= known[i - 1]), unknownOnlyAtEnd: firstUnknown < 0 || levels.slice(firstUnknown).every(level => level === null),
          first: notes.slice(0, 3) };`);
      check("G2 一般清單：等級由低到高排，沒寫需求等級的照「建議 Lv.」插進去，推不出來的排最後",
        sorted.total > 0 && sorted.rows === sorted.total && sorted.suggested > 0 && sorted.ascending === true && sorted.unknownOnlyAtEnd === true, sorted);

      // 按標籤、把整份清單載出來（隨時可以補在後面，要多載幾批才看得到），讀每一組小標跟底下每一列的小字
      const board = await ev(`
        __tag("只看我現在接得到的").click(); await __sleep(900);
        const total = Number(__count().replace(/[^0-9]/g, ""));
        for (let i = 0; i < 12 && __rows().length < total; i++) await __loadMore();
        window.scrollTo({ top: 0, behavior: "instant" }); await __sleep(300);
        const groups = []; let stray = 0; let current = null;
        for (const li of __rows()[0].parentElement.children) {
          if (!li.id) { current = { head: li.textContent.trim(), notes: [] }; groups.push(current); }
          else if (current) current.notes.push(li.querySelector(":scope > button .tabular-nums")?.textContent.trim() ?? "");
          else stray++;
        }
        const expiring = groups.find(g => g.head === "快過期，先做這些");
        return { pressed: __pressed(__tag("只看我現在接得到的")), total, rows: __rows().length, stray,
          heads: groups.map(g => g.head), sizes: groups.map(g => g.notes.length),
          expiringAllLate: expiring ? expiring.notes.every(n => n.startsWith("再 ") && n.includes("級接不到")) : null,
          dev: __rows().filter(li => li.textContent.includes("開發測試用")).length };`);
      await shot("g2-eligible-heads.png");
      const order = board.heads.map(head => HEADS.indexOf(head));
      check("G2 按「只看我現在接得到的」：標籤亮起來、整份清單載得出來", board.pressed === true && board.total > 0 && board.rows === board.total, board);
      check("G2 清單中間的小標只有「快過期，先做這些」「剛解鎖」「隨時可以補」，照這個順序（至少兩種）、小標前面沒有零散的列、每個小標底下都有列",
        board.heads.length >= 2 && order.every((at, i) => at >= 0 && (i === 0 || at > order[i - 1])) && board.stray === 0 && board.sizes.every(size => size > 0),
        { heads: board.heads, sizes: board.sizes, stray: board.stray });
      check("G2 「快過期」那一組每一列的小字都寫「再 N 級接不到」", board.expiringAllLate === true, board.expiringAllLate);
      check("G2 「接得到的」清單裡沒有「開發測試用」", board.dev === 0, board.dev);

      // 選了分類也一樣看得到前置：「找回的玉璽」（楓之島）的前置「陰謀背景」在維多利亞島，選「楓之島」時小字還是寫「要先做前置」（寫死：任務 2342）
      const crossCategory = await ev(`
        __select("任務分類", "楓之島"); await __sleep(700);
        const row = __row("2342");
        const result = { listed: !!row, note: row?.querySelector(":scope > button .tabular-nums")?.textContent.trim() ?? null, count: __count() };
        __select("任務分類", ""); await __sleep(700);
        return { ...result, countAll: __count() };`);
      check("G2 分類選「楓之島」：「找回的玉璽」的前置在別的分類，小字還是寫「要先做前置」，清單只剩那個分類、換回全部分類筆數回來",
        crossCategory.listed === true && crossCategory.note?.includes("要先做前置") === true && digits(crossCategory.count) < board.total && digits(crossCategory.countAll) === board.total, { crossCategory, total: board.total });

      // 卡片開著時按「我做完了」、再按一次取消：卡片裡那顆按鈕在畫面上的位置不動（±1px），清單的順序也不動。
      // 寫死任務 2323「跨越城牆（３）」：Lv.35 槍騎兵的清單上有別的任務要先做它，它一打勾那些任務就不再「要先做」、原本會跳到它前面把它往下擠（手機上卡片被推走 240px）
      const still = await ev(`
        const id = "2323";
        if (!__row(id)) return { skipped: "「接得到的」清單上找不到任務 2323" };
        const name = __row(id).querySelector(":scope > button span.truncate").textContent.trim();
        // 清單上有幾列的任務把它列在前置（有的話這項才有意義：它一打勾，那些列就從「要先做」變成能直接接）
        const dependents = (await (await fetch("/data/quests.json")).json()).filter(quest => (quest.pre ?? []).includes(id) && __row(quest.id)).length;
        window.scrollTo({ top: 0, behavior: "instant" }); await __sleep(300);
        __row(id).scrollIntoView({ block: "center", behavior: "instant" }); await __sleep(300);
        __tap(id); await __waitFor(() => __id() === id); await __sleep(1500);
        const btn = () => [...document.querySelectorAll("#db-row-" + id + " article button[aria-pressed]")].find(b => b.textContent.trim().endsWith("做完了"));
        const y = () => Math.round(btn()?.getBoundingClientRect().top ?? NaN);
        const order = () => __rows().map(li => li.id).join(",");
        const start = { y: y(), order: order() };
        btn().click();
        const tickFrames = await __painted(900, y);
        const ticked = { y: y(), pressed: __pressed(btn()), sameOrder: order() === start.order };
        btn().click();
        const untickFrames = await __painted(900, y);
        const unticked = { y: y(), pressed: __pressed(btn()), sameOrder: order() === start.order };
        __collapseBtn().click(); await __waitFor(() => __id() === null, 3000); await __sleep(600);
        window.scrollTo({ top: 0, behavior: "instant" }); await __sleep(300);
        return { name, dependents, start: start.y, ticked, unticked, tickFrames: __changes(tickFrames), untickFrames: __changes(untickFrames), left: JSON.parse(localStorage.getItem("ms-done-quests") ?? "[]") };`);
      check("G2 手機：開著卡片按「我做完了」、再按一次取消：卡片裡那顆按鈕在畫面上的位置不動（±1px）、清單順序也不動（任務 2323，有別的任務要先做它）",
        !still.skipped && still.dependents > 0 && still.ticked.pressed === true && still.unticked.pressed === false && still.ticked.sameOrder === true && still.unticked.sameOrder === true
          && still.tickFrames.concat(still.untickFrames).every(v => near(v, still.start, 1)) && still.left.length === 0, still);

      // 第一列打開：卡片裡的「我做完了」（沒按、高 36px）→ 按下去變「做完了」、卡片還在、那一列標「做完了」、筆數沒變、記進本機
      const ticked = await ev(`
        const id = __rowId(0);
        const countBefore = __count();
        __tap(id); await __waitFor(() => __id() === id); await __sleep(1300);
        const doneBtn = () => [...(document.querySelector("#db-row-" + id + " article")?.querySelectorAll("button[aria-pressed]") ?? [])].find(b => b.textContent.trim().endsWith("做完了"));
        const state = () => { const b = doneBtn(); return b ? { text: b.textContent.trim(), pressed: __pressed(b), height: Math.round(b.getBoundingClientRect().height) } : null; };
        const before = state();
        if (!before) return { id, skipped: "卡片裡找不到「我做完了」按鈕" };
        doneBtn().click(); await __sleep(700);
        return { id, countBefore, before, after: state(), open: __open(), badge: __rowBtn(id).textContent.includes("做完了"),
          saved: JSON.parse(localStorage.getItem("ms-done-quests") ?? "[]"), countAfter: __count() };`);
      check("G2 手機點第一列：卡片裡有「我做完了」按鈕（沒按、高 36px）",
        !ticked.skipped && ticked.before.text === "我做完了" && ticked.before.pressed === false && near(ticked.before.height, 36, 1), ticked);
      check("G2 按「我做完了」：按鈕變「做完了」（亮著）、卡片還開著、那一列標「做完了」、筆數沒變、記進本機",
        !ticked.skipped && ticked.after.text === "做完了" && ticked.after.pressed === true && ticked.open.length === 1 && ticked.open[0] === ticked.id
          && ticked.badge === true && ticked.countAfter === ticked.countBefore && ticked.saved.includes(ticked.id), ticked);
      await shot("g2-done-card.png");

      // 收起：做完的那一列不見、筆數少一筆；整頁重新整理後還是不列（記在這台瀏覽器）、標籤還亮著
      const collapsed = await ev(`
        const id = __id();
        __collapseBtn().click(); await __waitFor(() => __id() === null, 3000); await __sleep(600);
        return { id, idAfter: __id(), open: __open(), row: !!__row(id), count: __count() };`);
      check("G2 收起卡片：做完的那一列不見、筆數少一筆",
        !ticked.skipped && collapsed.idAfter === null && collapsed.open.length === 0 && collapsed.row === false && digits(collapsed.count) === digits(ticked.countBefore) - 1, { collapsed, countBefore: ticked.countBefore });
      await reload();
      const reloaded = await ev(`await __ready(); await __sleep(900);
        return { pressed: __pressed(__tag("只看我現在接得到的")), count: __count(), row: !!__row(${JSON.stringify(ticked.id)}) };`);
      check("G2 整頁重新整理後：標籤還亮著、做完的那一筆還是不列、筆數一樣", reloaded.pressed === true && reloaded.row === false && reloaded.count === collapsed.count, { reloaded, collapsed: collapsed.count });

      // 把標籤關掉看一般清單：做完的那一筆照樣列、標「做完了」（一般清單不藏做完的）
      const general2 = await ev(`
        __tag("只看我現在接得到的").click(); await __sleep(700);
        const id = ${JSON.stringify(ticked.id)};
        __setSearch(id); await __sleep(700);
        const row = __row(id);
        return { pressed: __pressed(__tag("只看我現在接得到的")), listed: !!row, badge: !!row?.textContent.includes("做完了") };`);
      await shot("g2-general-done.png");
      check("G2 關掉標籤看一般清單：做完的那一筆還在、標「做完了」", general2.pressed === false && general2.listed === true && general2.badge === true, general2);

      // 清單很下面（第 70 列以後）、而且有別列要先做它的任務：按「我做完了」→ 卡片還在那一列下面（不被擠到清單最上面）、載出來的筆數不被收回 60 筆、
      // 那一列跟卡片裡的按鈕在畫面上的位置不動（±1px，逐格量）；收起後那一列不見，原本接在後面的那一列放到導覽列下方（不跳回清單開頭，
      // 這時清單才重排，原位置現在是別的列，所以要認那一列的 id，不是認位置）
      await fresh("/db/quests");
      await ev(`__tag("只看我現在接得到的").click(); await __sleep(900); return 1;`);
      const deep = await ev(`
        const total = Number(__count().replace(/[^0-9]/g, ""));
        for (let i = 0; i < 12 && __rows().length < total; i++) await __loadMore();
        const rows = __rows();
        const nameOf = li => li.querySelector(":scope > button span.truncate").textContent.trim();
        const noteOf = li => li.querySelector(":scope > button .tabular-nums")?.textContent.trim() ?? "";
        const preNames = new Set(rows.map(noteOf).filter(note => note.startsWith("要先做：")).map(note => note.slice(4).replace(/ 等 [0-9]+ 個$/, "")));
        const at = rows.findIndex((li, i) => i >= 70 && preNames.has(nameOf(li)));
        if (at < 0) return { skipped: "第 70 列以後找不到有別列要先做它的任務" };
        const id = rows[at].id.replace("db-row-", "");
        __row(id).scrollIntoView({ block: "center", behavior: "instant" }); await __sleep(400);
        __tap(id); await __waitFor(() => __id() === id); await __sleep(1500);
        const btn = () => [...document.querySelectorAll("#db-row-" + id + " article button[aria-pressed]")].find(b => b.textContent.trim().endsWith("做完了"));
        const spot = () => ({ row: __top(id), btn: Math.round(btn()?.getBoundingClientRect().top ?? NaN) });
        const at0 = spot(); let moved = 0;
        btn().click();
        await __painted(900, () => {
          const s = spot();
          moved = Math.max(moved, s.row === null || Number.isNaN(s.btn) ? 9999 : Math.max(Math.abs(s.row - at0.row), Math.abs(s.btn - at0.btn)));
          return s.row;
        });
        const ticked = { rows: __rows().length, open: __open(), topCard: __topCard(), moved, at: at0 };
        const rowIds = () => __rows().map(li => li.id.replace("db-row-", ""));
        const nextId = rowIds()[rowIds().indexOf(id) + 1] ?? null;
        const nextAt = rowIds().indexOf(nextId);
        (__collapseBtn() ?? __topCollapse())?.click(); await __waitFor(() => __id() === null, 3000); await __sleep(900);
        const next = nextId ? __row(nextId) : null;
        return { id, nextId, at, total, ticked, collapsed: { rows: __rows().length, row: !!__row(id), nextTop: next ? Math.round(next.getBoundingClientRect().top) : null, nextAt: [nextAt, rowIds().indexOf(nextId)] } };`);
      check("G2 清單很下面（第 70 列以後）的任務按「我做完了」：卡片還在那一列下面、載出來的筆數沒被收回 60 筆、那一列跟卡片裡的按鈕在畫面上的位置不動（±1px）",
        !deep.skipped && deep.ticked.open[0] === deep.id && deep.ticked.topCard === false && deep.ticked.rows === deep.total && deep.ticked.moved <= 1, deep);
      check("G2 收起後：那一列不見、載出來的筆數沒被收回 60 筆、原本接在後面的那一列在導覽列下方",
        !deep.skipped && deep.collapsed.row === false && deep.collapsed.rows === deep.total - 1 && near(deep.collapsed.nextTop, 80, 3), deep);

      // 清單最後一列、按「我做完了」再收起：那一列不見，後面已經沒有列可以接著看，就看前一列（不跳回清單開頭）
      const last = await ev(`
        const rows = __rows();
        const lastId = rows[rows.length - 1].id.replace("db-row-", "");
        const prevId = rows[rows.length - 2].id.replace("db-row-", "");
        __row(lastId).scrollIntoView({ block: "center", behavior: "instant" }); await __sleep(400);
        __tap(lastId); await __waitFor(() => __id() === lastId); await __sleep(1500);
        const btn = [...document.querySelectorAll("#db-row-" + lastId + " article button[aria-pressed]")].find(b => b.textContent.trim().endsWith("做完了"));
        btn.click(); await __sleep(900);
        (__collapseBtn() ?? __topCollapse())?.click(); await __waitFor(() => __id() === null, 3000); await __sleep(900);
        const box = __row(prevId)?.getBoundingClientRect();
        return { lastId, prevId, rows: __rows().length, gone: !__row(lastId), prevTop: box ? Math.round(box.top) : null, prevBottom: box ? Math.round(box.bottom) : null, scrollY: Math.round(scrollY), viewport: innerHeight };`);
      check("G2 清單最後一列按「我做完了」再收起：那一列不見、前一列在畫面上（後面沒有列可以接著看，也不跳回清單開頭）",
        last.gone === true && last.prevTop !== null && last.prevTop >= 0 && last.prevBottom <= last.viewport, last);

      // 桌機：挑一列小字寫「要先做：〇〇」的、一列寫「再 N 級接不到 · 要先做前置」的，各按一次「我做完了」再按一次取消
      await desktop();
      await fresh("/db/quests");
      await ev(`__tag("只看我現在接得到的").click(); await __sleep(900); return 1;`);
      const NOTE_JS = `
        const noteOf = id => __rowBtn(id)?.querySelector(".tabular-nums")?.textContent.trim() ?? "";
        const doneBtn = () => [...document.querySelectorAll("#db-side article button[aria-pressed]")].find(b => b.textContent.trim().endsWith("做完了"));
        const snap = id => ({ note: noteOf(id), chip: !!__rowBtn(id)?.textContent.includes("做完了"), text: doneBtn()?.textContent.trim() ?? null, pressed: __pressed(doneBtn()) });`;
      const probe = async (kind, file) => {
        const first = await ev(`${NOTE_JS}
          const match = text => ${JSON.stringify(kind)} === "pre" ? text.startsWith("要先做：") : text.includes("接不到") && text.includes("要先做前置");
          const id = __rows().map(li => li.id.replace("db-row-", "")).find(id => match(noteOf(id)));
          if (!id) return { skipped: "清單前 60 列裡找不到這種小字的列" };
          const before = { note: noteOf(id), chip: !!__rowBtn(id).textContent.includes("做完了") };
          __tap(id); await __waitFor(() => __id() === id && !!doneBtn()); await __sleep(600);
          doneBtn().click(); await __sleep(600);
          return { id, before, ticked: snap(id) };`);
        if (!first.skipped) await shot(file);
        const undone = first.skipped ? null : await ev(`${NOTE_JS} const id = ${JSON.stringify(first.id)}; doneBtn().click(); await __sleep(600); return snap(id);`);
        return { first, undone };
      };
      const sayNothing = note => note !== "" && !/要先做|接不到/.test(note);
      const probeOk = (r, saysBefore) =>
        !r.first.skipped && saysBefore(r.first.before.note) && r.first.before.chip === false
        && r.first.ticked.text === "做完了" && r.first.ticked.pressed === true && r.first.ticked.chip === true && sayNothing(r.first.ticked.note)
        && r.undone.text === "我做完了" && r.undone.pressed === false && r.undone.chip === false && r.undone.note === r.first.before.note;
      const onlyPre = await probe("pre", "g2-desktop-done-pre.png");
      check("G2 桌機：小字寫「要先做：〇〇」的那一列按「我做完了」→ 標「做完了」、小字不再寫「要先做」；再按一次取消 → 小字寫回來、標籤拿掉",
        probeOk(onlyPre, note => note.startsWith("要先做：")), onlyPre);
      const latePre = await probe("late", "g2-desktop-done-late.png");
      check("G2 桌機：寫「再 N 級接不到 · 要先做前置」的那一列也一樣（做完後不再寫快接不到、要先做）",
        probeOk(latePre, note => note.includes("接不到") && note.includes("要先做前置")), latePre);

      // 建議等級用的資料（怪物）載不到：清單照列，只是沒有建議等級——沒寫需求等級的小字寫分類、排最後；不是整頁寫「資料載入失敗」
      await page.send("Network.enable");
      await page.send("Network.setBlockedURLs", { urls: ["*monsters.json*"] });
      let noSuggest;
      try {
        await fresh("/db/quests");
        noSuggest = await ev(`
          const total = Number(__count().replace(/[^0-9]/g, ""));
          for (let i = 0; i < 12 && __rows().length < total; i++) await __loadMore();
          const notes = __rows().map(li => li.querySelector(":scope > button .tabular-nums")?.textContent.trim() ?? "");
          const isLevel = note => /^Lv\\.[0-9]+$/.test(note);
          const firstOther = notes.findIndex(note => !isLevel(note));
          return { failed: document.body.innerText.includes("資料載入失敗"), total, rows: notes.length, suggested: notes.filter(note => note.startsWith("建議 Lv.")).length,
            levels: notes.filter(isLevel).length, categories: notes.filter(note => note && !isLevel(note)).length,
            levelsFirst: firstOther < 0 || notes.slice(firstOther).every(note => !isLevel(note)) };`);
      } catch (error) {
        noSuggest = { error: String(error?.message ?? error).slice(0, 200) };
      } finally {
        await page.send("Network.setBlockedURLs", { urls: [] });
        await page.send("Network.disable");
      }
      check("G2 怪物資料載不到：任務清單照列（沒有建議等級，沒寫需求等級的小字寫分類、排最後），不是整頁寫「資料載入失敗」",
        !noSuggest.error && noSuggest.failed === false && noSuggest.rows > 0 && noSuggest.rows === noSuggest.total && noSuggest.total === sorted.total
          && noSuggest.suggested === 0 && noSuggest.levels > 0 && noSuggest.categories > 0 && noSuggest.levelsFirst === true, noSuggest);
    } finally {
      await setMine(45, 110);
    }
  });

  // G3 怪物頁（v0.60）。篩選列是標籤：角色 Lv.35 槍騎兵時有「適合我練的」「包含低 5 級」兩顆，手機 375、360 寬都放在同一排；兩顆只能開一顆、點開著的那顆就關；
  // 開了，標籤下面小字寫等級範圍（Lv.35–40／Lv.30–40，職業有規則就接在後面、用「；」隔開），清單每一列的等級都在範圍裡（含邊界），
  // 順序、筆數、小字都跟網站自己的怪物資料（monsters.json）另外算的一樣；包含低 5 級比適合我練的多；清單小字寫「Lv.35 · 經驗 405」。
  // 「連沒有名字的怪一起列」只在資料裡真的有沒名字的怪（un）時才出現——現在一隻都沒有，所以不出現、這個分頁記著它開著也不寫說明字；資料有了就照有標籤的流程驗。
  // 整頁重新整理後標籤還開著、清單還是篩過的、console 沒有新的錯誤；角色沒填等級就沒有範圍標籤、標籤那一塊不留空白；
  // 角色換成 Lv.35 僧侶、開包含低 5 級：小字「Lv.30–40；只列不死系…」、清單只列不死系（規則看玩家的 35 級，不是範圍下緣的 30 級）。跑完角色換回最前面存的狂戰士 Lv.45
  await section("G3", async () => {
    const FIT = "適合我練的";
    const WIDE = "包含低 5 級";
    const UNNAMED = "連沒有名字的怪一起列";
    const UNNAMED_HINT = "沒有名字的怪通常是活動或未啟用的內容";
    const FIT_HINT = "Lv.35–40";
    const WIDE_HINT = "Lv.30–40";
    const CLERIC_HINT = "Lv.30–40；只列不死系：群體治癒補得到";
    const setMine = (level, job) => evaluate(`localStorage.setItem("ms-profile", JSON.stringify({ level: ${level}, job: ${job} })); "ok"`);
    // 頁面裡的小工具：expected 用網站載清單的同一份怪物資料另外算「清單該是哪幾隻、小字該寫什麼」；view 把畫面現在的樣子（整份清單載出來）跟它比
    const G3_JS = `
      const FIT = ${JSON.stringify(FIT)}, WIDE = ${JSON.stringify(WIDE)}, UNNAMED = ${JSON.stringify(UNNAMED)};
      window.__monsterData = window.__monsterData ?? fetch(performance.getEntriesByType("resource").map(e => e.name).find(u => u.includes("/data/monsters.json")) ?? "/data/monsters.json").then(res => res.json());
      // 資料裡有沒有沒名字的怪（un）：有，才會有「連沒有名字的怪一起列」那顆標籤
      const anyUnnamed = async () => (await window.__monsterData).some(m => m.un);
      // from～to 級（null＝不限）、連不連沒有名字的、這個職業打得動的怪：等級由低到高、同級照 id；小字「Lv.35 · 經驗 405」，沒有經驗只寫「Lv.35」
      const expected = async (from, to, unnamed, suits = () => true) => (await window.__monsterData)
        .filter(m => (unnamed || !m.un) && (from === null || (m.lv !== null && m.lv >= from && m.lv <= to)) && suits(m))
        .sort((a, b) => (a.lv ?? 0) - (b.lv ?? 0) || a.id - b.id)
        .map(m => ({ id: String(m.id), note: m.lv ? (m.exp ? "Lv." + m.lv + " · 經驗 " + m.exp.toLocaleString("zh-TW") : "Lv." + m.lv) : "" }));
      // 所有標籤放在同一個容器裡（標籤那一排）；一顆標籤都沒有就是 null
      const tagRow = () => document.querySelector("main button[aria-pressed]")?.parentElement ?? null;
      // 兩顆範圍標籤的位置跟大小（量一行放不放得下）
      const shape = () => {
        const a = __tag(FIT)?.getBoundingClientRect(), b = __tag(WIDE)?.getBoundingClientRect(), row = tagRow()?.getBoundingClientRect();
        if (!a || !b || !row) return null;
        const r = n => Math.round(n * 10) / 10;
        return { viewport: innerWidth, fitTop: r(a.top), wideTop: r(b.top), fitWidth: r(a.width), wideWidth: r(b.width), height: r(a.height), gap: r(b.left - a.right), wideRight: r(b.right), rowRight: r(row.right) };
      };
      const view = async (from, to, unnamed, suits) => {
        const total = Number(__count().replace(/[^0-9]/g, ""));
        for (let i = 0; i < 12 && __rows().length < total; i++) await __loadMore();
        window.scrollTo({ top: 0, behavior: "instant" }); await __sleep(200);
        const rows = __rows().map(li => ({ id: li.id.replace("db-row-", ""), note: li.querySelector(":scope > button .tabular-nums")?.textContent.trim() ?? "" }));
        const want = await expected(from, to, unnamed, suits);
        // 小字照每一隻怪自己的資料比（跟清單列了哪幾隻無關）
        const noteOf = new Map((await expected(null, null, true)).map(w => [w.id, w.note]));
        const levels = rows.map(row => Number(/^Lv\\.([0-9]+)/.exec(row.note)?.[1]));
        return {
          names: [...document.querySelectorAll("main button[aria-pressed]")].map(b => b.textContent.trim()),
          fit: __pressed(__tag(FIT)), wide: __pressed(__tag(WIDE)), unnamed: __pressed(__tag(UNNAMED)),
          // 標籤那一排下面緊接著的小字（等級範圍＋職業規則、沒有名字的怪的說明）
          hints: [...(tagRow()?.nextElementSibling?.querySelectorAll("p") ?? [])].map(p => p.textContent.trim()),
          count: total, rows: rows.length, want: want.length,
          sameList: rows.length === want.length && rows.every((row, i) => row.id === want[i].id),
          sameNotes: rows.length > 0 && rows.every(row => row.note === noteOf.get(row.id)),
          missing: want.filter(w => !rows.some(r => r.id === w.id)).map(w => w.id).slice(0, 5),
          extra: rows.filter(r => !want.some(w => w.id === r.id)).map(r => r.id).slice(0, 5),
          firstNotes: rows.slice(0, 3).map(row => row.note),
          minLevel: Math.min(...levels), maxLevel: Math.max(...levels),
        };
      };`;
    await mobile();
    try {
      // 角色還沒填等級：沒有範圍標籤；資料裡沒有沒名字的怪就一顆標籤都沒有，標籤那一塊整個不放（搜尋框到「N 筆」中間不多留空白）
      await setMine(0, -1);
      await fresh("/db/monsters");
      const bare = await ev(`${G3_JS}
        const box = __search()?.parentElement;
        const count = [...document.querySelectorAll("main p")].find(p => /^([0-9,]+ 筆|載入中…)$/.test(p.textContent.trim()));
        return { names: [...document.querySelectorAll("main button[aria-pressed]")].map(b => b.textContent.trim()), unnamedInData: await anyUnnamed(),
          gap: box && count ? Math.round((count.getBoundingClientRect().top - box.getBoundingClientRect().bottom) * 10) / 10 : null };`);
      check("G3 角色還沒填等級：沒有「適合我練的」「包含低 5 級」（資料裡有沒名字的怪才有「連沒有名字的怪一起列」，現在沒有就一顆標籤都沒有），標籤那一塊不留空白（搜尋框到「N 筆」只隔一段間距）",
        bare.unnamedInData
          ? bare.names.length === 1 && bare.names[0] === UNNAMED
          : bare.names.length === 0 && bare.gap !== null && bare.gap > 0 && bare.gap < 15, bare);

      // 角色 Lv.35 槍騎兵（沒有職業規則）：一開始標籤都沒按、舊的勾選框不見了、沒有小字，清單是全部有名字的怪
      await setMine(35, 130);
      await fresh("/db/monsters");
      const start = await ev(`${G3_JS}
        return { unnamedInData: await anyUnnamed(), checkboxes: document.querySelectorAll("main input[type=checkbox]").length, ...(await view(null, null, false)) };`);
      const wantNames = start.unnamedInData ? [FIT, WIDE, UNNAMED] : [FIT, WIDE];
      check("G3 角色 Lv.35 槍騎兵：怪物頁有「適合我練的」「包含低 5 級」兩顆標籤（標籤上只寫名稱、不寫等級；資料裡有沒名字的怪才多一顆「連沒有名字的怪一起列」，現在沒有）、一開始都沒按，沒有勾選框、沒有小字，清單是全部有名字的怪",
        start.names.length === wantNames.length && wantNames.every((name, i) => start.names[i] === name)
          && start.fit === false && start.wide === false && start.unnamed === false && start.checkboxes === 0 && start.hints.length === 0 && start.want > 0 && start.sameList === true && start.sameNotes === true,
        { names: start.names, unnamedInData: start.unnamedInData, checkboxes: start.checkboxes, pressed: [start.fit, start.wide, start.unnamed], hints: start.hints, rows: start.rows, want: start.want, sameList: start.sameList, sameNotes: start.sameNotes, missing: start.missing, extra: start.extra, firstNotes: start.firstNotes });

      // 手機 375、360 寬：兩顆範圍標籤在同一排（一行放得下），沒有擠出標籤那一排
      const shape375 = await ev(`${G3_JS} return shape();`);
      await page.send("Emulation.setDeviceMetricsOverride", { width: 360, height: 800, deviceScaleFactor: 2, mobile: true });
      await sleep(500);
      const shape360 = await ev(`${G3_JS} return shape();`);
      await mobile();
      await sleep(300);
      const oneRow = s => !!s && Math.abs(s.fitTop - s.wideTop) < 1 && s.gap > 0 && s.wideRight <= s.rowRight + 0.5;
      check("G3 手機 375、360 寬：「適合我練的」「包含低 5 級」在同一排（一行放得下），沒有擠出標籤那一排",
        oneRow(shape375) && oneRow(shape360) && shape375.viewport === 375 && shape360.viewport === 360, { at375: shape375, at360: shape360 });

      // 按「適合我練的」：同級到高 5 級，小字寫「Lv.35–40」
      const fit = await ev(`${G3_JS} __tag(FIT).click(); await __sleep(800); return await view(35, 40, false);`);
      check("G3 按「適合我練的」：只有它亮，標籤下面小字寫「Lv.35–40」（槍騎兵沒有職業規則），每一列等級都在 35–40（含邊界）、清單跟怪物資料算出來的一樣",
        fit.fit === true && fit.wide === false && fit.unnamed === false && fit.hints.length === 1 && fit.hints[0] === FIT_HINT && fit.want > 0 && fit.sameList === true
          && fit.minLevel >= 35 && fit.maxLevel <= 40 && fit.count === fit.rows, fit);

      // 再按「包含低 5 級」：兩顆只能開一顆，「適合我練的」自動關掉，小字換成「Lv.30–40」
      const wide = await ev(`${G3_JS} __tag(WIDE).click(); await __sleep(800); return await view(30, 40, false);`);
      await shot("g3-monster-tags.png");
      check("G3 再按「包含低 5 級」：「適合我練的」自動關掉、只有它亮；小字換成「Lv.30–40」；每一列等級都在 30–40（含邊界）、有低於 35 級的，筆數比「適合我練的」多、跟怪物資料算出來的一樣",
        wide.wide === true && wide.fit === false && wide.unnamed === false && wide.hints.length === 1 && wide.hints[0] === WIDE_HINT && wide.want > fit.want && wide.sameList === true
          && wide.minLevel >= 30 && wide.minLevel < 35 && wide.maxLevel <= 40 && wide.rows > fit.rows, { wide, fitRows: fit.rows });
      // 清單小字：等級＋經驗（經驗上千的有千分位、沒有經驗的只寫等級，都照怪物資料算）
      check("G3 清單小字寫等級跟經驗（例：Lv.35 · 經驗 405），每一列跟怪物資料算出來的一樣",
        wide.sameNotes === true && wide.rows > 0 && wide.firstNotes.some(note => /^Lv\.[0-9]+ · 經驗 [0-9,]+$/.test(note)), { sameNotes: wide.sameNotes, firstNotes: wide.firstNotes });

      // 再按一次「包含低 5 級」：關掉、小字拿掉，清單回到全部有名字的怪（整份：千分位、沒有經驗只寫等級的小字也一起比）
      const closed = await ev(`${G3_JS} __tag(WIDE).click(); await __sleep(800); return await view(null, null, false);`);
      check("G3 再按一次開著的「包含低 5 級」：關掉、兩顆範圍標籤都不亮、小字拿掉，清單回到全部有名字的怪（小字都對）",
        closed.wide === false && closed.fit === false && closed.hints.length === 0 && closed.sameList === true && closed.sameNotes === true && closed.rows > wide.rows, { closed, wideRows: wide.rows });

      // 「連沒有名字的怪一起列」。每一段從重新打開的頁面開始，前面哪一步壞了不會連累這一段
      await fresh("/db/monsters");
      if (start.unnamedInData) {
        // 資料裡有沒名字的怪：標籤在，按了亮起來、標籤下面出一行說明、清單多出沒有名字的怪（照資料算）；再按一次說明字拿掉
        const unnamedOn = await ev(`${G3_JS} __tag(UNNAMED).click(); await __sleep(800); return await view(null, null, true);`);
        const unnamedOff = await ev(`${G3_JS} __tag(UNNAMED).click(); await __sleep(800); return await view(null, null, false);`);
        check("G3 按「連沒有名字的怪一起列」：亮起來、標籤下面寫「沒有名字的怪通常是活動或未啟用的內容」、清單多出沒有名字的怪（照資料算）；再按一次：說明字拿掉、標籤不亮",
          unnamedOn.unnamed === true && unnamedOn.hints.length === 1 && unnamedOn.hints[0] === UNNAMED_HINT && unnamedOn.sameList === true && unnamedOn.rows > unnamedOff.rows
            && unnamedOff.unnamed === false && unnamedOff.hints.length === 0 && unnamedOff.sameList === true,
          { on: { unnamed: unnamedOn.unnamed, hints: unnamedOn.hints, sameList: unnamedOn.sameList, rows: unnamedOn.rows }, off: { unnamed: unnamedOff.unnamed, hints: unnamedOff.hints, sameList: unnamedOff.sameList, rows: unnamedOff.rows } });
      } else {
        // 資料裡沒有沒名字的怪：沒有那顆標籤。這個分頁記著它開著（舊版的勾選框留下的）也不寫說明字、清單照常
        await evaluate(`sessionStorage.setItem("ms-db:db:怪物:showUnnamed", "true"); 1`);
        await reload();
        const stored = await ev(`${G3_JS} await __ready(); await __sleep(900); return await view(null, null, true);`);
        check("G3 資料裡沒有沒名字的怪：就算這個分頁記著「連沒有名字的怪一起列」開著，也沒有那顆標籤、沒有說明字，清單照常（跟怪物資料算出來的一樣）",
          !stored.names.includes(UNNAMED) && stored.unnamed === false && stored.hints.length === 0 && stored.rows > 0 && stored.sameList === true && stored.sameNotes === true,
          { names: stored.names, hints: stored.hints, rows: stored.rows, want: stored.want, sameList: stored.sameList, sameNotes: stored.sameNotes });
      }

      // 整頁重新整理（不是站內換頁）：開著的「包含低 5 級」（資料裡有沒名字的怪就連「連沒有名字的怪一起列」）還開著、小字還在、清單還是篩過的；
      // 第一格照記住的畫，不能跟伺服器的頁面對不上（console 不能出現新的錯誤）
      await fresh("/db/monsters");
      await ev(`${G3_JS} __tag(WIDE).click(); await __sleep(400); ${start.unnamedInData ? "__tag(UNNAMED).click();" : ""} await __sleep(800); return 1;`);
      const problemsBefore = consoleProblems.length;
      await reload();
      const reloaded = await ev(`${G3_JS} await __ready(); await __sleep(900); return await view(30, 40, ${start.unnamedInData});`);
      await shot("g3-monster-reload.png");
      const reloadProblems = consoleProblems.slice(problemsBefore);
      const wantHints = start.unnamedInData ? [WIDE_HINT, UNNAMED_HINT] : [WIDE_HINT];
      check("G3 整頁重新整理：開著的「包含低 5 級」還開著、標籤下面的小字還在、清單還是篩過的，console 沒有新的錯誤",
        reloaded.wide === true && reloaded.fit === false && reloaded.unnamed === start.unnamedInData && reloaded.hints.length === wantHints.length && wantHints.every((text, i) => reloaded.hints[i] === text)
          && reloaded.want > 0 && reloaded.sameList === true && reloadProblems.length === 0,
        { wide: reloaded.wide, fit: reloaded.fit, unnamed: reloaded.unnamed, hints: reloaded.hints, rows: reloaded.rows, want: reloaded.want, sameList: reloaded.sameList, problems: reloadProblems.slice(0, 3) });

      // 角色 Lv.35 僧侶（31～70 級只打不死系）：包含低 5 級（Lv.30–40）也照 35 級算規則——範圍下緣的 30 級不適用這條，用錯就會多列一堆不是不死系的怪
      await setMine(35, 230);
      await fresh("/db/monsters");
      const cleric = await ev(`${G3_JS}
        __tag(WIDE).click(); await __sleep(800);
        const plain = (await expected(30, 40, false)).length;
        return { ...(await view(30, 40, false, m => !!m.und)), plain };`);
      await shot("g3-monster-cleric.png");
      check("G3 角色 Lv.35 僧侶開「包含低 5 級」：標籤下面小字寫「Lv.30–40；只列不死系：群體治癒補得到」、清單只列不死系的怪（職業規則看玩家的 35 級，不是範圍下緣的 30 級）",
        cleric.wide === true && cleric.hints.length === 1 && cleric.hints[0] === CLERIC_HINT && cleric.want > 0 && cleric.want < cleric.plain && cleric.sameList === true,
        { wide: cleric.wide, hints: cleric.hints, rows: cleric.rows, want: cleric.want, plain: cleric.plain, sameList: cleric.sameList, missing: cleric.missing, extra: cleric.extra });
    } finally {
      await setMine(45, 110);
    }
  });

  // G4 道具頁選了分類、種類之後整頁重新整理（不是站內換頁）：種類還在、清單還是只有那個種類。
  // 資料載入中種類清單是空的，曾經因此把記住的種類清成「全部種類」
  await section("G4", async () => {
    await mobile();
    await fresh("/db/items");
    const picked = await ev(`
      __select("道具分類", "裝備"); await __sleep(500);
      const sub = document.querySelector("main select[aria-label='道具種類']");
      if (!sub || ![...sub.options].some(o => o.value === "單手劍")) return { skipped: "選了裝備之後沒有「單手劍」這個種類" };
      __select("道具種類", "單手劍"); await __sleep(700);
      const rows = __rows();
      return { count: __count(), rows: rows.length, onlySword: rows.every(li => li.querySelector("button").textContent.includes("單手劍")) };`);
    let r = picked;
    if (!picked.skipped) {
      await reload();
      r = await ev(`await __ready(); await __sleep(900);
        const sub = document.querySelector("main select[aria-label='道具種類']");
        const rows = __rows();
        return { category: document.querySelector("main select[aria-label='道具分類']")?.value ?? null, subcategory: sub?.value ?? null, count: __count(), rows: rows.length,
          onlySword: rows.every(li => li.querySelector("button").textContent.includes("單手劍")) };`);
      r = { before: picked, after: r };
      await shot("g4-reload-subcategory.png");
    }
    check("G4 選了「裝備」「單手劍」之後整頁重新整理：兩個下拉都還在", !picked.skipped && r.after.category === "裝備" && r.after.subcategory === "單手劍", r);
    check("G4 整頁重新整理後：清單還是只有單手劍、筆數跟重新整理前一樣", !picked.skipped && r.before.onlySword === true && r.after.onlySword === true && r.after.rows > 0 && r.after.count === r.before.count, r);
  });

  // G5 道具頁「誰能用」兩顆標籤的規則（規格第 9 條）：開了就切到「裝備」分類、種類清掉；只能開一顆；點開著的那顆就關；換到別的分類就關掉。
  // 角色用最前面存好的狂戰士 Lv.45（有職業又有等級，「〇〇能用」「現在就能穿」兩顆都會出現）；用的分類「消耗」跟它底下的種類是寫死的
  await section("G5", async () => {
    await mobile();
    await fresh("/db/items");
    // 每一步之後量一次：兩顆標籤亮不亮、兩個下拉選了什麼、筆數
    const SNAP = `const snap = () => ({ mine: __pressed(__mine()), now: __pressed(__tag("現在就能穿")),
      category: document.querySelector("main select[aria-label='道具分類']")?.value ?? null,
      subcategory: document.querySelector("main select[aria-label='道具種類']")?.value ?? null,
      count: __count(), rows: __rows().length });`;
    // 1. 先選「消耗」再挑它底下的一個種類，再按「〇〇能用」
    const a = await ev(`${SNAP}
      if (!__mine() || !__tag("現在就能穿")) return { skipped: "角色是狂戰士 Lv.45，卻缺「〇〇能用」或「現在就能穿」標籤" };
      if (![...document.querySelector("main select[aria-label='道具分類']").options].some(o => o.value === "消耗")) return { skipped: "沒有「消耗」這個分類" };
      __select("道具分類", "消耗"); await __sleep(500);
      const catOnly = snap();
      const subName = [...(document.querySelector("main select[aria-label='道具種類']")?.options ?? [])].map(o => o.value).find(Boolean);
      if (!subName) return { skipped: "「消耗」底下沒有種類可選" };
      __select("道具種類", subName); await __sleep(500);
      const before = snap();
      __mine().click(); await __sleep(600);
      return { subName, catOnly, before, after: snap() };`);
    // 2. 再按「現在就能穿」　3. 再按一次「現在就能穿」
    const b = a.skipped ? a : await ev(`${SNAP} __tag("現在就能穿").click(); await __sleep(600); return snap();`);
    await shot("g5-now-tag.png");
    const c = a.skipped ? a : await ev(`${SNAP} __tag("現在就能穿").click(); await __sleep(600); return snap();`);
    // 4. 重新打開「〇〇能用」，再把分類換到「消耗」
    const d = a.skipped ? a : await ev(`${SNAP}
      __mine().click(); await __sleep(600);
      const reopened = snap();
      __select("道具分類", "消耗"); await __sleep(600);
      return { reopened, after: snap() };`);
    check("G5 選了「消耗」和一個種類再按「〇〇能用」：標籤亮起來、分類換成「裝備」、種類清掉、清單有東西",
      !a.skipped && a.before.category === "消耗" && a.before.subcategory === a.subName && a.after.mine === true && a.after.now === false
      && a.after.category === "裝備" && a.after.subcategory === "" && a.after.rows > 0, a);
    check("G5 再按「現在就能穿」：只有它亮、「〇〇能用」自動關掉", !b.skipped && b.now === true && b.mine === false && b.category === "裝備", b);
    check("G5 再按一次「現在就能穿」：兩顆都不亮（不限職業）、分類還在「裝備」", !c.skipped && c.now === false && c.mine === false && c.category === "裝備", c);
    check("G5 開著「〇〇能用」時換到別的分類：標籤關掉、分類是新選的、筆數跟沒開標籤時一樣",
      !d.skipped && d.reopened.mine === true && d.after.mine === false && d.after.now === false && d.after.category === "消耗"
      && /^[0-9,]+ 筆$/.test(d.after.count) && d.after.count === a.catOnly.count, d.skipped ? d : { reopened: d.reopened, after: d.after, catOnlyCount: a.catOnly.count });
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
