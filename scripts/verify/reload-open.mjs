// 展開過的卡片：重新整理、離站再返回、站內按返回之後，展開還在不在、畫面停在不在同一段內容（v0.59）
// 用法：node scripts/verify/reload-open.mjs <輸出資料夾> <網址> [port] [情境,情境…]
//   情境：home, quest, train, bundle, go, guide, guide-pq（沒給就全跑）
//   每個情境跑四種：重新整理、離站再返回、站內按返回（點「關於」再按返回）、站內重新點進來（點「查資料」再點回這一頁）
// 做法：手機 375×812、關返回快取（離站再返回一定整頁重載）。每一種都先從別頁點進來（新的一筆瀏覽紀錄），
// 記下「剛進來時開著幾個」，要等於這一頁的預設；再像使用者一樣點開幾張卡、捲到可捲高度 70% 的地方，
// 記下畫面上兩個固定點（頁首下方 y=90、畫面中間 y=420）是哪一塊、離畫面頂端幾 px；
// 離開又回來、等內容畫完，再看同樣兩個點：同一塊、差 2px 內、開著的數量一樣，才算「同一段」。
// 站內重新點進來是新的一筆紀錄：開著的數量要回到預設（從選單重新點進來不套上一次的展開）。
// 不論結果都 exit 0，最後一行印總數。環境變數 WAIT：回來之後等幾毫秒再量（預設 5000）。
import fs from "node:fs";
import path from "node:path";
import { chromePort, outDir } from "./config.mjs";
import { sleep, start } from "./harness.mjs";

const OUT = outDir(process.argv[2], "reload-open");
const BASE = (process.argv[3] ?? "http://localhost:3047").replace(/\/$/, "");
const PORT = chromePort(9363, process.argv[4]);
const ONLY = process.argv[5]?.split(",");
const WAIT = Number(process.env.WAIT ?? 5000);

// 頁面裡用的小工具：照文字找按鈕來點（跟使用者一樣用 click）、量兩個固定點上是哪一塊
const TOOLS = `
  window.__click = (selector, pattern, nth = 0) => {
    const re = new RegExp(pattern);
    const hit = [...document.querySelectorAll(selector)].filter(el => re.test(el.textContent.trim()))[nth];
    if (!hit) return null;
    hit.click();
    return hit.textContent.trim().replace(/\\s+/g, " ").slice(0, 24);
  };
  window.__probe = () => [90, 420].map(y => {
    const el = document.elementFromPoint(187, y);
    if (!el) return { y, el: null };
    const label = node => (node.innerText || node.getAttribute?.("alt") || node.getAttribute?.("src") || "").trim().replace(/\\s+/g, " ").slice(0, 40);
    const block = el.closest("li, article, section, figure, header") ?? el;
    return {
      y,
      el: el.tagName.toLowerCase() + "|" + label(el),
      top: Math.round(el.getBoundingClientRect().top),
      block: block.tagName.toLowerCase() + "|" + label(block),
    };
  });
  window.__opened = () => document.querySelectorAll('[aria-expanded="true"]').length;
`;

const TODO = `section[aria-label="先解"]`;
const ROUTE = `section[aria-label="升級路線"]`;
const STEPS = `section[aria-label="路線"] ol > li > button`;

/**
 * 每個情境：哪一頁、等什麼出現、剛進來預設開著幾個（fresh）、點開哪些（每一步回傳點到的按鈕字，點不到是 null）、
 * 站內重新點進來時在「查資料」頁點哪個連結（沒有連結的不跑那一種）
 */
