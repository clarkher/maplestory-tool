import type { Metadata } from "next";
import { liveShapeIds } from "@/lib/rename/share-pages";
import { withOpenGraph } from "@/lib/seo";
import { staticMonsters } from "@/lib/static-data";
import { RenameGame } from "./RenameGame";

export const metadata: Metadata = withOpenGraph({
  title: "名字變怪物｜簽上你的 ID，看你會變成哪一隻怪",
  description: "在冒險者登記書簽上你的 ID，多的筆畫被收走，留下的拼成一隻楓之谷經典版的怪物。寫的字只在你的手機上算。",
  alternates: { canonical: "/plan/rename" },
});

export default function Page() {
  return (
    <div className="mx-auto max-w-2xl space-y-3.5 py-3 sm:py-6">
      <header>
        <h1 className="text-[26px] font-black tracking-tight sm:text-[32px]">名字變怪物</h1>
      </header>
      <RenameGame where={liveShapeIds(staticMonsters().map(m => m.id))} />
    </div>
  );
}
