// 改版整理（/updates、/updates/<版本>，v1.94）驗收：手機 375、深淺各一張整頁圖，加上版面與數字的判定；任何一項沒過 exit 1
// 用法：node scripts/verify/updates-shot.mjs [網址，預設 http://localhost:9525] [輸出資料夾] [DevTools 埠，預設 9526]
//   例：npm run build && npx next start -p 9525
//       node scripts/verify/updates-shot.mjs http://localhost:9525 "$TEMP/updates-shot"
// 期望值讀「本機」的 public/data/patches/2.0.0.json（新道具／新任務／新怪物／說明改了的道具，口徑照 src/app/updates/[version]/page.tsx）；
//   驗測試機時本機的 json 要跟那邊部署的是同一版。
// 頁面上的東西用 data-changed-rows（說明改了的道具那串列）、data-kind、role="group" aria-label="類別"、aria-pressed 找，改版面時這幾個要留著。
// 輸出：updates-list-light.png、updates-list-dark.png、updates-2.0.0-light.png、updates-2.0.0-dark.png（都是整頁）、results.json
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromePort, outDir } from "./config.mjs";
import { sleep, start } from "./harness.mjs";

const BASE = (process.argv[2] ?? "http://localhost:9525").replace(/\/$/, "");
const OUT = outDir(process.argv[3], "updates-shot");
const PORT = chromePort(9526, process.argv[4]);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PATCH = JSON.parse(fs.readFileSync(path.join(ROOT, "public/data/patches/2.0.0.json"), "utf8"));
const DISCLAIMER = "比的是更新前後的遊戲資料，不是官方公告；什麼時候開放、怎麼拿到，以遊戲內為準。";
const FIRST = 3; // 跟 ChangedRows.tsx 的 FIRST 一樣：一開始露 3 列

const results = { base: BASE, port: PORT, data: "本機 public/data/patches/2.0.0.json", checks: [] };
const record = (name, ok, detail) => {
  results.checks.push({ name, ok: Boolean(ok), ...(detail === undefined ? {} : { detail }) });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail === undefined ? "" : `  ${typeof detail === "string" ? detail : JSON.stringify(detail)}`}`);
  return Boolean(ok);
};
async function check(name, fn) {
  try {
    const [ok, detail] = await fn();
    return record(name, ok, detail);
  } catch (error) {
    return record(name, false, `中途出錯：${String(error?.message ?? error).slice(0, 300)}`);
  }
}

let page, evaluate, navigate, close;
const problems = { exceptions: [], errors: [] };
const viewport = (width, height) => page.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
const painted = () => evaluate("new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))");
async function until(expression, ms = 15000) {
  for (let t = 0; t < ms; t += 250) {
    try { if (await evaluate(`Boolean(${expression})`)) return true; } catch { /* 換頁中 */ }
    await sleep(250);
  }
  return false;
}
async function click(what, finder) {
  const at = await evaluate(`(() => { const el = (${finder}); if (!el) return null; el.scrollIntoView({ block: "center", behavior: "instant" }); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  if (!at) throw new Error(`點不到：${what}`);
  await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: at.x, y: at.y });
  await page.send("Input.dispatchMouseEvent", { type: "mousePressed", x: at.x, y: at.y, button: "left", clickCount: 1 });
  await page.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: at.x, y: at.y, button: "left", clickCount: 1 });
}
const BUTTON = text => `[...document.querySelectorAll("button")].find(b => b.textContent.trim().startsWith(${JSON.stringify(text)}))`;
const SECTION = title => `[...document.querySelectorAll("section")].find(s => s.querySelector("h2")?.textContent.trim() === ${JSON.stringify(title)})`;
const CHIPS = `[...document.querySelectorAll("[role='group'][aria-label='類別'] button")]`;

