// 第二輪（11/12 拍板 1C 2C 3A 4C 5A 後）：真實日曆＋選策略＋「衝到幾以上」結果
// 用法：node round2.mjs → desk.html、mob.html，再用無頭 Chrome 截圖
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const items = resolve(here, "../../../../../public/assets/items").replace(/\\/g, "/");
const icon = (id, s = 28) => `<img src="file:///${items}/${id}.png" alt="" style="width:${s}px;height:${s}px;image-rendering:pixelated;object-fit:contain;flex:none">`;
const AXE = 1412011, S70 = 2046415, S15 = 2046416;

const css = `
:root{--paper:#f5f6f8;--paper-deep:#eceef2;--paper-edge:#dcdfe6;--glass:#fff;--ink:#14171d;--ink-soft:#4f5765;--maple:#a8360a;--maple-wash:rgb(194 65 12 / .1);--leaf:#146c34;--leaf-wash:rgb(23 128 61 / .1);--gold:#8a5300;--gold-wash:rgb(138 83 0 / .1);--on-accent:#fff}
*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font-family:Inter,"Microsoft JhengHei","PingFang TC",sans-serif;font-size:15px}
.card{background:var(--glass);border:1px solid var(--paper-edge);border-radius:8px;padding:14px;margin-top:12px}
.h{font-size:15px;font-weight:800}.soft{color:var(--ink-soft);font-size:12px}.num{font-variant-numeric:tabular-nums}
.btn{display:inline-flex;align-items:center;gap:6px;min-height:36px;padding:0 12px;border-radius:6px;border:1px solid var(--paper-edge);background:var(--glass);font-weight:700;font-size:14px;color:var(--ink)}
.if{border-style:dashed!important}
`;

// 策略卡（2C：不排，只選策略）
const strat = (on, title, sub, avg, p80) => `<div style="border:1px solid ${on ? "var(--maple)" : "var(--paper-edge)"};background:${on ? "var(--maple-wash)" : "var(--glass)"};border-radius:8px;padding:10px 12px">
<div style="font-weight:800;${on ? "color:var(--maple)" : ""}">${title}</div><div class="soft">${sub}</div>
<div class="num" style="margin-top:6px;font-size:13px">平均 <b>+${avg}</b>・80 以上 <b>${p80}</b></div></div>`;
const strategies = (cols) => `<div style="display:grid;grid-template-columns:${cols};gap:8px;margin-top:8px">
${strat(true, "楓谷幫手推薦", "先賭 15%，沒中換一把", "11.6", "53%")}
${strat(false, "穩穩衝 70%", "一把 7 張全 70%", "9.8", "33%")}
${strat(false, "保底 100%", "一把 7 張全 100%，不用楓幣", "7", "0%")}</div>`;

const head = (desk) => `<div style="font-size:12px;color:var(--ink-soft);font-weight:700">活動工具・楓葉商會 11/19～12/16</div>
<h1 style="font-size:${desk ? 28 : 24}px;font-weight:900;margin:4px 0 2px">楓葉武器衝卷規劃器</h1>
<p style="margin:0;color:var(--ink-soft);font-size:14px">選一種衝法，日曆告訴你每天換什麼，下面看最後攻擊多少。</p>
<div style="display:flex;gap:8px;margin-top:12px;align-items:center;flex-wrap:wrap"><span class="soft" style="font-weight:700">武器</span><span class="btn">${icon(AXE, 22)}楓葉戰斧（43 級・攻擊 68）<span class="soft">▾</span></span></div>
${strategies(desk ? "1fr 1fr 1fr" : "1fr")}`;

