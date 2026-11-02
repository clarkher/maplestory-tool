// 組隊指揮（/plan/pq，v1.31）驗收：切任務、切關、試組合帶名字、複製、重新整理還在、過了跳下一關、重來、全部試過、
// 女神拉桿、壞存檔、亂填網址、窄螢幕不橫捲、攻略頁跟首頁入口。任何一項沒過 exit 1
// 用法：node scripts/verify/pq-shot.mjs [網址，預設 http://localhost:9431] [輸出資料夾] [DevTools 埠，預設 9432]
//   例：node scripts/verify/pq-shot.mjs http://localhost:9431 "$TEMP/pq-shot"
// 網址用 localhost，不要用 127.0.0.1（next dev 對 127.0.0.1 的互動不理）。第一次開頁 dev 要編譯，最多等 1 分鐘。
// 輸出：pq-390-light／dark.png（超綠跳木桶、填了名字、試到第 5 組）、pq-1280-light／dark.png、pq-goddess-390.png（女神拉桿）、
//       pq-home.png（首頁 58 等狂戰士的女神組隊卡）、results.json
import fs from "node:fs";
import path from "node:path";
import { chromePort, outDir } from "./config.mjs";
import { sleep, start } from "./harness.mjs";

const BASE = (process.argv[2] ?? "http://localhost:9431").replace(/\/$/, "");
const OUT = outDir(process.argv[3], "pq-shot");
const PORT = chromePort(9432, process.argv[4]);

const results = { base: BASE, port: PORT, checks: [] };
const record = (name, ok, detail) => {
  results.checks.push({ name, ok: Boolean(ok), ...(detail === undefined ? {} : { detail }) });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail === undefined ? "" : `  ${typeof detail === "string" ? detail : JSON.stringify(detail)}`}`);
  return Boolean(ok);
};

let page, evaluate, navigate, close;
const problems = { exceptions: [], errors: [] };

const viewport = (width, height = 900) => page.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
const setTheme = theme => evaluate(`(() => { document.documentElement.dataset.theme = ${JSON.stringify(theme)}; return true; })()`);
const bodyText = () => evaluate("document.body.innerText");

async function until(expression, ms = 60000) {
  for (let t = 0; t < ms; t += 250) {
    try { if (await evaluate(`Boolean(${expression})`)) return true; } catch { /* 換頁中 */ }
    await sleep(250);
  }
  return false;
}

/** 真的用滑鼠點；finder 是一段會回傳元素的程式。instant 才不會邊滑邊量 */
async function click(finder) {
  const at = await evaluate(`(() => { const el = (${finder}); if (!el) return null; el.scrollIntoView({ block: "center", behavior: "instant" }); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  if (!at) return false;
  await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: at.x, y: at.y });
  await page.send("Input.dispatchMouseEvent", { type: "mousePressed", x: at.x, y: at.y, button: "left", clickCount: 1 });
  await page.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: at.x, y: at.y, button: "left", clickCount: 1 });
  await sleep(200);
  return true;
}
const button = text => `[...document.querySelectorAll("button")].find(b => b.textContent.trim() === ${JSON.stringify(text)})`;
const step = n => `document.querySelectorAll('nav[aria-label="關卡"] button')[${n - 1}]`;
const comboText = () => evaluate(`(() => { const p = [...document.querySelectorAll("p")].find(p => /^(現在試|答案)：/.test(p.textContent)); return p ? p.textContent : null; })()`);
/** 試組合那塊的喊話（試組合框裡第一行） */
const comboSay = () => evaluate(`(() => { const p = [...document.querySelectorAll("p")].find(p => /^(現在試|答案)：/.test(p.textContent)); const box = p?.closest("div.rounded-2xl"); return box?.querySelector("span.flex-1")?.textContent ?? null; })()`);

async function typeName(i, text) {
  const finder = `document.querySelectorAll('input[aria-label$="的名字"]')[${i}]`;
  await click(finder);
  if (text) await page.send("Input.insertText", { text });
  await sleep(150);
}

/** 整頁截圖：把視窗拉到頁面那麼高再截 */
async function fullShot(file, width) {
  const h = await evaluate("Math.ceil(document.documentElement.scrollHeight)");
  await viewport(width, Math.min(h, 4000));
  await sleep(400);
  const r = await page.send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(path.join(OUT, file), Buffer.from(r.data, "base64"));
  await viewport(width);
}
const noSideScroll = () => evaluate("document.documentElement.scrollWidth <= document.documentElement.clientWidth");

const open = query => navigate(`${BASE}/plan/pq${query}`);
/** 等頁面讀完存檔（data-ready）才點；伺服器先畫好的畫面還沒接上程式時點了會被吃掉 */
const ready = () => until(`document.querySelector('nav[aria-label="關卡"][data-ready]')`);

