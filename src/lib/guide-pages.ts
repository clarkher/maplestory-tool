import type { GuideCard } from "./guide-catalog";
import { GUIDE_UPDATED_AT } from "./guide-data";
import { HALLOWEEN } from "./halloween";

/** 站上本來就有、不是文章檔的攻略頁；圖在 public/assets/guides/<資料夾>/hero.webp（scripts/guide-card-heroes.mjs 產） */
export const GUIDE_PAGES: GuideCard[] = [
  {
    href: "/event/halloween",
    title: "楓之谷經典版萬聖節任務攻略：雪原的面具祭典",
    excerpt: "三章任務照順序列好，要打的怪附地圖，每日任務怎麼拿禮物箱也寫了。",
    image: "/assets/guides/halloween/hero.webp",
    imageAlt: "楓之谷經典版萬聖節面具祭典，雪地夜晚的南瓜燈與紅鬃白狼人",
    category: "活動",
    tags: ["活動", "萬聖節"],
    date: HALLOWEEN.chapters[2].opens.slice(0, 10),
    event: "halloween",
  },
  {
    href: "/guide",
    title: "楓之谷經典版 1–30 懶人包：新手任務、轉職到超綠",
    excerpt: "新手任務 → 轉職 → 月妙刷到 21 → 超綠刷到 30，五大職業轉職去哪、點什麼技能。",
    image: "/assets/guides/guide-1-30/hero.webp",
    imageAlt: "楓之谷經典版新手冒險，從楓之島出發的冒險家",
    category: "新手入門",
    tags: ["新手", "1～30 等", "一轉"],
    date: GUIDE_UPDATED_AT,
  },
  {
    href: "/guide#pq-moon",
    title: "楓之谷經典版月妙組隊任務圖解",
    excerpt: "種子怎麼種、要幾個人、打到幾等，一張圖看懂。",
    image: "/assets/guides/pq-moon/hero.webp",
    imageAlt: "楓之谷經典版月妙組隊任務，滿月下的月妙",
    category: "組隊任務",
    tags: ["組隊", "10～21 等"],
    date: GUIDE_UPDATED_AT,
  },
  {
    href: "/guide#pq-kerning",
    title: "楓之谷經典版超綠組隊任務圖解",
    excerpt: "答題表、跳桶位置，一關一關照著做。",
    image: "/assets/guides/pq-kerning/hero.webp",
    imageAlt: "楓之谷經典版超綠組隊任務，綠水靈與組隊任務 NPC",
    category: "組隊任務",
    tags: ["組隊", "21～30 等"],
    date: GUIDE_UPDATED_AT,
  },
];
