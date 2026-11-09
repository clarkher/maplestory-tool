import Link from "next/link";
import { itemImage } from "@/lib/asset-paths";
import type { PatchPage } from "@/lib/patches";

/** 「新道具 N、新任務 N、新怪物 N（怪名，最多 4 個）」；數字是 0 的不列 */
export function patchSummary(page: PatchPage): string {
  const parts: string[] = [];
  if (page.counts.items) parts.push(`新道具 ${page.counts.items}`);
  if (page.counts.quests) parts.push(`新任務 ${page.counts.quests}`);
  const mons = page.added.monsters;
  if (page.counts.monsters) {
    const names = mons.slice(0, 4).map(m => m.n).join("、");
    parts.push(`新怪物 ${page.counts.monsters}${names ? `（${names}${mons.length > 4 ? "…" : ""}）` : ""}`);
  }
  return parts.join("、");
}

/** 改版紀錄的一張卡：日期、版本號、重點檔標題、數字、6 格圖、連去細節（候選 D） */
export function PatchCard({ page, icons, latest }: { page: PatchPage; icons: number[]; latest: boolean }) {
  return (
    <section className="glass-solid min-w-0 p-3.5" style={{ borderRadius: "var(--radius-card)", ...(latest ? { borderColor: "var(--maple)" } : {}) }}>
      <div className="flex items-baseline justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[13px] font-bold" style={{ color: latest ? "var(--maple)" : "var(--ink-soft)" }}>{page.dateText}</div>
          <h2 className="mt-0.5 text-[18px] font-extrabold">{page.title}</h2>
        </div>
        <span className="inline-flex h-[22px] flex-none items-center whitespace-nowrap px-[7px] text-xs font-bold ink-soft" style={{ borderRadius: 4, background: "var(--paper-deep)" }}>{page.version}</span>
      </div>
      <p className="ink-soft mt-1.5 text-sm leading-relaxed">{patchSummary(page)}</p>
      {icons.length > 0 && (
        <div className="mt-2.5 grid grid-cols-6 gap-1.5" aria-hidden="true">
          {icons.map(id => (
            <div key={id} className="flex aspect-square items-center justify-center" style={{ borderRadius: 6, background: "var(--paper-deep)" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={itemImage(id)} alt="" width={30} height={30} loading="lazy" style={{ width: 30, height: 30, objectFit: "contain", imageRendering: "pixelated" }} />
            </div>
          ))}
        </div>
      )}
      <Link href={`/updates/${page.version}`} className="mt-2 inline-block text-sm font-bold" style={{ color: "var(--maple)" }}>看這次改了什麼 ›</Link>
    </section>
  );
}
