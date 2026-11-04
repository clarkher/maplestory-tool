import Link from "next/link";
import { monsterImage } from "@/lib/asset-paths";
import { formatNumber } from "@/lib/format";
import { articleDamageHref, assumptionLines, hitLvText, TAG_LABEL, type ArticleAnswer, type CalcTable, type ClaimTag, type JobArticle } from "@/lib/job-article";
import type { MapRecord, Monster } from "@/lib/types";
import { SeoLinks, SeoPage } from "./SeoPage";

/**
 * 職業×等級攻略文（/jobs/<職業>/<起>-<迄>，v1.43）的畫面。文章已經換好代號（resolveArticle），這裡只排版；
 * 表、假設一律用算出來的 CalcTable，不另外寫數字。站上色票都是 CSS 變數，深淺色跟著主題走。
 */

/** 標籤的底跟字色（對比測試讀這張表） */
export const TAG_TONE: Record<ClaimTag, { wash: string; ink: string }> = {
  tw: { wash: "bg-[color:var(--leaf-wash)]", ink: "text-[color:var(--leaf)]" },
  community: { wash: "bg-[color:var(--maple-wash)]", ink: "text-[color:var(--maple)]" },
  legacy: { wash: "bg-[color:var(--gold-wash)]", ink: "text-[color:var(--gold)]" },
  calc: { wash: "bg-[color:var(--sky-wash)]", ink: "text-[color:var(--sky)]" },
  game: { wash: "bg-[color:var(--paper-deep)]", ink: "text-[color:var(--ink-soft)]" },
  official: { wash: "bg-[color:var(--paper-deep)]", ink: "text-[color:var(--ink)]" },
};

/** solid：放在有底色的框裡（先講結論）用實心底，洗色底疊上去深色模式對比不到 AA（社群整理曾經只有 4.08） */
function SourceTag({ tag, solid }: { tag: ClaimTag; solid?: boolean }) {
  const tone = TAG_TONE[tag];
  return <span className={`ml-1 inline-block whitespace-nowrap rounded-full px-2 align-[1px] text-[12px] font-bold leading-[1.5] ${solid ? "bg-[color:var(--paper)]" : tone.wash} ${tone.ink}`}>{TAG_LABEL[tag]}</span>;
}

function Heading({ children }: { children: React.ReactNode }) {
  return <h2 className="pt-2 text-lg font-black leading-snug sm:text-xl">{children}</h2>;
}

function Lines({ lines, ordered, solid, maps }: { lines: ArticleAnswer[]; ordered?: boolean; solid?: boolean; maps?: Record<string, MapRecord> }) {
  const List = ordered ? "ol" : "ul";
  return (
    <List className={`${ordered ? "list-decimal" : "list-disc"} space-y-1.5 pl-5`}>
      {lines.map((line, index) => (
        <li key={index}>
          {line.alt ? <span className="mr-1 font-bold">備案：</span> : null}
          {line.text}<SourceTag tag={line.tag} solid={solid} />
          {/* 網址跟步驟卡的帶我去同一種；字色跟著框裡的字（--sky 疊在結論框的洗色底上對比不保證到 AA）。inline-block：手機上整顆換行，不在字中間斷 */}
          {line.go !== undefined ? <Link href={`/go?to=${line.go}`} className="ml-1.5 inline-block font-bold underline decoration-[color:var(--ink-faint)] underline-offset-4">帶我去{maps?.[String(line.go)]?.zh}</Link> : null}
        </li>
      ))}
    </List>
  );
}

const NUMBER_CELL = "px-3 py-2 text-right tabular-nums";
const CALC_HEAD = "min-w-[4.75rem] whitespace-normal px-2.5 py-2 text-right align-bottom leading-tight";
/** 第一欄固定：捲到右邊還看得到是哪隻怪；要實心底，後面的數字才不會透過來 */
const STICKY_CELL = "sticky left-0 z-10";