async function setScheme(scheme) {
  await page.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: scheme }] });
  await evaluate(`(() => { document.documentElement.dataset.theme = ${JSON.stringify(scheme)}; return true; })()`);
}
/** 打開頁面：先設深淺、捲過一遍讓 lazy 的圖載進來，再回頂端 */
async function open(route, scheme = "light") {
  await navigate(`${BASE}${route}`);
  if (!(await until(`document.querySelector("h1")`, 90000))) throw new Error(`等不到 h1：${route}`);
  await setScheme(scheme);
  await evaluate(`(async () => {
    document.documentElement.style.scrollBehavior = "auto";
    const h = document.documentElement.scrollHeight;
    for (let y = 0; y < h; y += 600) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 60)); }
    window.scrollTo(0, 0);
    return true;
  })()`);
  await until(`[...document.images].every(i => i.complete)`, 15000);
  await painted();
  await sleep(200);
}
async function fullShot(file) {
  const m = await page.send("Page.getLayoutMetrics");
  const height = Math.ceil(m.cssContentSize?.height ?? m.contentSize.height);
  const r = await page.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, clip: { x: 0, y: 0, width: 375, height, scale: 1 } });
  fs.writeFileSync(path.join(OUT, file), Buffer.from(r.data, "base64"));
  return file;
}
const brokenImages = () => evaluate(`[...document.images].filter(i => i.complete && i.naturalWidth === 0).map(i => i.currentSrc || i.src)`);
const hasText = text => evaluate(`document.body.innerText.includes(${JSON.stringify(text)})`);
const status = async route => (await fetch(`${BASE}${route}`)).status;