// 懶人包最糟那條路＋中了的提示
const P = {
  2: ["w", "換楓葉戰斧 ①", "200 枚"], 3: ["15", "15% 卷衝 ①"], 4: ["15", "15% 卷衝 ①", "第 1 張沒中才換"],
  6: ["w", "換楓葉戰斧 ②", "①兩張都沒中"], 7: ["15", "15% 卷衝 ②", "沒中才換"], 8: ["15", "15% 卷衝 ②", "沒中才換"],
  10: ["w", "換楓葉戰斧 ③", "②也沒中"], 11: ["15", "15% 卷衝 ③", "沒中才換"], 12: ["15", "15% 卷衝 ③", "沒中才換"],
  14: ["w", "換楓葉戰斧 ④", "都沒中才換"], 15: ["70", "70% 卷衝 ④"], 16: ["70", "70% 卷衝 ④"], 17: ["70", "70% 卷衝 ④"], 18: ["70", "70% 卷衝 ④"], 19: ["70", "70% 卷衝 ④"], 20: ["70", "70% 卷衝 ④"], 21: ["70", "70% 卷衝 ④"],
};
const idOf = (k) => (k === "w" ? AXE : k === "70" ? S70 : S15);
const TODAY = new Date(2026, 10, 24); // 示意：假設今天 11/24
const start = new Date(2026, 10, 15); // 11/15（日）起一週一列
const wk = ["日", "一", "二", "三", "四", "五", "六"];
const cal = (desk) => {
  const cells = [];
  for (let i = 0; i < 35; i++) {
    const t = new Date(start); t.setDate(start.getDate() + i);
    const day = Math.round((t - new Date(2026, 10, 19)) / 864e5) + 1; // DAY 1＝11/19
    const md = `${t.getMonth() + 1}/${t.getDate()}`;
    const today = +t === +TODAY;
    const x = P[day];
    let body = "", bg = "var(--glass)", dash = false;
    if (day < 1) bg = "var(--paper-deep)";
    else if (day <= 21) {
      if (x) { dash = !!x[2] && x[0] !== "w" ? true : x[0] === "w" && day > 2; body = desk ? `<div style="display:flex;align-items:center;gap:4px;margin-top:4px">${icon(idOf(x[0]), 26)}<div style="font-size:12px;font-weight:700;line-height:1.25">${x[1]}${x[2] && dash ? `<div class="soft" style="font-size:11px;font-weight:400">${x[2]}</div>` : ""}</div></div>` : `<div style="margin-top:2px">${icon(idOf(x[0]), 22)}</div>`; }
      else body = `<div class="soft" style="margin-top:${desk ? 8 : 4}px;font-size:${desk ? 12 : 10}px">存著</div>`;
    } else if (md === "12/17") { body = `<div style="font-size:${desk ? 12 : 10}px;font-weight:700;color:var(--maple);margin-top:4px">${desk ? "硬幣、卷軸失效" : "失效"}</div>`; bg = "var(--paper-deep)"; }
    else if (day <= 28) { body = `<div class="soft" style="font-size:${desk ? 12 : 10}px;margin-top:4px">${desk ? "不掉幣，還能換" : "只能換"}</div>`; bg = "var(--paper-deep)"; }
    else bg = "var(--paper-deep)";
    const coin = day >= 1 && day <= 21 ? `<span class="num soft" style="font-size:${desk ? 11 : 9}px">DAY ${day}</span>` : "";
    cells.push(`<div class="${dash ? "if" : ""}" style="position:relative;border:${today ? "2px solid var(--maple)" : "1px solid var(--paper-edge)"};background:${bg};border-radius:6px;min-height:${desk ? 92 : 58}px;padding:${desk ? "6px 8px" : "3px"};${desk ? "" : "text-align:center"}">
<div style="display:flex;justify-content:space-between;align-items:baseline;gap:2px;${desk ? "" : "flex-direction:column;align-items:center"}"><span class="num" style="font-weight:800;font-size:${desk ? 13 : 11}px;${day < 1 || day > 28 ? "color:var(--ink-soft)" : ""}">${md}</span>${coin}</div>
${today ? `<span style="position:absolute;top:${desk ? -9 : -9}px;${desk ? "left:8px;" : "right:-4px;"}background:var(--maple);color:var(--on-accent);font-size:10px;font-weight:800;padding:0 5px;border-radius:4px">今天</span>` : ""}${body}</div>`);
  }
  return `<div class="card"><div style="display:flex;justify-content:space-between;align-items:baseline"><span class="h">每天換什麼</span><span class="soft">虛線＝前面沒中才換</span></div>
<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:${desk ? 6 : 3}px;margin-top:10px">${wk.map((w) => `<div class="soft" style="text-align:center;font-weight:700">${w}</div>`).join("")}${cells.join("")}</div>
<div style="margin-top:10px;padding:8px 10px;border-radius:6px;background:var(--gold-wash);font-size:13px"><b>15% 中了：</b>那把留著，隔天起每天換一張 70% 衝它，衝滿 7 次就收工（不用再換新武器）。</div>
${desk ? "" : `<div style="margin-top:8px;border:1px solid var(--maple);border-radius:8px;padding:10px"><div class="h">11/24（一）DAY 6・今天</div><div style="display:flex;align-items:center;gap:8px;margin-top:6px">${icon(AXE)}<div><div style="font-weight:800">換楓葉戰斧 ②</div><div class="soft">①的兩張 15% 都沒中才換・200 枚</div></div></div></div>`}
</div>`;
};

