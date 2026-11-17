// 每日影片（v2.35）：正式站頁面的字（main.innerText）→ 事實 → 稿子。只用頁面上看得到的東西，不編。
// 「在哪打」：/db/monsters/<id>；「怎麼去」：/go?to=<圖>&from=<出發城鎮>。

const lines = (text) => String(text).replace(/\r/g, "").split("\n").map((l) => l.trim()).filter(Boolean);
const num = (s) => Number(String(s).replace(/,/g, ""));
const fmt = (n) => n.toLocaleString("en-US");

/** 怪物頁 → { name, lv, hp, exp, undead, weak[], maps:[{name,n}], mapCount, drops[] } */
export function parseMob(text) {
  const L = lines(text);
  const after = (label) => L[L.indexOf(label) + 1];
  const i = L.indexOf("等級");
  if (i < 1) throw new Error("怪物頁讀不到等級");
  const name = L[i - 1];
  const res = after("屬性抗性") ?? "";
  const weak = res.startsWith("出沒地圖") ? [] : [...res.matchAll(/([^、\s]+?)弱點/g)].map((m) => m[1]);
  const maps = [];
  const mi = L.findIndex((l) => l.startsWith("出沒地圖"));
  const mapCount = mi >= 0 ? num((L[mi].match(/（(\d+) 張）/) || [])[1] || 0) : 0;
  if (mi >= 0) {
    for (let k = mi + 1; k + 1 < L.length; k += 2) {
      const m = L[k + 1].match(/^([\d,]+) 個刷怪點$/);
      if (!m) break;
      maps.push({ name: L[k], n: num(m[1]) });
    }
  }
  const di = L.findIndex((l) => l.startsWith("掉落物（"));
  const drops = [];
  if (di >= 0) for (let k = di + 1; k < L.length && !L[k].startsWith("一鍵帶路"); k++) drops.push(L[k]);
  const dropCount = di >= 0 ? num((L[di].match(/（(\d+) 樣/) || [])[1] || drops.length) : 0;
  return {
    name,
    lv: num(after("等級")),
    hp: num(after("HP")),
    exp: num(after("經驗")),
    undead: after("不死") === "是",
    weak,
    maps,
    mapCount: mapCount || maps.length,
    drops,
    dropCount,
  };
}

/** 導航頁 → { from, to, steps:[{map, say}] }；say 是頁面那句（「走最右邊的傳送門」「跟…說話，他會送你到」），不含「往 X」 */
export function parseGo(text) {
  const L = lines(text);
  const from = L[L.indexOf("從哪裡出發") + 1];
  const to = L[L.indexOf("要去哪裡") + 1];
  const steps = [];
  for (let k = 0; k < L.length; k++) {
    const m = L[k].match(/^(走.*傳送門)，往 (.+)$/) || L[k].match(/^(跟.+說話，他會送你到) (.+)$/);
    if (!m) continue;
    // 往回找這一段的圖名：步驟編號後面那行
    let j = k - 1;
    while (j > 0 && !/^\d+$/.test(L[j - 1])) j--;
    steps.push({ map: L[j], say: m[1], next: m[2] });
  }
  if (!from || !to || !steps.length) throw new Error("導航頁讀不到路線");
  return { from, to, steps };
}


/** 「在哪打」稿子：Shorts 第一句就給答案 */
export function mobScript(f, { link }) {
  const [a, b, c] = f.maps;
  if (!a) throw new Error(`${f.name} 沒有出沒地圖`);
  const ratio = b ? a.n / b.n : 0;
  const lead = `${f.name}最多在${a.name}，${fmt(a.n)} 個刷怪點` + (ratio >= 1.8 ? `，差不多是第 2 名的 ${Math.round(ratio)} 倍。` : "。");
  const rest = b
    ? `第 2 名是${b.name} ${fmt(b.n)} 個` + (c ? `，第 3 名是${c.name} ${fmt(c.n)} 個` : "") + `，一共出現在 ${f.mapCount} 張圖。`
    : `牠只出現在這 1 張圖。`;
  const traits = [f.undead ? "不死系" : "", f.weak.length ? `怕${f.weak.join("、")}屬性` : ""].filter(Boolean);
  const stat = `牠是 ${f.lv} 等、HP ${fmt(f.hp)}、經驗 ${fmt(f.exp)}` + (f.undead ? "，而且是不死系" : "") + (f.weak.length ? `，怕${f.weak.join("、")}屬性。` : "。");
  // 道具名可能自己有頓號（褲、裙防禦卷軸10%），一律加「」
  const pick = pickDrops(f.drops).map((d) => `「${d}」`);
  const drop = f.dropCount ? `掉落物有 ${f.dropCount} 樣，像${pick.join("")}，官方沒有公開機率。` : "";
  const cta = "每一隻怪哪張圖最多，楓谷幫手都排好了，按一下就帶路到刷怪點。";
  const body = [lead, rest, stat, drop].filter(Boolean);
  const top5 = f.maps.slice(0, 5).map((m) => `${m.name} ${fmt(m.n)} 個`).join("、");
  return {
    title: `${f.name} 在哪打`,
    subtitle: `最多在${a.name}`,
    ticker: [`最多：${a.name} ${fmt(a.n)} 個刷怪點`, b ? `第 2：${b.name} ${fmt(b.n)} 個` : `只在這 1 張圖`, `Lv.${f.lv}、HP ${fmt(f.hp)}、經驗 ${fmt(f.exp)}`, "maplehelper.tw"],
    cards: [],
    narration: [...body, cta, "網址在說明欄，打開就能查。"],
    shortsNarration: [...body, cta],
    ytTitle: `楓之谷經典版 ${f.name}在哪打？最多在${a.name}，${fmt(a.n)} 個刷怪點`,
    description: [
      `${f.name}（Lv.${f.lv}、HP ${fmt(f.hp)}、經驗 ${fmt(f.exp)}${traits.length ? `，${traits.join("、")}` : ""}）出沒 ${f.mapCount} 張圖，刷怪點最多：${top5}。` +
        (f.dropCount ? `掉落物 ${f.dropCount} 樣（官方未公開機率），含${pick.join("")}。` : ""),
      "每隻怪哪張圖最多、一鍵帶路到刷怪點",
    ].join("\n"),
    link,
    site: { title: `${f.name}在哪打？`, summary: `最多在${a.name}（${fmt(a.n)} 個刷怪點），一共出現在 ${f.mapCount} 張圖。` },
    images: ["top", "maps", "stats", "drops"],
  };
}

