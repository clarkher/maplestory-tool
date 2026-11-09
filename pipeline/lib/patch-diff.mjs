/**
 * 改版整理的比對：拿兩份 build.mjs 的輸出（items／quests／monsters／maps），列出新增、改了、站上不再列出。
 * 純函式，不讀檔；before／after 直接給玩家看，所以全是白話字（不露出欄位代號或 JSON）。
 * 只收看得懂的欄位：說明、商店、掉落、能力、名稱。qr／qq／un／c／sh 變了不算（玩家看不出差別）。
 * 髮型臉型（外觀/角色）只給數字（looks、goneLooks），不列清單，改了也不列。
 * 雜訊不列：商店只換店名（價錢、貨幣、件數一樣）；資料補齊（舊的是空的：未命名道具、能力全無、沒有掉落、沒賣）；
 * 說明只差遊戲顏色碼或空白。名字還是「未命名道具」的道具整筆不列也不算。
 */
import { equipStatLabel, equipStatValue } from "./equip-labels.mjs";

const LOOKS = "外觀/角色";

const UNNAMED = "未命名道具";
const unnamed = it => String(it?.n ?? "").startsWith(UNNAMED);

const byId = list => new Map((list ?? []).map(x => [String(x.id), x]));

const num = v => Number(v).toLocaleString("en-US");

/**
 * 一家店一句：楓幣店「店名 1,000」、商城「商城 100」、活動貨幣寫貨幣名「店名 10 萬聖節硬幣」，
 * 整組賣的照站上寫「店名 10 個 1 萬聖節硬幣」。排序、去重後再接（上游換順序、同店開在好幾張分流圖都不算變動）。
 */
function shopText(sp) {
  if (!sp?.length) return "沒賣";
  const one = s => {
    if (s.pr === undefined) return s.p;
    const amount = s.u ? `${num(s.pr)} ${s.u}` : num(s.pr);
    return `${s.p} ${s.k ? `${num(s.k)} 個 ${amount}` : amount}`;
  };
  return [...new Set(sp.map(one))].sort().join("、");
}

/** 價錢、貨幣、件數的多重集合（不看店名） */
function shopPrices(sp) {
  return (sp ?? []).map(s => `${s.pr}|${s.u ?? (s.c ? "c" : "")}|${s.k ?? 1}`).sort().join(",");
}

/** 說明拿掉遊戲顏色／格式碼（#c #b #k #e #n）跟落單的 #，空白合併 */
export function cleanDesc(text) {
  return String(text ?? "").replace(/#[bcekn]/g, "").replace(/#/g, "").replace(/\s+/g, " ").trim();
}

function dropText(dm, monsters) {
  if (!dm?.length) return "沒有";
  // 掉落來源順序不影響玩家看到的內容，排序後再比，免得上游換順序就出一列
  return [...dm].sort((a, b) => a - b).map(id => monsters.get(String(id))?.n ?? String(id)).join("、");
}

function statText(eq, keys) {
  return keys
    .map(key => {
      if (eq?.[key] === undefined) return `${equipStatLabel(key)} 無`;
      const v = equipStatValue(key, eq[key]);
      return `${equipStatLabel(key)} ${v ?? "單格"}`;
    })
    .join("、");
}

function statChangedKeys(a, b) {
  const keys = [...new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})])];
  return keys.filter(k => JSON.stringify(a?.[k]) !== JSON.stringify(b?.[k]));
}

export function diffPatch(oldData, newData) {
  const oldItems = byId(oldData.items);
  const newItems = byId(newData.items);
  const oldMon = byId(oldData.monsters);
  const newMon = byId(newData.monsters);
  const oldQuests = byId(oldData.quests);
  const newQuests = byId(newData.quests);

  const added = { items: [], quests: [], monsters: [], maps: [] };
  const gone = { items: [], quests: [] };
  const changed = [];
  let looks = 0;
  let goneLooks = 0;
  let changedItems = 0;

  for (const [key, it] of newItems) {
    if (!oldItems.has(key) && !unnamed(it)) {
      if (it.s === LOOKS) looks++;
      else {
        const row = { id: it.id, n: it.n, c: it.c, s: it.s };
        if (it.eq?.reqLevel !== undefined) row.lv = it.eq.reqLevel;
        added.items.push(row);
      }
    }
  }
  // 髮型臉型只給數字不列清單（新增、不再列出、改了都一樣）
  for (const [key, it] of oldItems) {
    if (newItems.has(key) || unnamed(it)) continue;
    if (it.s === LOOKS) goneLooks++;
    else gone.items.push({ id: it.id, n: it.n });
  }

  for (const [key, now] of newItems) {
    const was = oldItems.get(key);
    if (!was || was.s === LOOKS || now.s === LOOKS || unnamed(now)) continue;
    const rows = [];
    const push = (kind, before, after) => rows.push({ id: now.id, n: now.n, kind, before, after });
    // 舊的是空的＝資料補齊，不是改版，不列；新的變空的（拿掉）照列
    if (was.n !== now.n && !unnamed(was)) push("名稱", was.n, now.n);
    const dBefore = cleanDesc(was.d);
    const dAfter = cleanDesc(now.d);
    if (dBefore !== dAfter) push("說明", dBefore, dAfter);
    const spBefore = shopText(was.sp);
    const spAfter = shopText(now.sp);
    if (spBefore !== spAfter && spBefore !== "沒賣" && shopPrices(was.sp) !== shopPrices(now.sp)) push("商店", spBefore, spAfter);
    const dmBefore = dropText(was.dm, oldMon);
    const dmAfter = dropText(now.dm, newMon);
    if (dmBefore !== dmAfter && dmBefore !== "沒有") push("掉落", dmBefore, dmAfter);
    const eqKeys = statChangedKeys(was.eq, now.eq);
    if (eqKeys.length && eqKeys.some(k => was.eq?.[k] !== undefined)) push("能力", statText(was.eq, eqKeys), statText(now.eq, eqKeys));
    if (rows.length) {
      changedItems++;
      changed.push(...rows);
    }
  }

  for (const [key, q] of newQuests) {
    if (oldQuests.has(key)) continue;
    const row = { id: q.id, n: q.n, cat: q.cat };
    if (q.minLv !== undefined) row.minLv = q.minLv;
    row.area = q.cat;
    added.quests.push(row);
  }
  for (const [key, q] of oldQuests) if (!newQuests.has(key)) gone.quests.push({ id: q.id, n: q.n });

  for (const [key, m] of newMon) if (!oldMon.has(key)) added.monsters.push({ id: m.id, n: m.n, lv: m.lv });

  const oldMaps = oldData.maps ?? {};
  for (const [id, m] of Object.entries(newData.maps ?? {})) {
    if (!(id in oldMaps)) added.maps.push({ id, zh: m.zh, st: m.st });
  }

  return {
    counts: {
      items: added.items.length,
      looks,
      quests: added.quests.length,
      monsters: added.monsters.length,
      maps: added.maps.length,
      changed: changedItems,
      goneItems: gone.items.length,
      goneLooks,
      goneQuests: gone.quests.length,
    },
    added,
    changed,
    gone,
  };
}