try {
  ({ page, evaluate, navigate, close } = await start(OUT, PORT));
  page.listeners.add(msg => {
    if (msg.method === "Runtime.exceptionThrown") problems.exceptions.push(String(msg.params.exceptionDetails?.exception?.description ?? msg.params.exceptionDetails?.text).slice(0, 300));
    if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") problems.errors.push(msg.params.args.map(a => a.value ?? a.description).join(" ").slice(0, 300));
  });
  await page.send("Browser.grantPermissions", { origin: BASE, permissions: ["clipboardReadWrite", "clipboardSanitizedWrite"] }).catch(() => {});
  await viewport(390);

  // 1. 沒存過、網址帶超綠
  await open("");
  await ready();
  await evaluate("localStorage.removeItem('ms-pq'); true");
  await open("?pq=kerning");
  record("頁面載入", await ready());
  await sleep(600);
  let text = await bodyText();
  record("網址帶 ?pq=kerning：超綠選起來、寫墮落城市找拉克里斯", (await evaluate(`${button("超綠")}?.getAttribute("aria-pressed") === "true"`)) && text.includes("墮落城市找拉克里斯"));
  record("超綠 5 關、第 1 關鱷魚答題有答題表", (await evaluate(`document.querySelectorAll('nav[aria-label="關卡"] button').length`)) === 5 && text.includes("鱷魚答題") && text.includes("克魯特的問題"));

  // 2. 切到第 4 關跳木桶，沒填名字
  await click(step(4));
  record("點進度條第 4 關：跳木桶、第 1 組／共 20 組、現在試 1・2・3", (await bodyText()).includes("第 1 組／共 20 組") && (await comboText()) === "現在試：1・2・3");
  record("沒填名字的喊話", (await comboSay()) === "第一組：三個人分別站 1、2、3 號桶，站好別動", await comboSay());

  // 3. 填名字
  await typeName(0, "阿明");
  await typeName(1, "小華");
  await typeName(2, "阿強");
  record("填了名字：喊話帶名字", (await comboSay()) === "第一組：阿明 1 號桶、小華 2 號桶、阿強 3 號桶，站好別動", await comboSay());

  // 4. 不對，下一組
  await click(button("不對，下一組"));
  record("下一組 1・2・4：只叫阿強換到 4 號", (await comboText()) === "現在試：1・2・4" && (await comboSay()) === "下一組：阿強從 3 號桶換到 4 號桶，其他人別動", await comboSay());
  record("寫出試過不對：123", (await bodyText()).includes("試過不對：123"));
  for (let i = 0; i < 3; i++) await click(button("不對，下一組"));
  record("第 5 組 1・3・4：小華到 3、阿強從 6 到 4", (await comboText()) === "現在試：1・3・4" && (await comboSay()) === "下一組：小華從 2 號桶換到 3 號桶、阿強從 6 號桶換到 4 號桶，其他人別動", await comboSay());

  // 5. 複製
  const copyFinder = `[...document.querySelectorAll("button")].find(b => b.getAttribute("aria-label")?.startsWith("複製：下一組：小華"))`;
  await click(copyFinder);
  const clip = await evaluate("navigator.clipboard.readText().catch(e => 'ERR ' + e.message)");
  record("按複製：剪貼簿拿到那一行、按鈕變「已複製」", clip === "下一組：小華從 2 號桶換到 3 號桶、阿強從 6 號桶換到 4 號桶，其他人別動" && (await evaluate(`${copyFinder}?.textContent`)) === "已複製", clip);
  await sleep(1800);
  record("1.5 秒後按鈕變回「複製」", (await evaluate(`${copyFinder}?.textContent`)) === "複製");
  // 複製完馬上換下一組：新喊話旁邊不能還寫「已複製」（剪貼簿裡是上一組）
  await click(copyFinder);
  await click(button("不對，下一組"));
  const sayBtn = `[...document.querySelectorAll("button")].find(b => b.getAttribute("aria-label")?.startsWith("複製：下一組："))`;
  record("複製完馬上按下一組：新喊話的按鈕是「複製」", (await evaluate(`${sayBtn}?.textContent`)) === "複製", await evaluate(`${sayBtn}?.textContent`));
  await click(button("按錯了，回上一組"));

  // 6. 截圖（填了名字、試到第 5 組）
  await setTheme("light");
  await fullShot("pq-390-light.png", 390);
  await setTheme("dark");
  await fullShot("pq-390-dark.png", 390);
  record("390 寬不橫捲（超綠）", await noSideScroll());
  await viewport(1280);
  await fullShot("pq-1280-dark.png", 1280);
  await setTheme("light");
  await fullShot("pq-1280-light.png", 1280);
  await viewport(390);

  // 7. 重新整理還在
  await open("");
  await ready();
  await sleep(800);
  record("重新整理（網址沒帶任務）：還在超綠第 4 關第 5 組、名字還在",
    (await comboText()) === "現在試：1・3・4" && (await evaluate(`document.querySelectorAll('input[aria-label$="的名字"]')[2].value`)) === "阿強",
    { combo: await comboText(), name: await evaluate(`document.querySelectorAll('input[aria-label$="的名字"]')[2].value`), saved: await evaluate("localStorage.getItem('ms-pq')") });

  // 8. 勾隊長要做、過了
  await click(`document.querySelector('input[type="checkbox"]')`);
  record("勾第一條隊長要做", await evaluate(`document.querySelector('input[type="checkbox"]').checked`), await evaluate(`[...document.querySelectorAll('input[type="checkbox"]')].map(c => c.checked + ":" + c.closest("label")?.textContent.slice(0, 12))`));
  await click(button("過了"));
  text = await bodyText();
  record("按過了：跳到第 5 關王關", text.includes("第 5 關・共 5 關") && text.includes("超級綠水靈"));
  await click(step(4));
  record("回第 4 關：寫答案 1・3・4、這組過了", (await comboText()) === "答案：1・3・4" && (await bodyText()).includes("這組過了"));

  // 9. 重來
  await click(button("重來"));
  await sleep(300);
  text = await bodyText();
  record("重來：回第 1 關、勾選清掉、名字留著", text.includes("第 1 關・共 5 關") && !(await evaluate(`[...document.querySelectorAll('input[type="checkbox"]')].some(c => c.checked)`)) && (await evaluate(`document.querySelectorAll('input[aria-label$="的名字"]')[0].value`)) === "阿明");

  // 10. 全部試過
  await click(step(4));
  for (let i = 0; i < 20; i++) await click(button("不對，下一組"));
  record("20 組都不對：寫全部試過了，有從第一組再試", (await bodyText()).includes("全部 20 組都試過了") && (await evaluate(`Boolean(${button("從第一組再試")})`)));
  await click(button("從第一組再試"));
  record("從第一組再試：回到 1・2・3", (await comboText()) === "現在試：1・2・3");

  // 11. 女神：舊版標示、8 關、拉桿
  await click(button("女神"));
  await until(`location.search === "?pq=goddess"`, 5000); // 換網址是非同步的
  text = await bodyText();
  record("切女神：網址換成 ?pq=goddess、標參考舊版攻略、8 關", (await evaluate("location.search")) === "?pq=goddess" && text.includes("參考舊版攻略") && (await evaluate(`document.querySelectorAll('nav[aria-label="關卡"] button').length`)) === 8);
  await click(step(7));
  record("女神上層拉桿：第一組拉下 1、2 號拉桿", (await comboSay()) === "第一組：拉下 1、2 號拉桿，其他推回去", await comboSay());
  await click(button("不對，下一組"));
  record("拉桿下一組：拉下 1、3 號", (await comboSay()) === "下一組：拉下 1、3 號拉桿，其他推回去", await comboSay());
  record("390 寬不橫捲（女神 8 關）", await noSideScroll());
  await fullShot("pq-goddess-390.png", 390);
  await click(button("月妙"));
  record("月妙：第 1 關收種子、390 不橫捲", (await bodyText()).includes("收種子") && (await noSideScroll()));
  await click(step(2));
  record("月妙第 2 關有種子位置圖", await evaluate(`Boolean(document.querySelector('svg[aria-label="月妙六色種子平台位置圖"]'))`));

  // 12. 壞存檔、亂填網址
  await evaluate("localStorage.setItem('ms-pq', '{壞'); true");
  await open("?pq=%E4%BA%82");
  record("壞存檔＋亂填網址：照樣開月妙第 1 關", (await ready()) && (await evaluate(`${button("月妙")}?.getAttribute("aria-pressed") === "true"`)) && (await bodyText()).includes("第 1 關・共 4 關"));

  // 13. 入口：攻略頁、首頁
  // 攻略的組隊段落平常收著，帶 #pq-moon 進來才展開
  await navigate(`${BASE}/guide#pq-moon`);
  record("攻略頁月妙段落有組隊指揮連結", await until(`document.querySelector('a[href="/plan/pq?pq=moon"]')`));
  await navigate("about:blank"); // 同一頁只換 # 不會重新展開
  await navigate(`${BASE}/guide#pq-kerning`);
  record("攻略頁超綠段落有組隊指揮連結", await until(`document.querySelector('a[href="/plan/pq?pq=kerning"]')`));
  await evaluate(`localStorage.setItem("ms-profile", JSON.stringify({ job: 110, level: 58 })); true`);
  await navigate(`${BASE}/`);
  const homeOk = await until(`document.querySelector('a[href="/plan/pq?pq=goddess"]')`);
  record("首頁 58 等狂戰士：女神組隊卡有組隊指揮連結", homeOk);
  if (homeOk) {
    await click(`document.querySelector('a[href="/plan/pq?pq=goddess"]')`);
    await until(`location.pathname === "/plan/pq"`);
    await until(`document.querySelector('nav[aria-label="關卡"][data-ready]')`);
    await sleep(600);
    record("點了進組隊指揮女神", (await evaluate(`${button("女神")}?.getAttribute("aria-pressed") === "true"`)));
  }

  record("整趟 console 沒有例外或錯誤", problems.exceptions.length === 0 && problems.errors.length === 0, problems);
} catch (err) {
  record("跑完沒出錯", false, String(err?.stack ?? err));
} finally {
  fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(results, null, 2));
  const passed = results.checks.filter(c => c.ok).length;
  console.log(`\n${passed}/${results.checks.length} 通過，輸出在 ${OUT}`);
  if (close) await close();
  process.exit(passed === results.checks.length && results.checks.length > 0 ? 0 : 1);
}
