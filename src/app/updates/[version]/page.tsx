import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { itemImage } from "@/lib/asset-paths";
import { hasItemIcon } from "@/lib/item-icons";
import { itemPagePath } from "@/lib/item-page";
import { CHANGED_KIND_ORDER, addedGroups } from "@/lib/patch-view";
import { getPatchPage, listPatchPages, type PatchPage } from "@/lib/patches";
import { breadcrumbLd, clip, taiwanDateTime, webPageLd } from "@/lib/seo";
import { staticHasItemPage } from "@/lib/static-data";
import { patchSummary } from "../PatchCard";
import { AddedGroups, Fold } from "./AddedGroups";
import { ChangedList, type ChangedRowView } from "./ChangedList";

type Props = { params: Promise<{ version: string }> };

// 只出有重點檔的版本，其他 404（靜態輸出）
export const dynamicParams = false;

export function generateStaticParams() {
  return listPatchPages().map(page => ({ version: page.version }));
}

/** "10/15 收錄" → "10/15" */
const monthDay = (page: PatchPage) => page.dateText.replace(/\s*收錄$/, "");
const heading = (page: PatchPage) => `${monthDay(page)} 改版整理（${page.version}）`;
const pagePath = (page: PatchPage) => `/updates/${page.version}`;
const describe = (page: PatchPage) => clip(`${page.title}。${patchSummary(page)}`);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const page = getPatchPage((await params).version);
  if (!page) return {};
  const title = `楓之谷經典版 ${heading(page)}：${page.title}`;
  return {
    // 標題已寫「楓之谷經典版」，不套全站模板
    title: { absolute: `${title}｜楓谷幫手` },
    description: describe(page),
    alternates: { canonical: pagePath(page) },
    openGraph: { title: `${title}｜楓谷幫手`, description: describe(page), url: pagePath(page) },
  };
}

const cardStyle = { borderRadius: "var(--radius-card)" } as const;

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="glass-solid min-w-0 p-3.5" style={cardStyle}>
      <h2 className="text-[17px] font-extrabold tracking-tight">{title}</h2>
      {children}
    </section>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div className="p-2.5" style={{ borderRadius: 6, background: "var(--paper-deep)" }}>
      <div className="text-[22px] font-extrabold">{n.toLocaleString("en-US")}</div>
      <div className="ink-soft mt-0.5 text-xs">{label}</div>
    </div>
  );
}

