// 地圖＋NPC 圖鑑候選。資料全是真的：楓葉村東郊平原（1020000，上游 maps-data.js 刷怪點、NPC、門座標；graph.json 門去向）、
// 弓箭手村武器店 山姆（items.json sp，標舊版參考）。
import fs from "node:fs";
const mini = "data:image/png;base64," + fs.readFileSync(new URL("./mm.png", import.meta.url)).toString("base64");
const render = "data:image/webp;base64," + fs.readFileSync(new URL("./r.webp", import.meta.url)).toString("base64");

const card = (inner, extra = "") => `<section style="border-radius:1.125rem;padding:16px;background:var(--glass-strong);border:1px solid var(--paper-edge);box-shadow:var(--glass-shadow);margin-top:14px;${extra}">${inner}</section>`;
const h2 = (t, sub = "") => `<div style="display:flex;align-items:baseline;gap:8px;margin-bottom:8px"><b style="font-size:16px;color:var(--ink)">${t}</b>${sub ? `<span style="font-size:12px;color:var(--ink-soft)">${sub}</span>` : ""}</div>`;
const mon = (id, s = 36) => `<img src="/assets/monster_frames/${id}.png" alt="" style="width:${s}px;height:${s}px;object-fit:contain;image-rendering:pixelated">`;
const npcImg = (id, s = 40) => `<img src="/assets/npcs/${id}.png" alt="" style="width:${s}px;height:${s}px;object-fit:contain;image-rendering:pixelated">`;
const itemImg = (id, s = 28) => `<img src="/assets/items/${id}.png" alt="" style="width:${s}px;height:${s}px;object-fit:contain;image-rendering:pixelated">`;
const chip = (t, c = "var(--ink-soft)") => `<span style="display:inline-flex;align-items:center;min-height:24px;padding:0 9px;border-radius:999px;border:1px solid var(--paper-edge);font-size:12px;font-weight:800;color:${c}">${t}</span>`;
const link = (t) => `<span style="color:var(--maple);font-weight:800;font-size:13px">${t}</span>`;

const MOBS = [
  { id: 130100, n: "木妖", lv: 4, k: 7, c: "#3f8f4f", pts: [[303, 194], [434, 197], [544, 195], [1011, 196], [1141, 188], [1262, 196], [264, 195]] },
  { id: 130101, n: "紅寶", lv: 4, k: 7, c: "#d4553a", pts: [[1488, 79], [1727, 79], [1321, -228], [1193, -235], [220, -228], [324, -230], [405, -221]] },
  { id: 210100, n: "綠水靈", lv: 6, k: 4, c: "#2f9fb0", pts: [[928, -220], [1061, -228], [231, -576], [343, -585]] },
  { id: 1210100, n: "肥肥", lv: 7, k: 3, c: "#c9a23a", pts: [[1124, -574], [1179, -577], [1249, -584]] },
];
const NPCS = [{ id: 12100, n: "麥加", x: -21, y: 87, what: "有 8 個任務" }];
const DOORS = [
  { n: "楓葉村", x: -216, y: 93, note: "城鎮" },
  { n: "番茄園", x: -199, y: -450 },
  { n: "草叢狩獵場Ⅰ", x: 713, y: -571 },
  { n: "草叢狩獵場Ⅱ", x: 1589, y: -506 },
];
const B = { left: -422, top: -694, width: 2240, height: 1216 };
const px = (x) => ((x - B.left) / B.width) * 100;
const py = (y) => ((y - B.top) / B.height) * 100;

const head = (sub = "") => `<div style="font-size:13px;color:var(--ink-soft);font-weight:700">楓之島・彩虹之地</div>
<h1 style="font-size:27px;font-weight:900;color:var(--ink);margin:4px 0 6px">楓葉村東郊平原</h1>
<div style="display:flex;gap:6px;flex-wrap:wrap">${chip("怪物 4～7 等")}${chip("回城：楓葉村")}${chip("帶我去", "var(--maple)")}</div>${sub}`;

