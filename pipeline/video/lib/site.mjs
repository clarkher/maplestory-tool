// 公告對到站內哪一頁，以及說明欄連結的 UTM
const PAGES = [
  { path: "/plan/leaf", title: "楓葉武器衝卷規劃器", keywords: ["楓葉商會"],
    summary: "每天該換什麼、衝到幾攻的機會、去哪打幣，一頁幫你排好。" },
  { path: "/plan/avatar", title: "紙娃娃", keywords: ["轉蛋", "美容院", "彗星", "商城"],
    summary: "新外觀穿在自己的角色上先看看，再決定要不要買。" },
  { path: "/guides", title: "攻略", keywords: ["活動", "祭典", "週年"],
    summary: "活動怎麼玩、先做什麼最划算，整理成好讀的攻略。" },
  { path: "/updates", title: "改版整理", keywords: ["改版", "更新"],
    summary: "這次改了什麼，哪些跟你的角色有關，一次看完。" },
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