try {
  ({ page, evaluate, navigate, close } = await start(OUT, PORT));
  page.listeners.add(m => {
    if (m.method === "Runtime.exceptionThrown") problems.exceptions.push(String(m.params.exceptionDetails?.exception?.description ?? m.params.exceptionDetails?.text).slice(0, 300));
    if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") problems.errors.push(m.params.args.map(a => a.value ?? a.description ?? "").join(" ").slice(0, 300));
  });
  await viewport(375, 812);

  for (const [route, base] of [["/updates", "updates-list"], ["/updates/2.0.0", "updates-2.0.0"]]) {
    for (const scheme of ["light", "dark"]) {
      await check(`${route} 375 ${scheme === "light" ? "淺" : "深"}色：整頁截圖、沒有破圖、不橫捲`, async () => {
        await open(route, scheme);
        const broken = await brokenImages();
        const images = await evaluate("document.images.length");
        const w = await evaluate("({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth })");
        const file = await fullShot(`${base}-${scheme}.png`);
        return [broken.length === 0 && images > 0 && w.scroll <= w.inner, { file, images, broken, ...w }];
      });
    }
    await check(`${route} 有免責那一句`, async () => {
      await open(route);
      return [await hasText(DISCLAIMER), DISCLAIMER];
    });
  }

  await check("/updates 兩張版本卡：2.0.0 在前、1.15.0 在後，最新那張框是楓葉橘", async () => {
    await open("/updates");
    const r = await evaluate(`(() => {
      const probe = document.createElement("i");
      probe.style.color = "var(--maple)";
      document.body.append(probe);
      const maple = getComputedStyle(probe).color;
      probe.remove();
      const cards = [...document.querySelectorAll("section")].filter(s => s.querySelector("a[href^='/updates/']")).map(s => ({
        href: s.querySelector("a[href^='/updates/']").getAttribute("href"),
        border: getComputedStyle(s).borderTopColor,
      }));
      return { maple, cards };
    })()`);
    const hrefs = r.cards.map(c => c.href);
    return [hrefs.join() === "/updates/2.0.0,/updates/1.15.0" && r.cards[0].border === r.maple && r.cards[1].border !== r.maple, r];
  });

  await check("/updates/2.0.0 手機 375×812 第一屏看得到標題跟「這次重點」前兩條", async () => {
    await open("/updates/2.0.0");
    const m = await evaluate(`(() => {
      const vh = window.innerHeight;
      const h1 = document.querySelector("h1").getBoundingClientRect();
      const sec = ${SECTION("這次重點")};
      const li = sec ? [...sec.querySelectorAll("ul > li")].map(l => l.getBoundingClientRect()) : [];
      return { vh, h1Bottom: Math.round(h1.bottom), rows: li.length, firstTwoBottom: li[1] ? Math.round(li[1].bottom) : null };
    })()`);
    return [m.rows >= 2 && m.h1Bottom > 0 && m.h1Bottom <= m.vh && m.firstTwoBottom !== null && m.firstTwoBottom <= m.vh, m];
  });

  await check("/updates/2.0.0 「改了多少」四個數字 = 本機 json 的 items／quests／monsters／changed（新道具不含髮型臉型）", async () => {
    await open("/updates/2.0.0");
    const got = await evaluate(`(() => {
      const sec = ${SECTION("改了多少")};
      return sec ? [...sec.querySelectorAll(".grid > div")].map(d => ({ n: d.children[0].textContent.replace(/,/g, ""), label: d.children[1].textContent })) : [];
    })()`);
    const want = [PATCH.counts.items, PATCH.counts.quests, PATCH.counts.monsters, PATCH.counts.changed].map(String);
    return [got.length === 4 && got.map(g => g.n).join() === want.join(), { got, want }];
  });

  await check("/updates/2.0.0 一開始只露 3 列；點「看全部 N 件道具 ›」展開成 json 的 changed 全部列；按類別只剩該類別", async () => {
    await open("/updates/2.0.0");
    const rows = () => evaluate(`[...document.querySelectorAll("[data-changed-rows] > li")].filter(l => l.checkVisibility()).map(l => l.dataset.kind)`);
    const total = await evaluate(`document.querySelectorAll("[data-changed-rows] > li").length`);
    const before = await rows();
    const label = await evaluate(`(${BUTTON("看全部")})?.textContent.trim() ?? null`);
    await click("看全部", BUTTON("看全部"));
    await until(`!(${BUTTON("看全部")})`, 5000);
    await painted();
    const expanded = await rows();
    const chips = await evaluate(`${CHIPS}.map(b => b.textContent.trim())`);
    const chip = chips[1] ?? ""; // 第一顆是「全部」
    const kind = chip.replace(/\s*\d+$/, ""), count = Number(chip.match(/(\d+)$/)?.[1]);
    await click(chip, `${CHIPS}[1]`);
    await painted();
    const filtered = await rows();
    const pressed = await evaluate(`${CHIPS}.map(b => b.getAttribute("aria-pressed"))`);
    const fromJson = PATCH.changed.filter(c => c.kind === kind).length;
    return [
      total === PATCH.changed.length && before.length === FIRST && label === `看全部 ${PATCH.counts.changed} 件道具 ›` && expanded.length === PATCH.changed.length
        && chips.length > 1 && filtered.length > 0 && filtered.length < expanded.length && filtered.every(k => k === kind) && filtered.length === fromJson && fromJson === count && pressed[1] === "true",
      { total, expectRows: PATCH.changed.length, firstScreenRows: before.length, label, expanded: expanded.length, chips, filter: { kind, count, shown: filtered.length, fromJson }, pressed },
    ];
  });

  await check("/updates/1.14.7（沒有重點檔的版本）回 404", async () => {
    const s = await status("/updates/1.14.7");
    return [s === 404, { status: s }];
  });

  record("整趟 console 沒有例外或錯誤", problems.exceptions.length === 0 && problems.errors.length === 0, problems);
} catch (error) {
  record("腳本中途出錯", false, String(error?.message ?? error).slice(0, 400));
} finally {
  const passed = results.checks.filter(c => c.ok).length;
  results.summary = `${passed}/${results.checks.length}`;
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(results, null, 2));
  console.log(`\n${results.summary} 項通過，輸出在 ${OUT}`);
  if (close) await close();
  process.exit(passed === results.checks.length && results.checks.length > 0 ? 0 : 1);
}
