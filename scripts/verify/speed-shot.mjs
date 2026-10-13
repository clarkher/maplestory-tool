// 練功測速（/plan/speed，v0.95）驗收：用測試截圖當假的分享畫面，從頭跑一遍，任何一項沒過 exit 1
// 用法：node scripts/verify/speed-shot.mjs [輸出資料夾] [網址，預設 http://localhost:3095] [DevTools 埠，預設 9391]
//   例：node scripts/verify/speed-shot.mjs "$TEMP/speed-shot" http://localhost:3095
// 網址用 localhost，不要用 127.0.0.1（next dev 對 127.0.0.1 的互動不理）。
// 假的分享畫面：頁面在非正式機會先看 window.__speedTestStream；腳本把 src/lib/speed/__fixtures__/window-1364.png
// 畫進 canvas、captureStream 塞進去，不用真的開遊戲、也不會跳出選視窗的對話框。
// 輸出：speed.png（整頁，1440 寬）、speed-choices.png（認不出地圖、列出候選的時候）、results.json（每一項檢查的結果＋量到的字）
// 量不到的（靠 tracker.test.ts 跟真人玩）：經驗會不會跟著動、自動停、存進排行——假畫面是靜止的。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromePort, outDir } from "./config.mjs";
import { sleep, start } from "./harness.mjs";

const OUT = outDir(process.argv[2], "speed-shot");
const BASE = (process.argv[3] ?? "http://localhost:3095").replace(/\/$/, "");
const PORT = chromePort(9391, process.argv[4]);
const FIXTURE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../src/lib/speed/__fixtures__/window-1364.png");

const MAP = "森林迷宮III"; // 基準截圖的小地圖標題；截圖是有損壓縮，多半認不出來，要玩家點一次
const READING = "Lv.46 · 經驗 406,947（79.73%）"; // 基準截圖上的等級、經驗；% 是經驗 ÷ 46 級升級要的經驗算的
const JOB = "冰雷巫師"; // jobOption(220).name
const MATE = 44;
const STATIONARY_MS = 60_000; // 地圖點好之後，同一張畫面再放這麼久，地圖不能變
const SETTINGS = { charId: "驗收用", isPublic: false, mode: "auto" };
const CHAR_LINE = `你的角色：${SETTINGS.charId}`; // 存好角色 ID 之後，角色卡收成這一行
// 靜止的畫面放著、自動模式：狀態列一直是「等經驗一動就開始算」（經驗動了才會是「量中」）；這幾句出現就是停了或認不到
const ACTIVE_STATUS = /^(等經驗一動就開始算|量中)/;
const STOPPED_STATUS = /分享停了|認不到遊戲畫面|讀不到經驗|還沒分享畫面/;

const results = { base: BASE, port: PORT, fixture: path.basename(FIXTURE), checks: [] };
const record = (name, ok, detail) => {
  results.checks.push({ name, ok: Boolean(ok), ...(detail === undefined ? {} : { detail }) });
  const text = detail === undefined ? "" : `  ${typeof detail === "string" ? detail : JSON.stringify(detail)}`;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${text}`);
  return Boolean(ok);
};

// Chrome 在下面 try 裡才開（開不起來也要寫得出 results.json、exit 1）；這幾個等 start() 回來才有值，下面的小工具都是用到才讀
let page, evaluate, ev, navigate, shot, close;

// 整趟 console 的例外、錯誤、警告（hydration 警告、沒接住的例外在這）
const problems = { exceptions: [], errors: [], warnings: [] };
const watchProblems = () =>
  page.listeners.add(msg => {
    if (msg.method === "Runtime.exceptionThrown") problems.exceptions.push(String(msg.params.exceptionDetails?.exception?.description ?? msg.params.exceptionDetails?.text).slice(0, 400));
    if (msg.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(msg.params.type)) {
      const text = msg.params.args.map(arg => arg.value ?? arg.description).join(" ").slice(0, 400);
      (msg.params.type === "error" ? problems.errors : problems.warnings).push(text);
    }
  });

const viewport = (height = 900) => page.send("Emulation.setDeviceMetricsOverride", { width: 1440, height, deviceScaleFactor: 1, mobile: false });

/** 條件成立才往下走（跨換頁用輪詢；頁面裡的等待用 harness 的 __waitFor）。逾時回 false */
async function until(expression, ms = 30000) {
  for (let t = 0; t < ms; t += 250) {
    try {
      if (await evaluate(`Boolean(${expression})`)) return true;
    } catch {
      // 換頁中，執行環境被丟掉：下一輪再試
    }
    await sleep(250);
  }
  return false;
}

/** 在頁面裡找一個元素（寫成一段會回傳元素的程式），捲到中間，回傳中心座標 */
const centerOf = finder =>
  evaluate(`(() => { const el = (${finder}); if (!el) return null; el.scrollIntoView({ block: "center" }); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);

/** 真的用滑鼠點（走 DevTools 的 Input，不是 el.click()），找不到元素回 false */
async function click(finder) {
  const at = await centerOf(finder);
  if (!at) return false;
  await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: at.x, y: at.y });
  await page.send("Input.dispatchMouseEvent", { type: "mousePressed", x: at.x, y: at.y, button: "left", clickCount: 1 });
  await page.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: at.x, y: at.y, button: "left", clickCount: 1 });
  return true;
}

