import { itemImage } from "@/lib/asset-paths";
import { itemPagePath } from "@/lib/item-page";
import { numberDiff, type DiffPart } from "@/lib/patch-view";

/** 伺服器先算好：icon＝有沒有圖、page＝有沒有道具單獨頁 */
export type ChangedRowView = { id: number; n: string; kind: string; before: string; after: string; icon: boolean; page: boolean };

/** 一開始露出幾列；其他列也在 HTML 裡，靠 ChangedList 的 CSS 藏 */
export const FIRST = 3;
/** 說明很長時，沒改的那段只留靠近改動的這麼多字 */
const KEEP = 14;

function clipSame(parts: DiffPart[]): DiffPart[] {
  return parts.map((p, i) => {
    if (p.t !== "same") return p;
    const chars = Array.from(p.v);
    if (chars.length <= KEEP * 2) return p;
    if (i === 0) return { t: "same", v: `…${chars.slice(-KEEP).join("")}` };
    return { t: "same", v: `${chars.slice(0, KEEP).join("")}…` };
  });
}

function Diff({ before, after }: { before: string; after: string }) {
  const parts = clipSame(numberDiff(before, after));
  return (
    <>
      {parts.map((p, i) =>
        p.t === "same" ? (
          <span key={i}>{p.v}</span>
        ) : p.t === "del" ? (
          <del key={i} className="ink-soft" style={{ textDecorationThickness: 1 }}>{p.v}</del>
        ) : (
          <span key={i}>
            {parts[i - 1]?.t === "del" ? <span aria-hidden="true"> → </span> : null}
            <ins className="font-bold no-underline" style={{ color: "var(--ink)", background: "var(--maple-wash)", borderRadius: 2 }}>{p.v}</ins>
          </span>
        ),
      )}
    </>
  );
}

function Row({ row, rest }: { row: ChangedRowView; rest: boolean }) {
  const name = row.page ? (
    <a href={itemPagePath(row.id)} className="underline-offset-2 hover:underline">{row.n}</a>
  ) : (
    row.n
  );
  return (
    <li data-kind={row.kind} data-rest={rest ? "" : undefined} className="flex gap-2.5 border-t py-2.5" style={{ borderColor: "var(--paper-edge)" }}>
      {row.icon ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={itemImage(row.id)} alt="" width={32} height={32} loading="lazy" className="mt-0.5 flex-none" style={{ width: 32, height: 32, objectFit: "contain", imageRendering: "pixelated" }} />
      ) : (
        <span className="mt-0.5 flex-none" style={{ width: 32, height: 32 }} aria-hidden="true" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="min-w-0 truncate text-[15px] font-bold">{name}</span>
          <span className="ink-soft inline-flex h-5 flex-none items-center px-1.5 text-xs font-bold" style={{ borderRadius: 4, background: "var(--paper-deep)" }}>{row.kind}</span>
        </div>
        <p className="ink-soft mt-0.5 break-words text-[13px] leading-relaxed">
          {row.kind === "說明" ? (
            <Diff before={row.before} after={row.after} />
          ) : (
            <>
              {row.before || "（沒有）"} → <b style={{ color: "var(--ink)" }}>{row.after || "（沒有）"}</b>
            </>
          )}
        </p>
      </div>
    </li>
  );
}

/** 全部列都在伺服器畫好（client 不收列資料）；第 FIRST 列以後標 data-rest */
export function ChangedRows({ rows }: { rows: ChangedRowView[] }) {
  return (
    <ul data-changed-rows="" className="order-2 mt-1">
      {rows.map((r, i) => <Row key={`${r.kind}-${r.id}-${i}`} row={r} rest={i >= FIRST} />)}
    </ul>
  );
}