/**
 * 計算表：表自己橫捲，頁面不橫捲；怪物圖用 monster_frames（單張靜止圖）。
 * 站上算的數字排在最前面（手機第一眼就看得到，這是每篇的賣點），怪物基本數值排後面。
 */
export function JobArticleTable({ table }: { table: CalcTable }) {
  const { assumptions, midLevel, rows } = table;
  const magic = assumptions.accuracy.kind === "magic";
  const heal = assumptions.targets !== null;
  return (
    <div className="space-y-1">
      <div className="scroll-x rounded-xl border border-[color:var(--paper-edge)] bg-[color:var(--paper)]">
      <table className="w-full border-collapse whitespace-nowrap text-sm">
        <thead className="bg-[color:var(--paper-deep)] text-left text-[13px] font-bold">
          <tr>
            <th scope="col" className={`${STICKY_CELL} bg-[color:var(--paper-deep)] px-3 py-2 align-bottom`}>怪</th>
            {heal ? <th scope="col" className={CALC_HEAD}>打 1 隻幾下<span className="block font-normal">Lv.{midLevel}</span></th> : null}
            <th scope="col" className={CALC_HEAD}>{heal ? `範圍 ${assumptions.targets} 隻幾下` : "幾下打死"}<span className="block font-normal">Lv.{midLevel}</span></th>
            <th scope="col" className={CALC_HEAD}>幾等不 MISS</th>
            <th scope="col" className="px-3 py-2 text-right align-bottom">等級</th>
            <th scope="col" className="px-3 py-2 text-right align-bottom">HP</th>
            <th scope="col" className="px-3 py-2 text-right align-bottom">{magic ? "魔防" : "物防"}</th>
            <th scope="col" className="px-3 py-2 text-right align-bottom">經驗</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.id} className="border-t border-[color:var(--paper-edge)]">
              <td className={`${STICKY_CELL} bg-[color:var(--paper)] px-2.5 py-1.5`}>
                <Link href={`/db/monsters/${row.id}`} className="inline-flex items-center gap-1.5 font-bold hover:text-[color:var(--maple)]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={monsterImage(row.id)} alt="" width={32} height={32} loading="lazy" className="h-8 w-8 shrink-0 object-contain" />
                  {row.name}
                </Link>
              </td>
              {heal ? <td className={NUMBER_CELL}>{row.hitsOne === null ? "算不出來" : `約 ${row.hitsOne}`}</td> : null}
              <td className={`${NUMBER_CELL} font-bold`}>{row.hits === null ? "算不出來" : `約 ${row.hits}`}</td>
              <td className={NUMBER_CELL}>{hitLvText(row, table)}</td>
              <td className={NUMBER_CELL}>{row.lv ?? "—"}</td>
              <td className={NUMBER_CELL}>{formatNumber(row.hp)}</td>
              <td className={NUMBER_CELL}>{formatNumber(row.def)}</td>
              <td className={NUMBER_CELL}>{formatNumber(row.exp)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      <p className="text-[13px] ink-soft md:hidden">表可以往右滑，看等級、HP、防禦、經驗。</p>
    </div>
  );
}

