import type { Metadata } from "next";
import Link from "next/link";
import { Sprite } from "@/components/route/bits";

export const metadata: Metadata = {
  title: "查資料｜怪物、道具、任務、技能、練功排行",
  description: "新楓之谷經典版資料查詢：怪物數值與掉落、道具、任務條件與獎勵、技能逐級數值，以及依等級排的練功地圖、可接任務、打寶地點。",
  alternates: { canonical: "/db" },
};

const LOOKUPS = [
  { href: "/db/monsters", title: "怪物", lead: "數值、抗性、在哪出沒、掉什麼", image: "/assets/monster_frames/100100.png" },
  { href: "/db/items", title: "道具", lead: "裝備能力、誰會掉、哪個任務要", image: "/assets/items/1302020.png" },
  { href: "/db/quests", title: "任務", lead: "找誰接、要交什麼、拿多少", image: "/assets/npcs/1092000.png" },
  { href: "/db/skills", title: "技能", lead: "每一級的實際數值", image: "/assets/skills/1001004.png" },
];

const TOOLS = [
  { href: "/plan/train", title: "練功地圖排行", lead: "照等級排出所有值得去的圖，看刷怪點、回生、命中需求", image: "/assets/monster_frames/3230101.png" },
  { href: "/plan/damage", title: "傷害計算機", lead: "兩套點法、兩把武器並排，看打怪差多少、哪些怪一下打得死", image: "/assets/skills/4001344.png" },
  { href: "/plan/quest", title: "現在能接的任務", lead: "這個等級接得到的全部任務，快過期的排前面", image: "/assets/npcs/1012100.png" },
  { href: "/plan/farm", title: "想要的東西去哪打", lead: "勾幾樣道具，排出一趟收最多的地圖", image: "/assets/items/4000013.png" },
  { href: "/plan/bundle", title: "任務打包", lead: "要跑同一張圖的任務併成一趟，數量直接加總", image: "/assets/items/2000000.png" },
  { href: "/guide", title: "月妙、超綠組隊圖解", lead: "種子怎麼種、答題表、跳桶位置", image: "/assets/npcs/1012112.png" },
];

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
        <h2 className="px-1 text-sm font-bold ink-soft">圖鑑</h2>
        <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {LOOKUPS.map(entry => (
            <li key={entry.href}>
              <Link href={entry.href} className="flex h-full flex-col items-center gap-1.5 rounded-[var(--radius-card)] glass wood-frame p-3.5 text-center transition-transform hover:-translate-y-0.5">
                <span className="grid size-14 place-items-center rounded-2xl bg-[color:var(--paper-deep)]">
                  <Sprite src={entry.image} size={40} />
                </span>
                <span className="text-[16px] font-black">{entry.title}</span>
                <span className="text-[12px] leading-snug ink-soft">{entry.lead}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="排行與規劃" className="space-y-2">
        <h2 className="px-1 text-sm font-bold ink-soft">排行與規劃</h2>
        <ul className="space-y-2">
          {TOOLS.map(entry => (
            <li key={entry.href}>
              <Link href={entry.href} className="flex items-center gap-3 rounded-[var(--radius-card)] glass wood-frame p-3 transition-transform hover:-translate-y-0.5">
                <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-[color:var(--paper-deep)]">
                  <Sprite src={entry.image} size={34} />
                </span>
                <span className="min-w-0">
                  <span className="block font-bold">{entry.title}</span>
                  <span className="block text-[13px] leading-snug ink-soft">{entry.lead}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