/** 掉落物挑 3 樣講：卷軸、怪物卡先講，不夠用頁面最前面的（裝備排在前面）補；藥水、箭矢這類不講 */
export function pickDrops(drops) {
  const score = (d) => (/卷軸/.test(d) ? 2 : /卡$/.test(d) ? 1 : 0);
  const usable = drops.map((d, i) => ({ d, i, s: score(d) })).filter((x) => !/藥水|箭矢|道符|飛鏢|母礦|蘋果/.test(x.d));
  const top = usable.filter((x) => x.s > 0).sort((x, y) => y.s - x.s || x.i - y.i).slice(0, 3);
  for (const x of usable) if (top.length < 3 && !top.includes(x)) top.push(x);
  return top.sort((x, y) => x.i - y.i).map((x) => x.d);
}

/** 「怎麼去」稿子：每段一句 */
export function goScript(f, { link }) {
  const n = f.steps.length;
  const lead = `${f.to}怎麼去？從${f.from}出發，一共 ${n} 段、經過 ${n + 1} 張圖。`;
  const say = (s) => (s.say.startsWith("跟") ? `${s.say}${s.next}` : `${s.say}，到${s.next}`);
  const steps = f.steps.map((s, i) => `第 ${i + 1} 段，在${s.map}${say(s)}。`);
  steps[n - 1] = steps[n - 1].replace(/，到(.+)。$/, "，就到$1了。");
  const cta = "每一段要走哪個門，楓谷幫手的地圖導航都在圖上圈好了。";
  const route = [f.from, ...f.steps.map((s) => s.next)].join(" → ");
  return {
    title: `${f.to} 怎麼去`,
    subtitle: `從${f.from} ${n} 段走到`,
    ticker: [`${f.from}出發`, `共 ${n} 段、${n + 1} 張圖`, "每段圈好要走的門", "maplehelper.tw"],
    cards: [],
    narration: [lead, ...steps, cta, "出發點不一樣也沒關係，改成你在的地方，路線馬上重排。"],
    shortsNarration: [lead, ...steps, cta],
    ytTitle: `楓之谷經典版 ${f.to}怎麼去？從${f.from} ${n} 段走到，每段走哪個門`,
    description: [`${route}，共 ${n} 段、經過 ${n + 1} 張圖：` + f.steps.map((s, i) => `第 ${i + 1} 段在${s.map}${say(s)}`).join("；") + "。", "出發點改成你在的地方，路線馬上重排"].join("\n"),
    link,
    site: { title: `${f.to}怎麼去？`, summary: `從${f.from}出發 ${n} 段、經過 ${n + 1} 張圖，每段走哪個門。` },
    images: ["route", ...f.steps.map((_, i) => `s${i + 1}`)],
  };
}

/** 念法：Ⅰ～Ⅴ 念成一～五、地鐵二號線[地區02] 念「地鐵二號線 地區2」、70% 念「70趴」、2,100 念 2100 */
export function spokenFix(t) {
  return String(t)
    .replace(/\[([^\]]+)\]/g, " $1 ").replace(/(\D)0(\d)/g, "$1$2")
    .replace(/Ⅰ/g, "一").replace(/Ⅱ/g, "二").replace(/Ⅲ/g, "三").replace(/Ⅳ/g, "四").replace(/Ⅴ/g, "五")
    .replace(/(\d+)%/g, "$1趴").replace(/(\d),(\d{3})/g, "$1$2");
}