const mobRows = MOBS.map((m) => `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-top:1px solid var(--paper-edge)">
  <span style="width:10px;height:10px;border-radius:99px;background:${m.c};flex:none"></span>${mon(m.id)}
  <div style="flex:1"><div style="font-weight:800;color:var(--ink);font-size:15px">${m.n}</div><div style="font-size:12px;color:var(--ink-soft)">${m.lv} 等</div></div>
  <div style="text-align:right"><div style="font-weight:900;font-size:17px;color:var(--ink);font-variant-numeric:tabular-nums">${m.k} 隻</div><div style="font-size:11px;color:var(--ink-soft)">同時在場</div></div></div>`).join("");
const npcRows = NPCS.map((n) => `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-top:1px solid var(--paper-edge)">${npcImg(n.id)}
  <div style="flex:1"><div style="font-weight:800;color:var(--ink);font-size:15px">${n.n}</div><div style="font-size:12px;color:var(--ink-soft)">${n.what}</div></div>${link("看 NPC")}</div>`).join("");
const doorRows = DOORS.map((d) => `<div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-top:1px solid var(--paper-edge)">
  <span style="width:22px;height:22px;border-radius:6px;border:2px solid var(--leaf);display:inline-flex;align-items:center;justify-content:center;flex:none"><svg width="10" height="10" viewBox="0 0 10 10"><path d="M2 5h6M5 2l3 3-3 3" stroke="var(--leaf)" stroke-width="1.6" fill="none"/></svg></span>
  <span style="flex:1;font-weight:800;color:var(--ink);font-size:15px">${d.n}</span>${d.note ? chip(d.note) : ""}${link("過去看")}</div>`).join("");

// A：整張地圖畫面，怪、NPC、門標在圖上
const dots = MOBS.flatMap((m) => m.pts.map(([x, y]) => `<span style="position:absolute;left:${px(x)}%;top:${py(y)}%;width:11px;height:11px;margin:-6px 0 0 -6px;border-radius:99px;background:${m.c};border:2px solid #fff;box-shadow:0 1px 2px #0006"></span>`)).join("");
const npcPins = NPCS.map((n) => `<span style="position:absolute;left:${px(n.x)}%;top:${py(n.y)}%;transform:translate(-50%,-100%);background:#fff;color:#222;font-size:11px;font-weight:900;padding:2px 6px;border-radius:6px;box-shadow:0 1px 3px #0007;white-space:nowrap">${n.n}</span>`).join("");
const doorPins = DOORS.map((d) => `<span style="position:absolute;left:${px(d.x)}%;top:${py(d.y)}%;transform:translate(-50%,-115%);background:var(--leaf);color:#fff;font-size:11px;font-weight:900;padding:2px 6px;border-radius:6px;white-space:nowrap;box-shadow:0 1px 3px #0007">往 ${d.n}</span>`).join("");
const bigMap = `<div style="position:relative;border-radius:14px;overflow:hidden;border:1px solid var(--paper-edge)"><img src="${render}" alt="" style="display:block;width:100%">${dots}${npcPins}${doorPins}</div>
<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:8px;font-size:12px;color:var(--ink-soft)">${MOBS.map((m) => `<span><span style="display:inline-block;width:9px;height:9px;border-radius:99px;background:${m.c};margin-right:4px"></span>${m.n}</span>`).join("")}<span>白框＝NPC・綠框＝門</span></div>`;
const A = `${head()}${card(bigMap)}${card(h2("怪物", "全部打完就是這麼多隻") + mobRows)}${card(h2("NPC") + npcRows)}${card(h2("門通往") + doorRows)}`;