/** 版本選單：只列有重點檔的版本；不用 JS，打開是連結清單 */
function VersionPicker({ current, pages }: { current: PatchPage; pages: PatchPage[] }) {
  const label = (p: PatchPage) => `${p.date.replace(/-/g, "/")} · ${p.version} ${p.title}`;
  return (
    <details className="group">
      <summary
        className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3 text-[15px] font-bold [&::-webkit-details-marker]:hidden"
        style={{ borderRadius: 6, border: "1px solid var(--paper-edge)", background: "var(--paper-deep)" }}
      >
        <span className="min-w-0 truncate">{label(current)}</span>
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" className="flex-none transition-transform group-open:rotate-180">
          <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="2" fill="none" />
        </svg>
      </summary>
      <ul className="mt-1.5 overflow-hidden" style={{ borderRadius: 6, border: "1px solid var(--paper-edge)" }}>
        {pages.map(p => (
          <li key={p.version} className="border-t first:border-t-0" style={{ borderColor: "var(--paper-edge)" }}>
            {p.version === current.version ? (
              <span aria-current="page" className="flex min-h-11 items-center px-3 text-sm font-bold" style={{ color: "var(--maple)", background: "var(--maple-wash)" }}>{label(p)}</span>
            ) : (
              <Link href={pagePath(p)} className="flex min-h-11 items-center px-3 text-sm font-bold hover:underline">{label(p)}</Link>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}

export default async function Page({ params }: Props) {
  const page = getPatchPage((await params).version);
  if (!page) notFound();
  const pages = listPatchPages();
  const path = pagePath(page);
  const order = CHANGED_KIND_ORDER as readonly string[];
  const rank = (k: string) => (order.includes(k) ? order.indexOf(k) : order.length);
  const changed: ChangedRowView[] = page.changed
    .map((c, i) => ({ c, i }))
    .sort((x, y) => rank(x.c.kind) - rank(y.c.kind) || x.i - y.i)
    .map(({ c }) => ({ id: c.id, n: c.n, kind: c.kind, before: c.before, after: c.after, icon: hasItemIcon(c.id), page: staticHasItemPage(c.id) }));
  const groups = addedGroups(page);
  const goneTotal = page.gone.items.length + page.gone.quests.length;

  return (
    <div className="mx-auto grid max-w-2xl gap-3.5 py-3 pb-7" style={{ gridTemplateColumns: "minmax(0,1fr)" }}>
      {[
        breadcrumbLd([{ name: "攻略", path: "/guides" }, { name: "改版整理", path: "/updates" }, { name: heading(page), path }]),
        webPageLd({ name: `楓之谷經典版 ${heading(page)}：${page.title}`, path, description: describe(page), modified: taiwanDateTime(page.date) }),
      ].map((data, i) => (
        // JSON 裡的 < 換掉，內容不會提早把 script 關掉
        <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />
      ))}

      <header>
        <nav aria-label="麵包屑" className="ink-soft text-[13px] font-bold">
          <Link href="/guides" className="underline-offset-2 hover:underline">攻略</Link> › <Link href="/updates" className="underline-offset-2 hover:underline">改版整理</Link>
        </nav>
        <h1 className="mt-1.5 text-[25px] font-extrabold leading-tight tracking-tight">{heading(page)}</h1>
        <p className="ink-soft mt-1.5 text-sm leading-relaxed">這次最值得看的 4 件事，下面再列全部新東西。</p>
      </header>

      <VersionPicker current={page} pages={pages} />

      <Card title="這次重點">
        <ul className="mt-1">
          {page.highlights.map(h => (
            <li key={`${h.icon}-${h.title}`} className="flex items-center gap-2.5 border-t py-2.5" style={{ borderColor: "var(--paper-edge)" }}>
              {hasItemIcon(h.icon) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={itemImage(h.icon)} alt="" width={32} height={32} className="flex-none" style={{ width: 32, height: 32, objectFit: "contain", imageRendering: "pixelated" }} />
              ) : (
                <span className="flex-none" style={{ width: 32, height: 32 }} aria-hidden="true" />
              )}
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-bold">
                  {staticHasItemPage(h.icon) ? <a href={itemPagePath(h.icon)} className="underline-offset-2 hover:underline">{h.title}</a> : h.title}
                </div>
                {h.sub ? <div className="ink-soft mt-0.5 text-[13px] leading-relaxed">{h.sub}</div> : null}
              </div>
              <span className="inline-flex h-[22px] flex-none items-center whitespace-nowrap px-[7px] text-xs font-bold" style={{ borderRadius: 4, color: "var(--sky)", background: "var(--sky-wash)" }}>客戶端資料</span>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="改了多少">
        <div className="mt-2.5 grid grid-cols-2 gap-2">
          <Stat n={page.counts.items} label="新道具（不含髮型臉型）" />
          <Stat n={page.counts.quests} label="新任務" />
          <Stat n={page.counts.monsters} label="新怪物" />
          <Stat n={page.counts.changed} label="道具說明或數值有改" />
        </div>
      </Card>

      {changed.length > 0 && (
        <Card title="說明改了的道具">
          <ChangedList rows={changed} />
        </Card>
      )}

      {(groups.length > 0 || page.counts.looks > 0) && (
        <Card title="全部新東西">
          <AddedGroups groups={groups} hasIcon={hasItemIcon} hasPage={staticHasItemPage} />
          {page.counts.looks > 0 && <p className="ink-soft border-t pt-2.5 text-[13px]" style={{ borderColor: "var(--paper-edge)" }}>另有髮型、臉型 {page.counts.looks.toLocaleString("en-US")} 款（不逐一列出）</p>}
        </Card>
      )}

      {(goneTotal > 0 || page.counts.goneLooks > 0) && (
        <Card title="站上不再列出">
          <p className="ink-soft mt-1 text-[13px] leading-relaxed">這些在新資料裡找不到，多半是還沒開放的地區；不代表遊戲裡刪掉了。</p>
          {page.counts.goneLooks > 0 && <p className="ink-soft mt-1 text-[13px]">另有髮型、臉型 {page.counts.goneLooks.toLocaleString("en-US")} 款</p>}
          <div className="mt-1.5">
            {page.gone.items.length > 0 && (
              <Fold title="道具" count={page.gone.items.length}>
                <p className="text-sm leading-relaxed">{page.gone.items.map(i => i.n).join("、")}</p>
              </Fold>
            )}
            {page.gone.quests.length > 0 && (
              <Fold title="任務" count={page.gone.quests.length}>
                <p className="text-sm leading-relaxed">{page.gone.quests.map(q => q.n).join("、")}</p>
              </Fold>
            )}
          </div>
        </Card>
      )}

      <p className="ink-soft text-[13px] leading-relaxed">比的是更新前後的遊戲資料，不是官方公告；什麼時候開放、怎麼拿到，以遊戲內為準。</p>
    </div>
  );
}