const key = (name, code, vk) => async () => {
  await page.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: name, code, windowsVirtualKeyCode: vk, text: name === "Enter" ? "\r" : undefined });
  await page.send("Input.dispatchKeyEvent", { type: "keyUp", key: name, code, windowsVirtualKeyCode: vk });
};
const pressEnter = key("Enter", "Enter", 13);

const BUTTON = text => `[...document.querySelectorAll("button")].find(b => b.textContent.trim() === ${JSON.stringify(text)})`;
const bodyText = () => evaluate("document.body.innerText");

/** 整頁截圖：視窗拉到跟頁面一樣高再截（captureBeyondViewport 會把固定頁首畫進內容裡） */
async function fullShot(file) {
  const height = await evaluate("Math.ceil(document.documentElement.scrollHeight)");
  await viewport(height);
  await sleep(500);
  await ev(`await __waitFor(() => [...document.images].every(img => img.complete), 8000); await __sleep(300);`);
  await shot(file);
  await viewport();
}

/** 右邊那欄現在是什麼：地圖面板的標題、排行卡、「你在哪張圖？」跟它的候選 */
const mapState = () =>
  evaluate(`(() => {
    const titles = [...document.querySelectorAll("h2")].map(h => h.textContent.trim());
    const ask = [...document.querySelectorAll("p")].find(p => p.textContent.includes("你在哪張圖？"));
    return {
      titles,
      asking: Boolean(ask),
      candidates: ask ? [...ask.parentElement.querySelectorAll(":scope > div > button")].map(b => b.textContent.trim()) : [],
      board: titles.includes("這張圖的實測排行"),
    };
  })()`);

/** 怪物卡：照地圖面板那張 section 裡的 ul > li 抓 */
const monsterCards = () =>
  evaluate(`(() => {
    const h2 = [...document.querySelectorAll("h2")].find(h => h.textContent.trim() === ${JSON.stringify(MAP)});
    const section = h2?.closest("section");
    if (!section) return null;
    return {
      cards: [...section.querySelectorAll(":scope > ul > li")].map(li => ({
        name: li.querySelector("p.font-bold")?.textContent.trim() ?? "",
        info: li.querySelector("p.font-bold + p")?.textContent.trim() ?? "",
        party: [...li.querySelectorAll(":scope > p")].map(p => p.textContent.trim()).find(text => text.startsWith("組隊每隻")) ?? null,
      })),
      sectionText: section.innerText,
    };
  })()`);

/** 把基準截圖畫進 canvas，captureStream 當成假的分享畫面（頁面按分享時會拿它） */
async function installFakeStream() {
  const base64 = fs.readFileSync(FIXTURE).toString("base64");
  await evaluate(`new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext("2d");
      const draw = () => context.drawImage(image, 0, 0);
      draw();
      setInterval(draw, 200);
      window.__speedTestStream = canvas.captureStream(5);
      resolve(true);
    };
    image.onerror = () => reject(new Error("測試截圖載不進來"));
    image.src = "data:image/png;base64,${base64}";
  })`);
}