// B：遊戲裡的小地圖＋三段清單
const MM = { cx: 454, cy: 838, w: 2315 / 16, h: 1392 / 16 };
const mx = (x) => ((x + MM.cx) / 16 / MM.w) * 100, my = (y) => ((y + MM.cy) / 16 / MM.h) * 100;
const miniDots = MOBS.flatMap((m) => m.pts.map(([x, y]) => `<span style="position:absolute;left:${mx(x)}%;top:${my(y)}%;width:9px;height:9px;margin:-5px 0 0 -5px;border-radius:99px;background:${m.c};border:1.5px solid #fff"></span>`)).join("")
  + NPCS.map((n) => `<span style="position:absolute;left:${mx(n.x)}%;top:${my(n.y)}%;width:10px;height:10px;margin:-5px 0 0 -5px;background:#ffd84a;border:1.5px solid #222;transform:rotate(45deg)"></span>`).join("")
  + DOORS.map((d) => `<span style="position:absolute;left:${mx(d.x)}%;top:${my(d.y)}%;transform:translate(-50%,-120%);background:var(--leaf);color:#fff;font-size:10px;font-weight:900;padding:1px 5px;border-radius:5px;white-space:nowrap">${d.n}</span>`).join("");
const B_ = `${head()}${card(`<div style="position:relative;border-radius:10px;overflow:hidden;background:#000"><img src="${mini}" alt="" style="display:block;width:100%;image-rendering:pixelated">${miniDots}</div><div style="font-size:12px;color:var(--ink-soft);margin-top:6px">遊戲裡的小地圖・圓點是怪、黃菱形是 NPC</div>`)}${card(h2("怪物") + mobRows)}${card(h2("NPC") + npcRows)}${card(h2("門通往") + doorRows)}`;

// C：只有清單，一張卡分三段
const C = `${head()}${card(`${h2("怪物", "4 種・共 21 隻")}${mobRows}<div style="height:14px"></div>${h2("NPC")}${npcRows}<div style="height:14px"></div>${h2("門通往")}${doorRows}`)}`;

// N：NPC 頁（山姆，弓箭手村武器店；商店資料是舊版參考）
const SHOP = [[1002033, "狗皮帽", "帽子", 3000], [1041008, "皮製旅行服", "上衣", 5500], [1061059, "灰旅行皮裙", "褲裙", 5000], [1072026, "兔毛鞋", "鞋子", 9000], [1032001, "單邊銀色耳環", "耳環", 7000], [1062006, "打獵褲", "褲裙", 13000], [1041033, "紅打獵服", "上衣", 15000], [1072064, "紅帆布鞋", "鞋子", 30000]];
const shopRows = SHOP.map(([id, n, s, pr]) => `<div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-top:1px solid var(--paper-edge)">${itemImg(id)}<div style="flex:1"><div style="font-weight:800;color:var(--ink);font-size:14px">${n}</div><div style="font-size:12px;color:var(--ink-soft)">${s}</div></div><b style="font-variant-numeric:tabular-nums;color:var(--ink)">${pr.toLocaleString()} 楓幣</b></div>`).join("");
const N = `<div style="display:flex;gap:14px;align-items:center">${npcImg(1011001, 84)}<div><div style="font-size:13px;color:var(--ink-soft);font-weight:700">NPC</div><h1 style="font-size:27px;font-weight:900;color:var(--ink);margin:2px 0 6px">山姆</h1>${chip("帶我去", "var(--maple)")}</div></div>
${card(h2("在哪") + `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-top:1px solid var(--paper-edge)"><div style="flex:1"><div style="font-weight:800;color:var(--ink);font-size:15px">弓箭手村武器店</div><div style="font-size:12px;color:var(--ink-soft)">維多利亞・弓箭手村裡面</div></div>${link("看地圖")}</div>`)}
${card(h2("賣什麼", "共 90 樣・參考舊版資料，價格以遊戲裡為準") + shopRows + `<div style="text-align:center;margin-top:10px">${link("看全部 90 樣")}</div>`)}
${card(h2("任務") + `<div style="font-size:14px;color:var(--ink-soft)">這個 NPC 沒有任務</div>`)}`;

const wrap = (h) => `<div style="max-width:620px;margin:0 auto;padding:12px 4px 24px">${h}</div>`;
export const candidates = [
  { key: "A", title: "地圖畫面標出怪、NPC、門", html: wrap(A) },
  { key: "B", title: "遊戲小地圖＋清單", html: wrap(B_) },
  { key: "C", title: "只有清單", html: wrap(C) },
  { key: "N", title: "NPC 頁（山姆）", html: wrap(N) },
];
