import type { Metadata } from "next";
import Link from "next/link";
import { hasItemIcon } from "@/lib/item-icons";
import { cardIcons, listPatchPages } from "@/lib/patches";
import { PatchCard } from "./PatchCard";

const TITLE = "楓之谷經典版改版紀錄：每次更新多了什麼";

export const metadata: Metadata = {
  title: { absolute: `${TITLE}｜楓谷幫手` },
  description: "新楓之谷經典版每次遊戲更新多了什麼：新道具、新任務、新怪物，照時間排，點進去看這次改了什麼。",
  alternates: { canonical: "/updates" },
};

export default function Page() {
  const pages = listPatchPages();
  return (
    <div className="mx-auto grid max-w-2xl gap-3.5 py-3 pb-7" style={{ gridTemplateColumns: "minmax(0,1fr)" }}>
      <header>
        <nav aria-label="麵包屑" className="ink-soft text-[13px] font-bold">
          <Link href="/guides" className="underline-offset-2 hover:underline">攻略</Link> › 改版整理
        </nav>
        <h1 className="mt-1.5 text-[25px] font-extrabold leading-tight tracking-tight">改版紀錄</h1>
        <p className="ink-soft mt-1.5 text-sm leading-relaxed">每次遊戲更新多了什麼，照時間排。</p>
      </header>
      {pages.length === 0 ? (
        <p className="ink-soft text-sm">改版整理整理中，晚點再來看。</p>
      ) : (
        pages.map((page, i) => <PatchCard key={page.version} page={page} icons={cardIcons(page, hasItemIcon)} latest={i === 0} />)
      )}
      <p className="ink-soft text-[13px] leading-relaxed">比的是更新前後的遊戲資料，不是官方公告；什麼時候開放、怎麼拿到，以遊戲內為準。</p>
    </div>
  );
}
