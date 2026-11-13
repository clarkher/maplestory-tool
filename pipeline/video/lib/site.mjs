// 公告對到站內哪一頁，以及說明欄連結的 UTM
const PAGES = [
  { path: "/plan/leaf", title: "楓葉武器衝卷規劃器", keywords: ["楓葉商會"],
    summary: "每天該換什麼、衝到幾攻的機會、去哪打幣，一頁幫你排好。",
    cta: "每天換什麼、去哪打幣，楓谷幫手的楓葉規劃器幫你排好" },
  { path: "/plan/avatar", title: "紙娃娃", keywords: ["轉蛋", "美容院", "彗星", "商城"],
    summary: "新外觀穿在自己的角色上先看看，再決定要不要買。",
    cta: "想先看穿起來的樣子，楓谷幫手的紙娃娃可以直接試穿" },
  { path: "/guides", title: "攻略", keywords: ["活動", "祭典", "週年"],
    summary: "活動怎麼玩、先做什麼最划算，整理成好讀的攻略。",
    cta: "練功、任務攻略都整理在楓谷幫手網站" },
  { path: "/updates", title: "改版整理", keywords: ["改版", "更新"],
    summary: "這次改了什麼，哪些跟你的角色有關，一次看完。",
    cta: "每次改版改了什麼，楓谷幫手網站都有整理" },
];

export function sitePages() {
  return PAGES.map((p) => ({ ...p, keywords: [...p.keywords] }));
}

/** 標題命中優先，其次內文；都沒有回 null（呼叫端退回首頁） */
export function matchSitePage(title, text, pages) {
  const hit = (s) => pages.find((p) => p.keywords.some((k) => String(s ?? "").includes(k)));
  return hit(title) ?? hit(text) ?? null;
}

export function utmUrl(path, id) {
  return `https://maplehelper.tw${path}?utm_source=youtube&utm_medium=video&utm_campaign=announce-${id}`;
}

/** 對不到頁面時的結尾句 */
export const DEFAULT_CTA = "更多遊戲資料都在楓谷幫手網站";

// 模型不准提網站；萬一還是寫了，卡片後面的補充句、說明欄內文裡提到的整句拿掉
const MENTION = /楓谷幫手|網站|站內/;

/**
 * 結尾那句由程式加（不讓模型編網站有什麼）：正片、Shorts 最後一句、說明欄最後一行都是這頁的 cta。
 * 卡片配的那句（前 cards.length 句）不動，免得卡片跟旁白錯開。
 * @param {import("./facts.mjs").Script} script
 * @param {{cta?: string} | null} page
 */
export function withCta(script, page) {
  const cta = page?.cta ?? DEFAULT_CTA;
  const n = script.cards.length;
  const tail = (lines) => [...lines.filter((l, i) => i < n || !MENTION.test(l)), cta];
  const [first = "", ...body] = String(script.description ?? "").split("\n");
  return {
    ...script,
    narration: tail(script.narration),
    shortsNarration: tail(script.shortsNarration),
    description: [first, ...body.filter((l) => !MENTION.test(l)), cta].join("\n"),
  };
}
