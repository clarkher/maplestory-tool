// 展開過的卡片：重新整理、離站再返回、站內按返回之後，展開還在不在、畫面停在不在同一段內容（v0.59）
// 用法：node scripts/verify/reload-open.mjs <輸出資料夾> <網址> [port] [情境,情境…]
//   情境：home, quest, train, bundle, go, guide（沒給就全跑），每個情境跑「重新整理／離站再返回／站內按返回」三種
// 做法：手機 375×812、關返回快取（離站再返回一定整頁重載）。每一種都先從別頁點進來（新的一筆瀏覽紀錄），
// 記下「剛進來時開著幾個」（應該是預設），再像使用者一樣點開幾張卡、捲到可捲高度 70% 的地方，
// 記下畫面上兩個固定點（頁首下方 y=90、畫面中間 y=420）是哪一塊、離畫面頂端幾 px；
// 離開又回來、等內容畫完，再看同樣兩個點：同一塊、差 2px 內才算「同一段」。
// 環境變數 WAIT：回來之後等幾毫秒再量（預設 5000）。
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

/** 每個情境：哪一頁、等什麼出現、點開哪些（每一步回傳點到的按鈕字，點不到是 null） */
const SCENARIOS = {
  home: {
    path: "/",
    ready: `document.querySelector('section[aria-label="升級路線"] ol li')`,
    steps: [
      `__click('section[aria-label="先解"] > button', "^還有 \\\\d+ 個任務$")`,
      `__click('section[aria-label="先解"] button', "^看細節$", 1)`,
      `__click('section[aria-label="技能怎麼點"] > button', ".")`,
      `__click('section[aria-label="能力值與裝備"] button', "^看全部$")`,
      // 升級路線：點開第一段（你在的那段以前的，內容插在上面）
      `__click('section[aria-label="升級路線"] ol > li > div > button[aria-expanded="false"]', ".")`,
    ],
  },
  quest: {
    path: "/plan/quest",
    ready: `[...document.querySelectorAll("button")].some(b => b.textContent.includes("看細節"))`,
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
    steps: [`__click("li button", "^看全部怪與小地圖$", 0)`, `__click("li button", "^看全部怪與小地圖$", 0)`],
  },
  bundle: {
    path: "/plan/bundle",
    ready: `[...document.querySelectorAll("button")].some(b => /^看是哪 \\d+ 個任務$/.test(b.textContent.trim()))`,
    steps: [0, 0, 0].map(nth => `__click("li button", "^看是哪 \\\\d+ 個任務$", ${nth})`),
  },
  go: {
    // 從最近的城鎮走到深處的螞蟻洞：一路好幾張圖都有小地圖
    path: "/go?to=105070000",
    ready: `[...document.querySelectorAll("button")].some(b => b.textContent.includes("看小地圖"))`,
    steps: [0, 0, 0].map(nth => `__click("li button", "^看小地圖$", ${nth})`),
  },
  guide: {
    path: "/guide",
    ready: `document.querySelector('section[aria-label="路線"] ol > li > button')`,
    steps: [
      // 第一步預設開著：收起來；第二、三步（月妙圖解）點開
      `__click('section[aria-label="路線"] ol > li > button', ".", 0)`,
      `__click('section[aria-label="路線"] ol > li > button', ".", 1)`,
      `__click('section[aria-label="路線"] ol > li > button', ".", 2)`,
    ],
  },
};

const KINDS = { reload: "重新整理", away: "離站再返回", inner: "站內按返回" };
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

try {
  await b.page.send("Emulation.setDeviceMetricsOverride", { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
  await b.navigate(BASE + "/about");
  await b.evaluate(`localStorage.setItem("ms-profile", JSON.stringify({ level: 45, job: 110 })); localStorage.setItem("ms-theme", "light"); "ok"`);
  for (const [name, scenario] of Object.entries(SCENARIOS)) {
    if (ONLY && !ONLY.includes(name)) continue;
    for (const [kind, kindText] of Object.entries(KINDS)) {
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
      } else {
        // 點頁首的「關於」（站內換頁），再按瀏覽器的返回
        const went = await ev(`const link = document.querySelector('header a[href="/about"], a[href="/about"]'); if (!link) return false; link.click(); return await __waitFor(() => location.pathname === "/about", 10000);`);
        if (!went) throw new Error(`${tag}：找不到「關於」連結`);
        await sleep(1200);
        await b.traverse(-1);
        await sleep(2500);
      }

      const after = await ev(`await __waitFor(() => Boolean(${scenario.ready}), 15000); return { y: Math.round(scrollY), h: document.documentElement.scrollHeight, opened: __opened(), probe: __probe() };`);
      await b.shot(`${tag}-2-after.png`);
      const same = before.probe.map((point, index) => {
        const back = after.probe[index];
        return point.el !== null && point.el === back.el && point.block === back.block && Math.abs(point.top - back.top) <= 2;
      });
      const row = { name, kind, path: scenario.path, ready, fresh, clicked, before, after, same, ok: same.every(Boolean) && before.opened === after.opened };
      results.push(row);
      const delta = (index) => (after.probe[index].top ?? 0) - (before.probe[index].top ?? 0);
      console.log(
        `${scenario.path}｜${kindText}｜剛進來開著 ${fresh}｜點開 ${clicked.filter(Boolean).length}/${clicked.length}` +
          `｜離開 ${before.y}（頁高 ${before.h}，開著 ${before.opened}）→ 停 ${after.y}（頁高 ${after.h}，開著 ${after.opened}）` +
          `｜頂端 ${same[0] ? "同一塊" : "不同"} Δ${delta(0)}px｜中間 ${same[1] ? "同一塊" : "不同"} Δ${delta(1)}px｜${row.ok ? "同一段" : "對不上"}`,
      );
      if (!row.ok) {
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
console.log(`結果：${path.join(OUT, "results.json")}`);
process.exit(0);