const SCENARIOS = {
  home: {
    path: "/",
    ready: `document.querySelector('${ROUTE} ol li')`,
    fresh: 1, // 升級路線你在的那段
    relink: `a[href="/"]`,
    steps: [
      `__click('${TODO} > button', "^還有 \\\\d+ 個任務$")`,
      // 第一列（長任務線）看細節 → 還有 N 段 → 點開第 3 段
      `__click('${TODO} button', "^看細節$", 0)`,
      `__click('${TODO} button', "^還有 \\\\d+ 段$")`,
      `__click('${TODO} li li button', "^第 ", 2)`,
      `__click('${TODO} button', "^為什麼要解$", 0)`,
      // 第一列的按鈕已經變「收起細節」：這次點到的是第二列
      `__click('${TODO} button', "^看細節$", 0)`,
      `__click('section[aria-label="技能怎麼點"] > button', ".")`,
      `__click('section[aria-label="能力值與裝備"] button', "^看全部$")`,
      `__click('article[aria-label="現在去這裡"] button', "^展開$")`,
      // 你在的那段（預設開著）裡的「為什麼」「玩家推薦・為什麼」
      `__click('${ROUTE} li button', "為什麼$")`,
      `__click('${ROUTE} li button', "^玩家推薦・為什麼$")`,
      // 升級路線第一段（你在的那段以前的，內容插在上面）
      `__click('${ROUTE} ol > li > div > button[aria-expanded="false"]', ".")`,
    ],
  },
  quest: {
    path: "/plan/quest",
    ready: `[...document.querySelectorAll("button")].some(b => b.textContent.includes("看細節"))`,
    fresh: 0,
    relink: `a[href="/plan/quest"]`,
    steps: [
      `__click("button", "^連卡住的一起看$")`,
      `__click("li button", "^看細節$", 0)`,
      `__click("li button", "^看細節$", 1)`,
      `__click("li button", "^看細節$", 2)`,
    ],
  },
  train: {
    path: "/plan/train",
    ready: `[...document.querySelectorAll("button")].some(b => b.textContent.includes("看全部怪與小地圖"))`,
    fresh: 0,
    relink: `a[href="/plan/train"]`,
    steps: [`__click("li button", "^看全部怪與小地圖$", 0)`, `__click("li button", "^看全部怪與小地圖$", 0)`],
  },
  bundle: {
    path: "/plan/bundle",
    ready: `[...document.querySelectorAll("button")].some(b => /^看是哪 \\d+ 個任務$/.test(b.textContent.trim()))`,
    fresh: 0,
    relink: `a[href="/plan/bundle"]`,
    steps: [0, 0, 0].map(nth => `__click("li button", "^看是哪 \\\\d+ 個任務$", ${nth})`),
  },
  go: {
    // 從最近的城鎮走到深處的螞蟻洞：一路好幾張圖都有小地圖（查資料頁沒有連到這條路線，不跑站內重新點進來）
    path: "/go?to=105070000",
    ready: `[...document.querySelectorAll("button")].some(b => b.textContent.includes("看小地圖"))`,
    fresh: 0,
    steps: [0, 0, 0].map(nth => `__click("li button", "^看小地圖$", ${nth})`),
  },
  guide: {
    path: "/guide",
    ready: `document.querySelector('${STEPS}')`,
    fresh: 1, // 第一步
    relink: `a[href="/guide"]`,
    steps: [
      // 第一步預設開著：收起來；第二、三步（月妙圖解）點開
      `__click('${STEPS}', ".", 0)`,
      `__click('${STEPS}', ".", 1)`,
      `__click('${STEPS}', ".", 2)`,
    ],
  },
  "guide-pq": {
    // 首頁「看打法」帶 #pq-moon 進來：月妙那步自動展開；收起來之後重新整理、返回，要保持收起（網址的 # 還在）
    path: "/guide#pq-moon",
    ready: `document.querySelector('li#pq-moon > button')`,
    fresh: 2, // 第一步＋月妙
    steps: [`__click('li#pq-moon > button', ".")`],
  },
};

const KINDS = { reload: "重新整理", away: "離站再返回", inner: "站內按返回", relink: "站內重新點進來" };
const results = [];
const b = await start(OUT, PORT, ["--disable-features=BackForwardCache"]);
const ev = body => b.ev(`${TOOLS} ${body}`);

/** 等這一頁真的載完：harness 的 navigate 最多等 8 秒就放手，慢的頁那時可能還在換文件（document 一瞬間是空的，量了會出錯） */
async function pageLoaded() {
  for (let i = 0; i < 80; i += 1) {
    try {
      if (await b.evaluate(`document.readyState === "complete" && Boolean(document.documentElement)`)) return;
    } catch {
      // 正在換文件：執行環境不見了，等一下再問
    }
    await sleep(250);
  }
}

/** 在頁面裡點一個站內連結，等網址換到 pathname（Next 站內換頁，不是整頁載入） */
async function clickLink(selector, pathname) {
  return ev(`const link = document.querySelector(${JSON.stringify(selector)}); if (!link) return false; link.click();
    return await __waitFor(() => location.pathname === ${JSON.stringify(pathname)}, 10000);`);
}

