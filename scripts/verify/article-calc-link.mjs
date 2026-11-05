// 攻略文表下的連結真的點一次：計算機開的職業、武器、招式要跟表一樣，重新整理一樣，按導覽列回玩家自己的角色（v1.44，埠 9395）。
// 用法：node scripts/verify/article-calc-link.mjs [網址，預設 http://localhost:9485] [輸出] [DevTools 埠，預設 9395]
// 沒過 exit 1。Cloudflare 靜態輸出（out/）或 dev server 都能量。
import fs from "node:fs";
import path from "node:path";
import { start, sleep } from "./harness.mjs";
import { chromePort, outDir } from "./config.mjs";

const BASE = process.argv[2] ?? "http://localhost:9485";
const OUT = outDir(process.argv[3], "article-calc-link");
const LINK_TEXT = "開計算機改成自己的數值";
const ROGUE_35 = JSON.stringify({ level: 35, job: 410 }); // 存好的角色：刺客 Lv.35

// 這幾篇的表用哪把、哪一招（改文章的武器要跟著改）
const CASES = [
  { path: "/guides/berserker-31-50", job: 110, weapon: "鋼鐵劍", skill: "魔天一擊" },
  { path: "/guides/priest-31-50", job: 230, weapon: "黃色雨傘", skill: "群體治癒" },
  { path: "/guides/hunter-31-50", job: 310, weapon: "戰鬥弓", skill: "二連箭" },
  { path: "/guides/assassin-31-50", job: 410, weapon: "鋰礦鬥拳", skill: "雙飛斬" },
  { path: "/guides/bandit-31-50", job: 420, weapon: "水晶刃", skill: "迴旋斬" },
];

const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "過" : "沒過"}  ${name}${detail ? `  ${detail}` : ""}`);
};

const { evaluate, navigate, ev, shot, close } = await start(OUT, chromePort(9395, process.argv[4]));
// 畫面上選到什麼：每個下拉選單選中的字＋整頁文字
const READ = `(() => ({
  url: location.pathname + location.search,
  selected: [...document.querySelectorAll("select")].map(el => el.selectedOptions[0]?.textContent ?? ""),
  pressed: [...document.querySelectorAll('button[aria-pressed="true"]')].map(el => el.textContent ?? ""),
  text: document.body.innerText,
}))()`;
const shows = (state, word) => state.selected.some(text => text.includes(word)) || state.pressed.some(text => text.includes(word)) || state.text.includes(word);
const waitCalc = () => ev(`await __waitFor(() => location.pathname.startsWith("/plan/damage") && document.querySelector("select")); await __settle(); return true;`);

try {
  for (const stored of [ROGUE_35, null]) {
    const who = stored ? "存刺客 Lv.35" : "沒存角色";
    await navigate(`${BASE}/`);
    await evaluate(stored ? `localStorage.setItem("ms-profile", ${JSON.stringify(stored)}); sessionStorage.clear()` : `localStorage.clear(); sessionStorage.clear()`);
    for (const item of CASES) {
      await evaluate(`sessionStorage.clear()`);
      await navigate(`${BASE}${item.path}`);
      const clicked = await ev(`
        await __waitFor(() => [...document.querySelectorAll("a")].some(el => el.textContent.includes(${JSON.stringify(LINK_TEXT)})));
        const link = [...document.querySelectorAll("a")].find(el => el.textContent.includes(${JSON.stringify(LINK_TEXT)}));
        if (!link) return null;
        const href = link.getAttribute("href");
        link.click();
        return href;
      `);
      check(`${who} ${item.path} 有連結`, Boolean(clicked), clicked ?? "");
      if (!clicked) continue;
      await waitCalc();
      const first = await evaluate(READ);
      check(`${who} ${item.path} 點連結到帶參數的計算機`, first.url.startsWith("/plan/damage?") && first.url.includes(`job=${item.job}`), first.url);
      check(`${who} ${item.path} 武器 ${item.weapon}`, shows(first, item.weapon), first.selected.join("／"));
      check(`${who} ${item.path} 招式 ${item.skill}`, shows(first, item.skill));
      await shot(`${item.job}-${stored ? "stored" : "empty"}.png`);
      // 重新整理要一樣
      await navigate(`${BASE}${first.url}`);
      await waitCalc();
      const again = await evaluate(READ);
      check(`${who} ${item.path} 重新整理後一樣`, JSON.stringify(again.selected) === JSON.stringify(first.selected), again.selected.join("／"));
    }
    // 導覽列：帶參數的頁按「算傷害」要回到玩家自己（只有 768 寬以上有這顆，無頭視窗 1280 寬）
    if (stored) {
      await evaluate(`sessionStorage.clear()`);
      await navigate(`${BASE}/plan/damage?job=420&level=40`);
      await waitCalc();
      const before = await evaluate(READ);
      await ev(`[...document.querySelectorAll("header a")].find(el => el.textContent.trim() === "算傷害").click(); await __waitFor(() => !location.search); await __settle(); return true;`);
      const after = await evaluate(READ);
      check("帶參數頁按導覽列，網址拿掉參數", after.url === "/plan/damage", after.url);
      check("帶參數頁按導覽列，畫面換成存的刺客", shows(after, "刺客") && JSON.stringify(before.selected) !== JSON.stringify(after.selected), after.selected.join("／"));
      await shot("nav-back.png");
    }
  }
} finally {
  await close();
  await sleep(200);
}

fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(results, null, 2));
const failed = results.filter(row => !row.ok);
console.log(`\n${results.length - failed.length}/${results.length} 過，輸出 ${OUT}`);
process.exit(failed.length ? 1 : 0);