async function openSpeed() {
  await navigate(`${BASE}/plan/speed`);
  // dev 模式第一次進這頁要編譯，最多等 2 分半；資料載完「分享遊戲畫面」才會出現
  return until(BUTTON("分享遊戲畫面"), 150000);
}

/** 按分享，等到讀到經驗（最多再多等 20 秒）。回傳多久後讀到，沒讀到回 null */
async function shareAndRead() {
  await click(BUTTON("分享遊戲畫面"));
  const t0 = Date.now();
  await sleep(5000);
  const got = await ev(`return await __waitFor(() => document.body.innerText.includes(${JSON.stringify(READING)}), 20000)`);
  return got ? Date.now() - t0 : null;
}

let crashed = null;
try {
  ({ page, evaluate, ev, navigate, shot, close } = await start(OUT, PORT));
  watchProblems();
  await page.send("Page.bringToFront").catch(() => {});
  await viewport();

  // 1. 開頁、塞設定、重新整理
  const loaded = await openSpeed();
  record("頁面載入、看得到「分享遊戲畫面」", loaded);
  if (!loaded) throw new Error(`頁面沒載好：${(await bodyText()).slice(0, 200)}`);
  await evaluate(`(() => {
    localStorage.setItem("ms-speed", ${JSON.stringify(JSON.stringify(SETTINGS))});
    localStorage.removeItem("ms-speed-maps"); // 上次點選記住的地圖，清掉才量得到「認不出」的情況
    localStorage.removeItem("ms-profile");    // 「我的路線」填的職業，清掉才確定職業是從畫面讀的
    return true;
  })()`);
  record("重新整理後載好", await openSpeed());
  record(`重新整理後，塞進去的設定讀得到（角色卡寫「${CHAR_LINE}」）`, (await bodyText()).includes(CHAR_LINE));

  // 導覽列：電腦寬度看得到、亮著
  const nav = await evaluate(`(() => {
    const links = [...document.querySelectorAll('nav[aria-label="主選單"] a')];
    const current = links.find(a => a.getAttribute("aria-current") === "page");
    const mine = links.find(a => a.textContent.trim() === "練功測速");
    return { current: current?.textContent.trim() ?? null, width: mine ? Math.round(mine.getBoundingClientRect().width) : 0, all: links.map(a => a.textContent.trim()) };
  })()`);
  record("導覽列的「練功測速」在電腦寬度看得到、而且是亮著的那顆", nav.current === "練功測速" && nav.width > 0, nav);

  // 2. 假的分享畫面、按分享
  await installFakeStream();
  const readAfter = await shareAndRead();
  const text = await bodyText();
  record(`讀到「${READING}」（% 是經驗 ÷ 升級要的經驗算的）`, readAfter !== null, readAfter === null ? text.match(/Lv\.\d+[^\n]*|等級、經驗[^\n]*/)?.[0] ?? "沒讀到" : `${Math.round(readAfter / 1000)} 秒後讀到`);
  record(`職業讀到「${JOB}」`, text.includes(`· ${JOB}`), text.match(/經驗 [\d,]+（[\d.]+%）[^\n]*/)?.[0]);
  record("沒勾組隊時寫「單練」", text.includes("· 單練"));
  results.statusLine = await evaluate(`document.querySelector('[role="status"]')?.textContent.trim() ?? null`);

  // 3. 地圖：自動認出，或列候選請玩家點一次（基準截圖有損，認不出是預期）
  await ev(`await __waitFor(() => document.body.innerText.includes("你在哪張圖？") || [...document.querySelectorAll("h2")].some(h => h.textContent.trim() === ${JSON.stringify(MAP)}), 20000)`);
  let state = await mapState();
  const auto = state.titles.includes(MAP);
  results.mapState = { how: auto ? "auto" : state.asking ? "choices" : "none", candidates: state.candidates, titles: state.titles };
  record(`地圖那欄：自動認成「${MAP}」，或問「你在哪張圖？」`, auto || state.asking, results.mapState);

  if (!auto && state.asking) {
    await viewport(1100);
    await shot("speed-choices.png");
    await viewport();
    if (state.candidates.includes(MAP)) {
      // 候選裡剛好有：點它
      record(`候選裡有「${MAP}」，點它`, await click(BUTTON(MAP)));
      results.mapState.pickedVia = "candidate";
    } else {
      // 候選裡沒有：用「找不到就搜尋」打字找
      const input = `document.querySelector('input[aria-label="找不到就搜尋"], input[aria-label="搜尋地圖"]')`;
      const focused = await click(input);
      await page.send("Input.insertText", { text: MAP });
      const listed = await ev(`return await __waitFor(() => [...document.querySelectorAll("ul.absolute button")].some(b => b.querySelector("span.font-bold")?.textContent.trim() === ${JSON.stringify(MAP)}), 15000)`);
      record(`搜尋框打「${MAP}」，清單裡有它`, focused && listed);
      await click(`[...document.querySelectorAll("ul.absolute button")].find(b => b.querySelector("span.font-bold")?.textContent.trim() === ${JSON.stringify(MAP)})`);
      results.mapState.pickedVia = "search";
    }
  }
  const mapShown = await ev(`return await __waitFor(() => [...document.querySelectorAll("h2")].some(h => h.textContent.trim() === ${JSON.stringify(MAP)}), 10000)`);
  record(`地圖面板的標題是「${MAP}」`, mapShown, (await mapState()).titles);
  const tMap = Date.now();

  // 從現在起一直看：「你在哪張圖？」有沒有再冒出來、地圖標題有沒有消失（60 秒不能動的檢查）
  await evaluate(`(() => {
    window.__watch = { reprompt: 0, lostMap: 0, stopped: 0, lastStatus: null, samples: 0 };
    const check = () => {
      if ((document.body.textContent || "").includes("你在哪張圖？")) window.__watch.reprompt++;
      if (![...document.querySelectorAll("h2")].some(h => h.textContent.trim() === ${JSON.stringify(MAP)})) window.__watch.lostMap++;
      // 分享停了、認不到畫面：狀態列換字、「停止分享」換回「分享遊戲畫面」
      const status = document.querySelector('[role="status"]')?.textContent.trim() ?? "";
      const stopButton = [...document.querySelectorAll("button")].some(b => b.textContent.trim() === "停止分享");
      if (!stopButton || !${ACTIVE_STATUS}.test(status) || ${STOPPED_STATUS}.test(status)) { window.__watch.stopped++; window.__watch.lastStatus = status; }
      window.__watch.samples++;
    };
    new MutationObserver(check).observe(document.body, { childList: true, subtree: true, characterData: true });
    setInterval(check, 500);
    return true;
  })()`);

  // 4. 地圖面板：怪物（含掉寶）、排行
  const before = await monsterCards();
  const names = before?.cards.map(card => card.name) ?? [];
  record("怪物卡：風獨眼獸、猴子、黑曜石巨人都在，每張有等級、HP、經驗、刷怪點", ["風獨眼獸", "猴子", "黑曜石巨人"].every(name => names.includes(name)) && before.cards.every(card => /Lv\.\d+ · HP [\d,]+ · 經驗 [\d,]+ · 刷怪點 \d+ 個/.test(card.info)), before?.cards);
  const drops = await evaluate(`(() => {
    const h2 = [...document.querySelectorAll("h2")].find(h => h.textContent.trim() === ${JSON.stringify(MAP)});
    return h2?.closest("section")?.querySelectorAll('a[href^="/db/items?id="]').length ?? 0;
  })()`);
  record("怪物掉寶有列出來（連到道具頁的小標籤）", drops > 0, `${drops} 個`);
  record("沒勾組隊時，怪物卡沒有「組隊每隻」", before !== null && before.cards.length > 0 && before.cards.every(card => card.party === null));
  // 排行是頁面另外向 /api/speed/board 要的：dev 模式第一次呼叫要先編譯那支 API，最多等 1 分鐘離開「載入中」
  const boardText = `(() => { const h2 = [...document.querySelectorAll("h2")].find(h => h.textContent.trim() === "這張圖的實測排行"); return h2 ? h2.closest("section").innerText : null; })()`;
  await ev(`return await __waitFor(() => { const text = ${boardText}; return text !== null && !text.includes("載入中"); }, 60000)`);
  const board = await evaluate(boardText);
  const boardRows = await evaluate(`[...document.querySelectorAll("h2")].find(h => h.textContent.trim() === "這張圖的實測排行")?.closest("section").querySelectorAll("ol li").length ?? 0`);
  // 本機沒有 DATABASE_URL：排行寫「排行還沒開」；有資料庫時是名單或「還沒有人練滿 10 分鐘」。卡在「載入中」或「連不上」都算沒過
  record(
    "「這張圖的實測排行」出現，寫「排行還沒開」（有資料庫時是名單或「還沒有人練滿 10 分鐘」），不是卡在載入中或連不上",
    board !== null && (/排行還沒開|還沒有人練滿 10 分鐘/.test(board) || boardRows > 0) && !/載入中|暫時連不上/.test(board),
    board?.replace(/\n+/g, " / ").slice(0, 160),
  );

  // 5. 組隊：玩家自己填。勾組隊、填一個 Lv.44 隊友、打怪的人留在「你」
  const ticked = await click(`[...document.querySelectorAll("label")].find(l => l.textContent.trim() === "組隊")?.querySelector("input")`);
  const mateInput = `document.querySelector('input[aria-label="第 1 個隊友的等級"]')`;
  const rowShown = await ev(`return await __waitFor(() => Boolean(${mateInput}), 5000)`);
  record("勾「組隊」後出現一格隊友等級", ticked && rowShown);
  await click(mateInput);
  await page.send("Input.insertText", { text: String(MATE) });
  await pressEnter(); // 打完按 Enter 才存（離開欄位也會存）
  // 「組隊每隻：你 +47（打）、Lv.44 +30」：打怪的人（你）拿的要比隊友多（多拿 20%）
  const partyLine = new RegExp(`^組隊每隻：你 \\+([\\d,]+)（打）、Lv\\.${MATE} \\+([\\d,]+)$`);
  const partyShares = line => {
    const hit = partyLine.exec(line ?? "");
    return hit ? { hitter: Number(hit[1].replace(/,/g, "")), mate: Number(hit[2].replace(/,/g, "")) } : null;
  };
  const withParty = await ev(`return await __waitFor(() => { const h2 = [...document.querySelectorAll("h2")].find(h => h.textContent.trim() === ${JSON.stringify(MAP)}); return Boolean(h2?.closest("section")?.innerText.includes("組隊每隻")); }, 8000)`);
  const after = await monsterCards();
  const saved = JSON.parse(await evaluate(`localStorage.getItem("ms-speed")`));
  const hitterOnMe = await evaluate(`document.querySelector('input[type="radio"][aria-label="你是打怪的人"]')?.checked ?? null`);
  record("「打怪的人」選在「你」", hitterOnMe === true);
  record(
    `勾組隊、填 Lv.${MATE} 隊友後，每張怪物卡都有「組隊每隻」那行（你、Lv.${MATE} 各拿多少）`,
    withParty && after !== null && after.cards.length > 0 && after.cards.every(card => partyShares(card.party) !== null),
    after?.cards.map(card => `${card.name}：${card.party}`),
  );
  record(
    "每張怪物卡上，打怪的人（你）拿的比隊友多",
    after !== null &&
      after.cards.length > 0 &&
      after.cards.every(card => {
        const shares = partyShares(card.party);
        return shares !== null && shares.hitter > shares.mate;
      }),
  );
  // 頁面上這段字：「組隊經驗照玩家整理的公式算（…），台服沒驗證；沒算祈禱、經驗卷。」
  record("面板最下面寫了「照玩家整理的公式算」、「台服沒驗證」", /照玩家整理的公式算/.test(after?.sectionText ?? "") && /台服沒驗證/.test(after?.sectionText ?? ""));
  record(`組隊設定存進這台電腦（ms-speed 的 party：on、隊友 ${MATE}、打怪的人是自己）`, saved.party?.on === true && JSON.stringify(saved.party.others) === `[${MATE}]` && saved.party.hitter === 0, saved.party);
  record(`頁面上寫「組隊 2 人」`, (await bodyText()).includes("· 組隊 2 人"));

  // 6. 同一張畫面放滿 60 秒：地圖不能變、不能再問「你在哪張圖？」（守住小地圖的長相不隨時間飄）
  const samples = [];
  while (Date.now() - tMap < STATIONARY_MS) {
    await sleep(Math.min(10000, Math.max(0, STATIONARY_MS - (Date.now() - tMap))));
    samples.push({
      s: Math.round((Date.now() - tMap) / 1000),
      ...(await mapState()),
      status: await evaluate(`document.querySelector('[role="status"]')?.textContent.trim() ?? null`),
      stopButton: await evaluate(`Boolean(${BUTTON("停止分享")})`),
    });
  }
  const watch = await evaluate("window.__watch");
  const finalText = await bodyText();
  results.stationary = { watch, samples: samples.map(({ s, titles, asking, status, stopButton }) => ({ s, map: titles.includes(MAP), asking, status, stopButton })) };
  record(`同一張畫面 ${Math.round((Date.now() - tMap) / 1000)} 秒：地圖面板一直是「${MAP}」、沒有再問「你在哪張圖？」`, watch.reprompt === 0 && watch.lostMap === 0 && samples.every(s => s.titles.includes(MAP) && !s.asking), watch);
  // 畫面上讀到的字（Lv.46 …）在分享停了之後還留著，光看那行抓不到「停了」：每一次取樣都要看狀態列跟「停止分享」那顆
  record(
    "同一段時間：每一次取樣，狀態列都是還在讀的字（不是「分享停了」「認不到遊戲畫面」），「停止分享」那顆一直在",
    watch.stopped === 0 && samples.length > 0 && samples.every(sample => sample.stopButton && ACTIVE_STATUS.test(sample.status ?? "") && !STOPPED_STATUS.test(sample.status ?? "")),
    { stopped: watch.stopped, lastStatus: watch.lastStatus, statuses: [...new Set(samples.map(sample => sample.status))] },
  );
  record("放了這麼久，等級、經驗還讀得到", finalText.includes(READING));

  // 7. 整頁截圖
  await fullShot("speed.png");
  results.screenshot = path.join(OUT, "speed.png");

  // 8. 點選過的地圖有記住：重新整理、再分享一次，不問就直接認成這張圖（只有玩家點過才有這步）
  if (!auto) {
    const memory = await evaluate(`localStorage.getItem("ms-speed-maps")`);
    record("點選的長相存進這台電腦", memory !== null && Object.values(JSON.parse(memory)).length > 0, memory);
    const reloaded = await openSpeed();
    record("重新整理後載好，角色卡還寫「" + CHAR_LINE + "」", reloaded && (await bodyText()).includes(CHAR_LINE));
    await installFakeStream();
    await shareAndRead();
    const remembered = await ev(`return await __waitFor(() => [...document.querySelectorAll("h2")].some(h => h.textContent.trim() === ${JSON.stringify(MAP)}), 15000)`);
    const again = await mapState();
    record("重新整理再分享：直接認成這張圖，不再問", remembered && !again.asking, again.titles);
  }
} catch (error) {
  crashed = error;
  record("腳本跑到一半出錯", false, String(error?.stack ?? error).slice(0, 600));
  try {
    await shot("crash.png");
  } catch {}
} finally {
  try {
    results.problems = problems;
    // 沒接住的例外、console.error 都算沒過：寫在最後，這樣 results.json 一定寫得出去
    const clean = problems.exceptions.length === 0 && problems.errors.length === 0;
    if (!crashed) record("整趟沒有沒接住的例外、console.error", clean, clean ? `${problems.warnings.length} 則警告（存在 results.json）` : { exceptions: problems.exceptions, errors: problems.errors });
    results.failedChecks = results.checks.filter(check => !check.ok).map(check => check.name);
    results.summary = `${results.checks.length - results.failedChecks.length}/${results.checks.length} 項通過`;
    fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(results, null, 2));
  } finally {
    // 不管上面怎麼了，Chrome 一定收掉（harness 的 close 最多等 2 秒，再 taskkill）
    if (close) {
      try {
        await close();
      } catch {}
    }
  }
}
console.log(`輸出：${OUT}`);
console.log(results.summary);
process.exit(results.failedChecks.length > 0 ? 1 : 0);