try {
  await b.page.send("Emulation.setDeviceMetricsOverride", { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
  await b.navigate(BASE + "/about");
  await b.evaluate(`localStorage.setItem("ms-profile", JSON.stringify({ level: 45, job: 110 })); localStorage.setItem("ms-theme", "light"); "ok"`);
  for (const [name, scenario] of Object.entries(SCENARIOS)) {
    if (ONLY && !ONLY.includes(name)) continue;
    const pathname = scenario.path.split(/[?#]/)[0];
    for (const [kind, kindText] of Object.entries(KINDS)) {
      if (kind === "relink" && !scenario.relink) continue;
      // 從別頁點進來：新的一筆瀏覽紀錄（同一個網址直接再開一次，Chrome 會當成取代同一筆）
      await b.navigate("about:blank");
      await b.navigate(BASE + scenario.path);
      await pageLoaded();
      const ready = await ev(`return await __waitFor(() => Boolean(${scenario.ready}), 20000);`);
      const fresh = await ev(`await __settle(); return __opened();`);
      const clicked = [];
      for (const step of scenario.steps) {
        clicked.push(await ev(`const hit = ${step}; await __sleep(400); await __settle(3000); return hit;`));
      }
      const before = await ev(`
        window.scrollTo({ top: Math.round((document.documentElement.scrollHeight - innerHeight) * 0.7), behavior: "instant" });
        await __sleep(800); await __settle(3000);
        return { y: Math.round(scrollY), h: document.documentElement.scrollHeight, opened: __opened(), probe: __probe() };`);
      const tag = `${name}-${kind}`;
      await b.shot(`${tag}-1-before.png`);

      if (kind === "reload") {
        const loaded = b.loadOnce();
        await b.page.send("Page.reload");
        await loaded;
        await pageLoaded();
        await sleep(WAIT);
      } else if (kind === "away") {
        await b.navigate("about:blank");
        await sleep(300);
        const loaded = b.loadOnce();
        await b.traverse(-1);
        await loaded;
        await pageLoaded();
        await sleep(WAIT);
      } else if (kind === "inner") {
        // 點頁尾的「資料從哪來」（/about，站內換頁），再按瀏覽器的返回
        if (!(await clickLink(`a[href="/about"]`, "/about"))) throw new Error(`${tag}：找不到「關於」連結`);
        await sleep(1200);
        await b.traverse(-1);
        await sleep(2500);
      } else {
        // 點頁首的「查資料」，再從查資料頁點回這一頁：站內換頁，新的一筆紀錄
        if (!(await clickLink(`a[href="/db"]`, "/db"))) throw new Error(`${tag}：找不到「查資料」連結`);
        await sleep(1200);
        if (!(await clickLink(scenario.relink, pathname))) throw new Error(`${tag}：查資料頁找不到 ${scenario.relink}`);
        await sleep(2500);
      }

      const after = await ev(`await __waitFor(() => Boolean(${scenario.ready}), 15000); await __settle(3000);
        return { y: Math.round(scrollY), h: document.documentElement.scrollHeight, opened: __opened(), probe: __probe() };`);
      await b.shot(`${tag}-2-after.png`);
      const same = before.probe.map((point, index) => {
        const back = after.probe[index];
        return point.el !== null && point.el === back.el && point.block === back.block && Math.abs(point.top - back.top) <= 2;
      });
      const freshOk = fresh === scenario.fresh;
      // 站內重新點進來：新的一筆紀錄，要回到預設；其他三種：要停在同一段、開著的一樣多
      const ok = kind === "relink" ? freshOk && after.opened === scenario.fresh : freshOk && same.every(Boolean) && before.opened === after.opened;
      const row = { name, kind, path: scenario.path, ready, fresh, freshOk, clicked, before, after, same, ok };
      results.push(row);
      const delta = index => (after.probe[index].top ?? 0) - (before.probe[index].top ?? 0);
      const head = `${scenario.path}｜${kindText}｜剛進來開著 ${fresh}${freshOk ? "" : `（預設該是 ${scenario.fresh}）`}｜點開 ${clicked.filter(Boolean).length}/${clicked.length}`;
      const tail =
        kind === "relink"
          ? `｜回來開著 ${after.opened}（預設 ${scenario.fresh}）、位置 ${after.y}｜${ok ? "照預設" : "不是預設"}`
          : `｜離開 ${before.y}（頁高 ${before.h}，開著 ${before.opened}）→ 停 ${after.y}（頁高 ${after.h}，開著 ${after.opened}）` +
            `｜頂端 ${same[0] ? "同一塊" : "不同"} Δ${delta(0)}px｜中間 ${same[1] ? "同一塊" : "不同"} Δ${delta(1)}px｜${ok ? "同一段" : "對不上"}`;
      console.log(head + tail);
      if (!ok && kind !== "relink") {
        console.log(`   離開時：${before.probe.map(p => p.block).join(" ／ ")}`);
        console.log(`   回來後：${after.probe.map(p => p.block).join(" ／ ")}`);
      }
    }
  }
} catch (error) {
  results.push({ error: String(error?.stack ?? error).slice(0, 800) });
  console.log(String(error?.stack ?? error).slice(0, 800));
} finally {
  fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(results, null, 2));
  await b.close();
}
const rows = results.filter(row => row.kind);
console.log(`總共 ${rows.length} 種：通過 ${rows.filter(row => row.ok).length}、沒過 ${rows.filter(row => !row.ok).length}${results.some(row => row.error) ? "、中途出錯" : ""}`);
console.log(`結果：${path.join(OUT, "results.json")}`);
process.exit(0);
