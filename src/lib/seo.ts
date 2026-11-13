/**
 * 給搜尋引擎跟 AI 讀的東西：每一頁開頭那段話、頁面描述、結構化資料（JSON-LD）。
 * 只用資料裡有的欄位組句子，沒有的那半句就不寫，不補猜的內容。
 */
import type { Metadata } from "next";
import { formatNumber } from "./format";
import { jobLabel } from "./item-view";
import { monsterMaps } from "./monster-view";
import type { GuideJob, MapRecord, Monster, Quest, Skill } from "./types";

export const SITE_URL = "https://maplehelper.tw";

// 玩家搜尋幾乎都帶「楓之谷經典版」（11/04 拍板 A）；各頁自己的標題不用再寫，模板會補
export const HOME_TITLE = "楓谷幫手｜楓之谷經典版 各職業升級路線、技能配點、必解任務";
export const TITLE_TEMPLATE = "%s｜楓之谷經典版｜楓谷幫手";
export const SITE_NAME = "楓谷幫手";
/** 頁面自己的 openGraph 會整包蓋掉 layout 的，要分享預覽圖的頁面把這包帶上 */
export const OG_BASE = { type: "website" as const, locale: "zh_TW", siteName: SITE_NAME, images: [{ url: "/og.jpg", width: 1200, height: 630, alt: SITE_NAME }] };

/**
 * 固定頁（工具頁、清單頁）的 metadata 補上自己的 openGraph：沒寫的頁會沿用 layout 那份，
 * 分享出去 og:title、og:url 都是首頁的（11/12 盤點 29 頁）。og 標題照單筆頁的寫法加站名，網址用 canonical。
 */
export function withOpenGraph<T extends Metadata & { title: string; description: string; alternates: { canonical: string } }>(meta: T): Metadata {
  return { ...meta, openGraph: { ...OG_BASE, title: `${meta.title}｜${SITE_NAME}`, description: meta.description, url: meta.alternates.canonical } };
}

/** 文章日期 YYYY-MM-DD 加上台灣時區：只寫日期的話，搜尋引擎照自己的時區讀，可能差一天。給 og、JSON-LD；sitemap 的 lastmod、畫面照舊寫日期 */
export const taiwanDateTime = (date: string) => `${date}T00:00:00+08:00`;

/** 全站 robots：max-image-preview:large 是 Google Discover 放大圖的條件 */
export const SITE_ROBOTS = { index: true, follow: true, "max-image-preview": "large" as const };

/** 頁面描述切在 150 字內：Google 搜尋結果大約只顯示這麼長 */
export function clip(text: string, max = 150): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

export function levelText(min?: number, max?: number): string | null {
  if (min && max) return min === max ? `Lv.${min}` : `Lv.${min}～${max}`;
  if (min) return `Lv.${min} 以上`;
  if (max) return `Lv.${max} 以下`;
  return null;
}

/** 玩家實際搜過、跟遊戲名不一樣的叫法（Search Console 11/13）；只收查得到的，不自己編 */
const NAME_NICKNAMES: Record<string, string[]> = { 王冠之地: ["皇冠之地"], 爸爸精靈: ["精靈爸爸"] };
const ROMAN = ["Ⅰ", "Ⅱ", "Ⅲ", "Ⅳ", "Ⅴ", "Ⅵ", "Ⅶ", "Ⅷ", "Ⅸ", "Ⅹ"];
const ROMAN_ASCII = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
const CHINESE_DIGITS = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];

/**
 * 同一張圖、同一隻怪玩家會換寫法搜：「巫婆森林ii」「巫婆森林2」「第一軍營」「精靈爸爸」。
 * 遊戲名的羅馬數字補阿拉伯數字（全形的再補英文字母），「第1」補「第一」，加上查得到的俗稱。
 */
export function nameAliases(name: string): string[] {
  const out: string[] = [];
  const roman = ROMAN.findIndex(char => name.endsWith(char));
  if (roman >= 0) {
    const base = name.slice(0, -1);
    out.push(`${base}${roman + 1}`, `${base}${ROMAN_ASCII[roman]}`);
  } else {
    // 中文後面接英文字母的羅馬數字（猴子森林I）
    const ascii = name.match(/^(.*[^\sA-Za-z])(I{1,3}|IV|V|VI{1,3}|IX|X)$/);
    if (ascii) out.push(`${ascii[1]}${ROMAN_ASCII.indexOf(ascii[2]) + 1}`);
  }
  const ordinal = name.match(/第(10|[1-9])/);
  if (ordinal) out.push(name.replace(ordinal[0], `第${CHINESE_DIGITS[Number(ordinal[1])]}`));
  out.push(...(NAME_NICKNAMES[name] ?? []));
  return [...new Set(out)].filter(alias => alias !== name);
}