export function JobArticleView({
  jobName,
  rangeLabel,
  path,
  article,
  table,
  monsters,
  maps,
  dataNote,
  jsonLd,
}: {
  jobName: string;
  rangeLabel: string;
  path: string;
  /** 已經換好代號 */
  article: JobArticle;
  table: CalcTable;
  monsters: Map<number, Monster>;
  maps: Record<string, MapRecord>;
  /** 標題底下那行：這張表是哪一版遊戲資料算的 */
  dataNote: string;
  jsonLd: object[];
}) {
  const jobPath = path.slice(0, path.lastIndexOf("/"));
  return (
    <SeoPage
      trail={[{ name: "職業攻略", path: "/guide" }, { name: jobName, path: jobPath }, { name: rangeLabel, path }]}
      title={article.title}
      lead={dataNote}
      jsonLd={jsonLd}
    >
      <div className="space-y-1.5 rounded-xl bg-[color:var(--maple-wash)] p-3.5 text-[15px] leading-relaxed sm:p-4">
        <p className="text-sm font-bold text-[color:var(--maple)]">先講結論</p>
        <Lines lines={article.answer} ordered solid maps={maps} />
      </div>

      <p className="text-[15px] leading-relaxed">{article.intro}</p>

      <section className="space-y-2">
        <Heading>每個等級去哪裡</Heading>
        <ol>
          {article.steps.map((step, index) => (
            <li key={index} className="grid gap-x-3.5 gap-y-1 border-t border-[color:var(--paper-edge)] py-3 first:border-t-0 sm:grid-cols-[5.5rem_minmax(0,1fr)]">
              <p className="font-black tabular-nums text-[color:var(--maple)]">{step.from}～{step.to}</p>
              <div className="min-w-0 space-y-1.5 text-[15px] leading-relaxed">
                <h3 className="font-bold">
                  {step.title}
                  <span className="ml-1.5 text-[13px] font-bold ink-soft">{step.alt ? "備案・" : ""}{step.kind === "party" ? "組隊" : "單練"}</span>
                </h3>
                <p>{step.text}<SourceTag tag={step.tag} /></p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
                  {step.mobs.flatMap(id => monsters.get(id) ?? []).map(monster => (
                    <Link key={monster.id} href={`/db/monsters/${monster.id}`} className="inline-flex items-center gap-1 font-bold ink-soft hover:text-[color:var(--maple)]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={monsterImage(monster.id)} alt="" width={24} height={24} loading="lazy" className="h-6 w-6 shrink-0 object-contain" />
                      {monster.n}
                    </Link>
                  ))}
                  <Link href={`/go?to=${step.map}`} className="font-bold text-[color:var(--sky)] underline underline-offset-4">帶我去{maps[String(step.map)]?.zh}</Link>
                </div>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="space-y-2">
        <Heading>幾下打死、打不打得中<SourceTag tag="calc" /></Heading>
        <JobArticleTable table={table} />
        <div className="space-y-1 text-[13px] leading-relaxed ink-soft">
          <p className="font-bold">這張表的假設</p>
          <ul className="list-disc space-y-0.5 pl-5">
            {assumptionLines(table).map(line => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <p>公式是舊版玩家整理，經典版沒驗證。HP、防禦、經驗來自遊戲客戶端資料。下數是平均值，沒算 MISS 跟怪的密度；不 MISS 寫 {table.from} 的代表一進這段就打得中，寫「超過 {table.to} 等」的是拿這把武器到 {table.to} 等還打不中。</p>
        </div>
        <SeoLinks links={[{ href: articleDamageHref(table), text: "開計算機改成自己的數值" }]} />
      </section>

      {article.sections.map((section, index) => (
        <section key={index} className="space-y-2 text-[15px] leading-relaxed">
          <Heading>{section.heading}</Heading>
          {section.paragraphs?.map((line, lineIndex) => (
            <p key={lineIndex}>{line.text}<SourceTag tag={line.tag} /></p>
          ))}
          {section.items?.length ? <Lines lines={section.items} /> : null}
        </section>
      ))}

      <SeoLinks
        links={[
          { href: "/plan/train", text: "照我的等級排練功圖" },
          { href: jobPath, text: `${jobName}完整攻略` },
        ]}
      />

      <section className="space-y-1.5 border-t border-[color:var(--paper-edge)] pt-3 text-[13px] leading-relaxed ink-soft">
        <h2 className="font-bold">資料來源</h2>
        <ul className="list-disc space-y-0.5 pl-5">
          <li>怪物、技能數值：遊戲客戶端資料（<Link href="/db/monsters" className="underline underline-offset-2">怪物資料</Link>）</li>
          {article.sources.map(source => (
            <li key={source.url}>
              <a href={source.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">{source.label}</a>
            </li>
          ))}
        </ul>
      </section>
    </SeoPage>
  );
}
