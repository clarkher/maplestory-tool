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

/** 怪物：等級、HP、經驗，再寫刷怪點最多的三張開放地圖 */
export function monsterSummary(monster: Monster, maps: Record<string, MapRecord>): string {
  const head = monster.lv ? `${monster.n}是 Lv.${monster.lv} 的怪物` : monster.n;
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