/** 「（也叫巫婆森林2、巫婆森林II）」，沒有別名就是空字串 */
export function aliasNote(name: string): string {
  const aliases = nameAliases(name);
  return aliases.length ? `（也叫${aliases.join("、")}）` : "";
}

/**
 * 怪物頁標題：直接給答案（11/13 拍板 C）。原本「哪裡最多、在哪打、數值、掉落物」只是列項目，
 * 怪物頁點閱率 1.4% 全站最低；改成「嫩寶在哪打？最多在南方森林｜Lv.1、掉落物」。
 */
export function monsterTitle(monster: Monster, maps: Record<string, MapRecord>): string {
  const { rows } = monsterMaps(monster, maps);
  const tail = [monster.lv ? `Lv.${monster.lv}` : "", monster.drops.length ? "掉落物" : ""].filter(Boolean);
  if (!rows.length) return `${monster.n}｜${[monster.lv ? `Lv.${monster.lv} 數值` : "數值", monster.drops.length ? "掉落物" : ""].filter(Boolean).join("、")}`;
  const first = maps[String(rows[0].id)].zh;
  const where = rows[0].spawns ? `最多在${first}` : rows.length > 1 ? `${first}等 ${rows.length} 張圖` : first;
  return `${monster.n}在哪打？${where}${tail.length ? `｜${tail.join("、")}` : ""}`;
}

/**
 * 地圖頁標題：寫得出路線就給答案「巫婆森林Ⅱ怎麼去？從魔法森林走 6 張圖｜巫婆 27 隻」（11/13 拍板 C，地圖頁點閱率 1.8%）；
 * 寫不出路線（城鎮自己、走不到）就列有什麼。mobs 照數量多到少排好再傳進來。
 */
export function mapTitle(name: string, mobs: { n: string; k: number }[], route: { from: string; steps: number } | null): string {
  const [mob] = mobs;
  const mobText = mob ? `${mob.n} ${mob.k} 隻` : "";
  // 只隔一張圖寫「走 1 張圖」不像人話
  const how = route && (route.steps === 1 ? `就在${route.from}隔壁` : `從${route.from}走 ${route.steps} 張圖`);
  if (how) return `${name}怎麼去？${how}${mobText ? `｜${mobText}` : ""}`;
  return `${name}｜${mobText ? `${mobText}、` : "怪物、"}NPC、傳送門`;
}

/** 怪物：等級、HP、經驗，再寫刷怪點最多的三張開放地圖 */
export function monsterSummary(monster: Monster, maps: Record<string, MapRecord>): string {
  const name = `${monster.n}${aliasNote(monster.n)}`;
  const head = monster.lv ? `${name}是 Lv.${monster.lv} 的怪物` : name;
  const stats = `${head}，HP ${formatNumber(monster.hp)}、經驗 ${formatNumber(monster.exp)}。`;
  const { rows } = monsterMaps(monster, maps);
  if (!rows.length) return stats;
  const top = rows.slice(0, 3);
  // 玩家會搜「○○哪裡最多」：有刷怪點數字就照數字排給他看，沒有就只列圖名
  if (top[0].spawns) {
    const parts = top.map((row, index) => {
      const name = maps[String(row.id)].zh;
      if (!row.spawns) return name;
      return `${name}（${row.spawns} 個${index ? "" : "刷怪點"}）`;
    });
    return `${stats}哪裡最多：${parts.join("、")}，共 ${rows.length} 張圖。`;
  }
  const names = top.map(row => maps[String(row.id)].zh);
  return `${stats}出現在${names.join("、")}（共 ${rows.length} 張圖）。`;
}

/** 任務：分類、等級、誰接、要做什麼、給什麼 */
export function questSummary(quest: Quest): string {
  const level = levelText(quest.minLv, quest.maxLv);
  // 「Lv.8～13 可接」中間空一格，「Lv.30 以上可接」不用
  let text = `「${quest.n}」是${quest.cat}任務${level ? `，${level}${/以[上下]$/.test(level) ? "" : " "}可接` : ""}`;
  if (quest.sNpc) text += `，找${quest.sNpc.mapName ? `${quest.sNpc.mapName}的` : ""}${quest.sNpc.n}接`;
  text += "。";
  const mobs = (quest.needMobs ?? []).map(mob => `${mob.n}${mob.c ? ` ${mob.c} 隻` : ""}`);
  if (mobs.length) text += `要打${mobs.join("、")}。`;
  const items = (quest.needItems ?? []).map(item => `${item.n}${item.c ? ` ${item.c} 個` : ""}`);
  if (items.length) text += `要交${items.join("、")}。`;
  if (quest.exp) text += `完成給經驗 ${formatNumber(quest.exp)}。`;
  return text;
}

