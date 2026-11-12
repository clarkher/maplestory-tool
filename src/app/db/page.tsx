import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "@/components/Icons";
import { Sprite } from "@/components/route/bits";
import { withOpenGraph } from "@/lib/seo";

export const metadata: Metadata = withOpenGraph({
  title: "查資料｜怪物、道具、任務、技能、練功排行",
  description: "新楓之谷經典版資料查詢：怪物數值與掉落、道具、任務條件與獎勵、技能逐級數值、每張地圖的怪物與 NPC、NPC 商店，以及依等級排的練功地圖、可接任務、打寶地點。",
  alternates: { canonical: "/db" },
});

const LOOKUPS = [
  { href: "/db/monsters", title: "怪物", lead: "數值、抗性、在哪出沒、掉什麼", image: "/assets/monster_frames/100100.png" },
  { href: "/db/items", title: "道具", lead: "裝備能力、誰會掉、哪個任務要", image: "/assets/items/1302020.png" },
  { href: "/db/quests", title: "任務", lead: "找誰接、要交什麼、拿多少", image: "/assets/npcs/1092000.png" },
  { href: "/db/skills", title: "技能", lead: "每一級的實際數值", image: "/assets/skills/1001004.png" },
  { href: "/db/maps", title: "地圖", lead: "有哪些怪、各幾隻、NPC、門通哪", image: "/assets/map_marks/Henesys.png" },
  { href: "/db/npcs", title: "NPC", lead: "在哪、賣什麼、有哪些任務", image: "/assets/npcs/1012100.png" },
];

const TOOLS = [
  { href: "/plan/train", title: "練功地圖排行", lead: "照等級排出所有值得去的圖，看刷怪點、回生、命中需求", image: "/assets/monster_frames/3230101.png" },
  { href: "/plan/boss", title: "野王計時", lead: "打死就記，算哪個頻道快出了，可以開房間跟隊友一起記", image: "/assets/monster_frames/6130101.png" },
  { href: "/future", title: "未來視", lead: "下一版大概何時開、會開什麼，現在該先囤哪些材料", image: "/assets/items/4031348.png" },
  { href: "/plan/damage", title: "傷害計算機", lead: "兩套點法、兩把武器並排，看打怪差多少、哪些怪一下打得死", image: "/assets/skills/4001344.png" },
  { href: "/plan/quest", title: "現在能接的任務", lead: "這個等級接得到的全部任務，快過期的排前面", image: "/assets/npcs/1012100.png" },
  { href: "/plan/farm", title: "想要的東西去哪打", lead: "勾幾樣道具，排出一趟收最多的地圖", image: "/assets/items/4000013.png" },
  { href: "/plan/bundle", title: "任務打包", lead: "要跑同一張圖的任務併成一趟，數量直接加總", image: "/assets/items/2000000.png" },
  { href: "/plan/buy", title: "拍賣買齊就能交的任務", lead: "不用打怪，買齊東西直接交，看拿多少經驗、什麼獎勵", image: "/assets/items/4000031.png" },
  { href: "/guide", title: "月妙、超綠組隊圖解", lead: "種子怎麼種、答題表、跳桶位置", image: "/assets/npcs/1012112.png" },
];

const MARKET = [
  { href: "/price/fx", title: "楓幣匯率", lead: "雪吉拉 1 億楓幣現在值多少台幣、每天怎麼變", image: "/assets/meso/bag.png" },
];

/** 小標：小字、粗、字距加寬（v1.99，跟單筆頁的 SeoSection 同一套） */
const LABEL = "px-1 text-[12px] font-black tracking-[0.1em] ink-faint";

/** 工具、行情：一張卡多列，列之間 1px 線、右邊箭頭（v1.99 照候選圖 A-db 的清單入口） */
function EntryList({ entries }: { entries: { href: string; title: string; lead: string; image: string }[] }) {
  return (
    <ul className="divide-y divide-[color:var(--paper-edge)] overflow-hidden rounded-[var(--radius-card)] glass">
      {entries.map(entry => (
        <li key={entry.href}>
          <Link href={entry.href} className="flex items-center gap-3 px-3.5 py-3 hover:bg-[color:var(--paper-deep)]">
            <span className="grid size-10 shrink-0 place-items-center rounded-md bg-[color:var(--paper-deep)]">
              <Sprite src={entry.image} size={30} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-bold">{entry.title}</span>
              <span className="block text-[13px] leading-snug ink-soft">{entry.lead}</span>
            </span>
            <ChevronRight size={16} className="shrink-0 ink-faint" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default function Page() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 py-4 sm:py-8">
      <header className="px-1">
        <h1 className="text-[26px] font-black tracking-tight sm:text-[32px]">查資料</h1>
        <p className="mt-1.5 text-[15px] leading-relaxed ink-soft">
          首頁的路線只挑最划算的幾個。想自己翻全部的地圖、任務、怪物，從這裡進。
        </p>
      </header>

      <section aria-label="圖鑑" className="space-y-2">
        <h2 className={LABEL}>圖鑑</h2>
        {/* 圖鑑：圖在左、字在右的橫卡（v1.99 照候選圖 A-db），手機一欄、電腦三欄 */}
        <ul className="grid gap-2.5 sm:grid-cols-3">
          {LOOKUPS.map(entry => (
            <li key={entry.href}>
              <Link href={entry.href} className="flex h-full items-center gap-3 rounded-[var(--radius-card)] glass p-3.5 hover:bg-[color:var(--paper-deep)]">
                <span className="grid size-11 shrink-0 place-items-center rounded-md bg-[color:var(--paper-deep)]">
                  <Sprite src={entry.image} size={32} />
                </span>
                <span className="min-w-0">
                  <span className="block text-[16px] font-black">{entry.title}</span>
                  <span className="block text-[12px] leading-snug ink-soft">{entry.lead}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="排行與規劃" className="space-y-2">
        <h2 className={LABEL}>排行與規劃</h2>
        <EntryList entries={TOOLS} />
      </section>

      <section aria-label="行情" className="space-y-2">
        <h2 className={LABEL}>行情</h2>
        <EntryList entries={MARKET} />
      </section>
    </div>
  );
}