// 結果：只留「衝到這個攻擊以上」一欄
const ge = [[85, 17, 4.0], [83, 15, 19.0], [81, 13, 43.3], [80, 12, 52.6], [78, 10, 79.6], [76, 8, 94.0], [74, 6, 98.8]];
const word = (p) => (p >= 90 ? "幾乎一定" : p >= 70 ? "大概會" : p >= 45 ? "一半一半" : p >= 15 ? "要運氣好" : "很難");
const result = () => `<div class="card">
<div class="h">最後拿到的楓葉戰斧</div><div class="soft">原本攻擊 68・失敗只扣次數、不會爆</div>
<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-top:10px">
<div style="border:1px solid var(--paper-edge);border-radius:8px;padding:10px"><div class="soft" style="font-weight:700">平均攻擊</div><div class="num" style="font-size:24px;font-weight:900">79.6</div><div class="soft">+11.6</div></div>
<div style="border:1px solid var(--paper-edge);border-radius:8px;padding:10px"><div class="soft" style="font-weight:700">最常拿到</div><div class="num" style="font-size:24px;font-weight:900">81</div><div class="soft">+13・21%</div></div>
<div style="border:1px solid var(--paper-edge);border-radius:8px;padding:10px"><div class="soft" style="font-weight:700">要準備楓幣</div><div class="num" style="font-size:24px;font-weight:900">390 萬</div><div class="soft">平均 307 萬</div></div></div>
<div class="h" style="margin-top:14px">衝到這個攻擊以上的機會</div>
<div style="margin-top:6px;display:grid;gap:6px">
${ge.map(([a, k, p]) => `<div style="display:grid;grid-template-columns:92px 1fr 52px;gap:8px;align-items:center;${k === 12 ? "background:var(--maple-wash);border-radius:6px;padding:4px 6px;margin:0 -6px" : ""}">
<div class="num" style="font-weight:800">${a} 以上 <span class="soft">+${k}</span></div>
<div style="height:14px;background:var(--paper-deep);border-radius:3px;position:relative"><div style="position:absolute;inset:0 auto 0 0;width:${p}%;background:var(--maple);border-radius:3px"></div></div>
<div class="num" style="text-align:right;font-weight:800">${p.toFixed(0)}%</div></div>`).join("")}
</div>
<div class="soft" style="margin-top:8px">例：「80 以上 53%」＝照這個衝法，有一半多的機會最後攻擊 80 或更高。最好 85、最糟 68。</div>
<div style="margin-top:10px;padding:8px 10px;border-radius:6px;background:var(--leaf-wash);color:var(--leaf);font-size:13px;font-weight:700">硬幣夠：每天打滿 100 枚，最慢 DAY 21（12/9）剛好用完</div>
</div>`;

const page = (body, w) => `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><style>${css}</style><div style="width:${w}px;padding:12px 16px 24px">${body}</div>`;
const desk = `<div style="display:grid;grid-template-columns:1fr 380px;gap:20px;align-items:start"><div>${head(true)}${cal(true)}</div><div style="position:sticky;top:0">${result()}</div></div>`;
const mob = `${head(false)}${cal(false)}${result()}`;
writeFileSync(resolve(here, "desk.html"), page(desk, 1280));
writeFileSync(resolve(here, "mob.html"), page(mob, 390));
console.log("ok");
