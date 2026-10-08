// 帶 # 的網址（懶人包 #pq-moon）：從連結第一次點進來要捲到錨點；往下捲、點站內連結離開，再按返回／下一頁，要回到離開時的位置（v0.77）
// 用法：node scripts/verify/hash-back.mjs <輸出資料夾> <網址> [port]
// 做法：手機 375×812。角色 15 等劍士，從首頁「看打法」（站內連結 /guide#pq-moon）點進來，量停的位置＝錨點（扣掉 scroll-margin-top）；
// 捲到可捲高度 70% → 點頁尾「關於」→ 按返回。按返回這段用 screencast 收真的畫出來的每一格（metadata.scrollOffsetY），
// 要停在離開時的位置，而且沒有任何一格畫在錨點上（Chrome 會先捲到錨點，要在畫面出來前跳回去）。
// 接著按下一頁到關於、再按返回，一樣檢查。對照組：不帶 # 的 /guide 同樣操作（瀏覽器自己還原得回去）。
// 不論結果都 exit 0，最後一行印總數。
import fs from "node:fs";
import path from "node:path";
import { chromePort, outDir } from "./config.mjs";
import { sleep, start } from "./harness.mjs";

const OUT = outDir(process.argv[2], "hash-back");
const BASE = (process.argv[3] ?? "http://localhost:3047").replace(/\/$/, "");
const PORT = chromePort(9373, process.argv[4]);

const b = await start(OUT, PORT, ["--disable-features=BackForwardCache"]);
let frames = null;
b.page.listeners.add(m => {
  if (m.method !== "Page.screencastFrame") return;
  const { sessionId, metadata, data } = m.params;
  b.page.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
  if (frames) frames.push({ y: Math.round(metadata.scrollOffsetY), data });
});

/** 錨點該停的位置：元素頂端扣掉 scroll-margin-top（頁首高度） */
const ANCHOR = `(() => { const el = document.getElementById("pq-moon"); if (!el) return null;
  return Math.round(el.getBoundingClientRect().top + scrollY - parseFloat(getComputedStyle(el).scrollMarginTop || "0")); })()`;

/** 點頁面裡的站內連結，等網址換到 pathname */
const clickLink = (selector, pathname) =>
  b.ev(`const link = document.querySelector(${JSON.stringify(selector)}); if (!link) return false; link.click();
    return await __waitFor(() => location.pathname === ${JSON.stringify(pathname)}, 10000);`);

/** 按返回／下一頁，收這段畫出來的每一格 */
async function traverseFilmed(delta, tag) {
  frames = [];
  await b.page.send("Page.startScreencast", { format: "jpeg", quality: 40, everyNthFrame: 1 });
  await b.traverse(delta);
  await sleep(2500);
  await b.page.send("Page.stopScreencast");
  const got = frames;
  frames = null;
  const dir = path.join(OUT, tag);
  fs.mkdirSync(dir, { recursive: true });
  got.forEach((f, i) => {
    if (i < 60 && (i === 0 || f.y !== got[i - 1].y)) fs.writeFileSync(path.join(dir, `${String(i).padStart(3, "0")}-y${f.y}.jpg`), Buffer.from(f.data, "base64"));
  });
  return got;
}

const results = [];
function report(row) {
  results.push(row);
  console.log(row.text);
}

/** 離開（點關於）再按返回：停在離開時的位置、沒有一格畫在錨點 */
async function leaveAndBack(name, anchorY) {
  const left = await b.ev(`window.scrollTo({ top: Math.round((document.documentElement.scrollHeight - innerHeight) * 0.7), behavior: "instant" });
    await __sleep(800); await __settle(3000); return Math.round(scrollY);`);
  if (!(await clickLink(`a[href="/about"]`, "/about"))) throw new Error(`${name}：找不到「關於」連結`);
  await sleep(1200);
  for (const [step, moves] of [["按返回", [-1]], ["下一頁再返回", [1, -1]]]) {
    let got = [];
    for (const delta of moves) {
      if (delta > 0) {
        await b.traverse(delta);
        await sleep(1500);
      } else got = await traverseFilmed(delta, `${name}-${step}`);
    }
    const stop = await b.evaluate(`Math.round(scrollY)`);
    const onAnchor = anchorY === null ? 0 : got.filter(f => Math.abs(f.y - anchorY) <= 2).length;
    const seq = got.filter((f, i) => i === 0 || f.y !== got[i - 1].y).map(f => f.y);
    const ok = Math.abs(stop - left) <= 2 && onAnchor === 0;
    report({
      name, step, left, stop, anchorY, painted: got.length, onAnchor, seq, ok,
      text: `${name}｜${step}｜離開 ${left} → 停 ${stop}｜畫出 ${got.length} 格，經過的位置 ${JSON.stringify(seq.slice(0, 12))}` +
        `${anchorY === null ? "" : `，畫在錨點 ${anchorY} 的 ${onAnchor} 格`}｜${ok ? "對" : "不對"}`,
    });
  }
}

try {
  await b.page.send("Emulation.setDeviceMetricsOverride", { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
  await b.navigate(BASE + "/about");
  // 15 等劍士：首頁「現在去這裡」是月妙組隊任務，有「看打法」
  await b.evaluate(`localStorage.setItem("ms-profile", JSON.stringify({ level: 15, job: 100 })); localStorage.setItem("ms-theme", "light"); "ok"`);

  // 一、從首頁「看打法」點進來
  await b.navigate("about:blank");
  await b.navigate(BASE + "/");
  const found = await b.ev(`return await __waitFor(() => Boolean(document.querySelector('a[href="/guide#pq-moon"]')), 20000);`);
  if (!found) throw new Error("首頁找不到「看打法」（/guide#pq-moon）");
  if (!(await clickLink(`a[href="/guide#pq-moon"]`, "/guide"))) throw new Error("點了看打法沒換到懶人包");
  const arrive = await b.ev(`await __waitFor(() => document.getElementById("pq-moon"), 15000); await __settle(3000); await __sleep(500);
    return { y: Math.round(scrollY), anchor: ${ANCHOR}, hash: location.hash };`);
  report({
    name: "看打法", step: "第一次點進來", ...arrive, ok: arrive.hash === "#pq-moon" && Math.abs(arrive.y - arrive.anchor) <= 2,
    text: `看打法｜第一次點進來｜網址 ${arrive.hash}｜停 ${arrive.y}，錨點 ${arrive.anchor}｜${Math.abs(arrive.y - arrive.anchor) <= 2 ? "停在錨點" : "沒停在錨點"}`,
  });
  await leaveAndBack("看打法 #pq-moon", arrive.anchor);

  // 二、對照：不帶 # 的懶人包
  await b.navigate("about:blank");
  await b.navigate(BASE + "/guide");
  await b.ev(`await __waitFor(() => document.getElementById("pq-moon"), 15000); await __settle(3000); return true;`);
  await leaveAndBack("不帶 # 的 /guide", null);
} catch (error) {
  results.push({ error: String(error?.stack ?? error).slice(0, 800) });
  console.log(String(error?.stack ?? error).slice(0, 800));
} finally {
  fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(results, null, 2));
  await b.close();
}
const rows = results.filter(row => row.name);
console.log(`總共 ${rows.length} 項：對 ${rows.filter(row => row.ok).length}、不對 ${rows.filter(row => !row.ok).length}${results.some(row => row.error) ? "、中途出錯" : ""}`);
console.log(`結果：${path.join(OUT, "results.json")}`);
process.exit(0);
