import { itemImage } from "@/lib/asset-paths";
import { itemPagePath } from "@/lib/item-page";
import type { AddedGroup } from "@/lib/patch-view";

const TYPE_NAME = { item: "道具", quest: "任務", monster: "", map: "" } as const;

/** 收合的一組：標題列＋數字＋箭頭，打開才畫內容（關著的 <details> 裡的 lazy 圖不會載） */
export function Fold({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <details className="group border-t" style={{ borderColor: "var(--paper-edge)" }}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 py-2 text-[15px] font-bold [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">
          {title} <span className="ink-soft font-normal">{count}</span>
        </span>
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" className="flex-none transition-transform group-open:rotate-180">
          <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="2" fill="none" />
        </svg>
      </summary>
      <div className="pb-2.5">{children}</div>
    </details>
  );
}

function ItemName({ id, n, page }: { id: number; n: string; page: boolean }) {
  return page ? <a href={itemPagePath(id)} className="underline-offset-2 hover:underline">{n}</a> : <>{n}</>;
}

/** 全部新東西：每組一個收合；道具有圖就放圖、有單獨頁就連 */
export function AddedGroups({ groups, hasIcon, hasPage }: { groups: AddedGroup[]; hasIcon: (id: number) => boolean; hasPage: (id: number) => boolean }) {
  return (
    <div className="mt-1.5">
      {groups.map(g => {
        const prefix = TYPE_NAME[g.type];
        const title = prefix ? `${prefix}・${g.label}` : g.label;
        return (
          <Fold key={`${g.type}-${g.label}`} title={title} count={g.count}>
            {g.type === "item" ? (
              <ul className="grid gap-1.5 sm:grid-cols-2">
                {g.rows.map(i => (
                  <li key={i.id} className="flex min-w-0 items-center gap-2 text-sm">
                    {hasIcon(i.id) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={itemImage(i.id)} alt="" width={28} height={28} loading="lazy" className="flex-none" style={{ width: 28, height: 28, objectFit: "contain", imageRendering: "pixelated" }} />
                    ) : (
                      <span className="flex-none" style={{ width: 28, height: 28 }} aria-hidden="true" />
                    )}
                    <span className="min-w-0 truncate">
                      <ItemName id={i.id} n={i.n} page={hasPage(i.id)} />
                      {i.lv ? <span className="ink-soft">　Lv.{i.lv}</span> : null}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <ul className="grid gap-1 text-sm sm:grid-cols-2">
                {g.type === "quest" && g.rows.map(q => (
                  <li key={q.id} className="min-w-0 truncate">{q.n}{q.minLv ? <span className="ink-soft">　Lv.{q.minLv}</span> : null}</li>
                ))}
                {g.type === "monster" && g.rows.map(m => (
                  <li key={m.id} className="min-w-0 truncate">{m.n}<span className="ink-soft">　Lv.{m.lv}</span></li>
                ))}
                {g.type === "map" && g.rows.map(m => (
                  <li key={m.id} className="min-w-0 truncate">{m.zh}{m.st ? <span className="ink-soft">　{m.st}</span> : null}</li>
                ))}
              </ul>
            )}
          </Fold>
        );
      })}
    </div>
  );
}