/** 技能：哪個職業、最高幾級，接遊戲說明第一句（拿掉「[等級上限：12]」這種前綴） */
export function skillSummary(skill: Skill): string {
  const job = jobLabel(skill.job) ?? skill.jobName;
  let text = `${skill.n}是${job}的技能`;
  if (skill.max) text += `，最高 ${skill.max} 級`;
  text += "。";
  const desc = skill.desc?.replace(/^\[[^\]]*\]\s*/, "").trim();
  if (desc) text += desc;
  return text;
}

/** 職業攻略頁：寫有幾段練功點，舉第一段當例子 */
/** 玩家搜的俗稱（Search Console 11/10：「標賊配點」「刀賊練等」），攻略資料的點法標題也這樣叫 */
const JOB_NICKNAMES: Record<number, string> = { 400: "標賊、刀賊", 410: "標賊", 420: "刀賊" };

/** 職業頁標題用的名字：一轉標「一轉」（玩家搜「法師一轉技能配點」），有俗稱補俗稱 */
export function jobTitleName(job: number, name: string): string {
  const tags = [job % 100 === 0 ? "一轉" : "", JOB_NICKNAMES[job] ?? ""].filter(Boolean);
  return tags.length ? `${name}（${tags.join("，")}）` : name;
}

/** 職業頁頁首結論：先挑不是「舊版」的第一套（經典版／台服的說法優先），都是舊版才用第一套；另外還有幾套 */
export function jobTopPick(guide: GuideJob): { label: string; order: string; others: number } | null {
  const builds = guide.builds.filter(build => build.steps.length);
  const pick = builds.find(build => !build.label.includes("舊版")) ?? builds[0];
  if (!pick) return null;
  return {
    label: pick.label,
    order: pick.steps.map(step => `${step.name} ${step.to}`).join(" → "),
    others: builds.length - 1,
  };
}

export function jobGuideSummary(guide: GuideJob): string {
  let text = `新楓之谷經典版${guide.name}怎麼練：素質怎麼配、技能點法、每個等級去哪練。`;
  const [first] = guide.train;
  if (first) {
    const level = first.from === first.to ? `Lv.${first.from}` : `Lv.${first.from}～${first.to}`;
    text += `整理了 ${guide.train.length} 段練功點，例如 ${level} ${first.name}。`;
  }
  return text;
}

/** 麵包屑：第一層固定是首頁 */
export function breadcrumbLd(trail: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [{ name: SITE_NAME, path: "/" }, ...trail].map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.name,
      item: `${SITE_URL}${crumb.path}`,
    })),
  };
}

/** 全站：網站本身 */
export function websiteLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: `${SITE_URL}/`,
    inLanguage: "zh-Hant-TW",
    description: "台服新楓之谷經典版的規劃工具：各職業升級路線、練功地圖、技能配點、必解任務、怪物與任務資料。",
  };
}

/** 攻略文：Discover、搜尋結果看的文章資料。作者、發布者都寫站本身，文章裡的寫手是虛構角色，不准填進來 */
export function articleLd({ headline, description, path, images, published, modified }: { headline: string; description: string; path: string; images: string[]; published: string; modified: string }) {
  const site = { "@type": "Organization", name: SITE_NAME, url: SITE_URL };
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline,
    description,
    image: images,
    datePublished: taiwanDateTime(published),
    dateModified: taiwanDateTime(modified),
    author: site,
    publisher: site,
    mainEntityOfPage: { "@type": "WebPage", "@id": `${SITE_URL}${path}` },
    inLanguage: "zh-Hant-TW",
  };
}

/** 單頁：這一頁是什麼、屬於哪個網站、資料什麼時候更新 */
export function webPageLd({ name, path, description, modified }: { name: string; path: string; description: string; modified?: string }) {
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name,
    url: `${SITE_URL}${path}`,
    description,
    inLanguage: "zh-Hant-TW",
    isPartOf: { "@type": "WebSite", name: SITE_NAME, url: `${SITE_URL}/` },
    ...(modified ? { dateModified: modified } : {}),
  };
}
