import Link from "next/link";
import { monsterImage } from "@/lib/asset-paths";
import { formatNumber } from "@/lib/format";
import { articleDamageHref, assumptionLines, avgText, featuredMonsters, hitLvText, pinnedSections, stepImageAlt, tableGearLine, withOneTargetCell, FEATURED_LIMIT, TAG_LABEL, type ArticleAnswer, type ArticleImages, type ArticleSection, type CalcTable, type ClaimTag, type JobArticle } from "@/lib/job-article";
import type { MapRecord, Monster } from "@/lib/types";
import { AdSlot } from "./AdSlot";
import { ExpandRows, Fold } from "./ArticleFold";
import { SeoLinks, SeoPage } from "./SeoPage";

/**
 * 職業×等級攻略文（/guides/<英文職業>-<起>-<迄>）的畫面。文章已經換好代號（resolveArticle），這裡只排版；
 * 表、假設一律用算出來的 CalcTable，不另外寫數字。站上色票都是 CSS 變數，深淺色跟著主題走。
 */

/**
 * 標籤的底跟字色（對比測試讀這張表）。v1.95 照「從哪來」分三色（設計系統 A 拍板 6）：
 * 站上算的、遊戲本身的資料＝藍；玩家說的＝金；舊的、官方文字＝灰。橘色留給重點，不當標籤色。
 */
const SKY = { wash: "bg-[color:var(--sky-wash)]", ink: "text-[color:var(--sky)]" };
const GOLD = { wash: "bg-[color:var(--gold-wash)]", ink: "text-[color:var(--gold)]" };
const GRAY = { wash: "bg-[color:var(--paper-deep)]", ink: "text-[color:var(--ink-soft)]" };
export const TAG_TONE: Record<ClaimTag, { wash: string; ink: string }> = {
  calc: SKY,
  game: SKY,
  tw: GOLD,
  community: GOLD,
  legacy: GRAY,
  official: GRAY,
};

/**
 * 跟前面的字隔一個空白不用 margin：換行到行首時空白會收掉，margin 會留一段內縮。
 * 結論框（v1.95 起是卡片底，不再是橘色洗底）跟段落一樣用洗色底；對比測試量疊在頁底、卡片底兩種。
 */
function SourceTag({ tag }: { tag: ClaimTag }) {
  const tone = TAG_TONE[tag];
  return <>{" "}<span className={`inline-block whitespace-nowrap rounded px-2 align-[1px] text-[12px] font-bold leading-[1.5] ${tone.wash} ${tone.ink}`}>{TAG_LABEL[tag]}</span></>;
}

/**
 * 署名：站名、日期、寫手、聲明。第一屏要留給結論框，所以字小、行少；聲明兩句照使用者拍板的字，不准改。
 * 頭像只畫清單裡有的。
 */
function Byline({ article, images }: { article: JobArticle; images?: ArticleImages }) {
  const { persona, published, updated } = article;
  return (
    <div className="space-y-1 text-[12px] leading-snug ink-soft">
      <p>
        <span className="font-bold">楓谷幫手</span>
        <span>・發布 <time dateTime={published}>{published}</time>・更新 <time dateTime={updated}>{updated}</time></span>
      </p>
      <p className="flex items-center gap-1.5">
        {images?.author ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`${images.dir}/author.webp`} alt="" width={images.author.w} height={images.author.h} className="size-6 shrink-0 rounded-full object-cover" />
        ) : null}
        <span>
          <span className="font-bold">本篇寫手：{persona.name}</span>｜{persona.line}
        </span>
      </p>
      <p>寫手是站上虛構的角色，數字和來源都查得到。文章由 AI 協助整理，計算數字由站上算出，玩家回報都有標明。主圖和路線卡背景由 AI 繪製。</p>
    </div>
  );
}

function Heading({ children }: { children: React.ReactNode }) {
  return <h2 className="pt-2 text-lg font-black leading-snug sm:text-xl">{children}</h2>;
}

function Lines({ lines, ordered, maps }: { lines: ArticleAnswer[]; ordered?: boolean; maps?: Record<string, MapRecord> }) {
  const List = ordered ? "ol" : "ul";
  return (
    <List className={`${ordered ? "list-decimal" : "list-disc"} space-y-1.5 pl-5`}>
      {lines.map((line, index) => (
        <li key={index}>
          {line.alt ? <span className="mr-1 font-bold">備案：</span> : null}
          {line.text}<SourceTag tag={line.tag} />
          {/* 網址跟步驟卡的帶我去同一種；字色跟著框裡的字（--sky 疊在結論框的洗色底上對比不保證到 AA）。inline-block：手機上整顆換行，不在字中間斷 */}
          {line.go !== undefined ? <>{" "}<Link href={`/go?to=${line.go}`} className="inline-block font-bold underline decoration-[color:var(--ink-faint)] underline-offset-4">帶我去{maps?.[String(line.go)]?.zh}</Link></> : null}
        </li>
      ))}
    </List>
  );
}

/** 先講結論的條目（v1.95）：前面兩位數編號（01、02…），列跟列之間細線；用 ol 讀螢幕軟體照樣念第幾條 */
function NumberedLines({ lines, maps }: { lines: ArticleAnswer[]; maps?: Record<string, MapRecord> }) {
  return (
    <ol className="divide-y divide-[color:var(--paper-edge)]">
      {lines.map((line, index) => (
        <li key={index} className="grid grid-cols-[2rem_minmax(0,1fr)] gap-x-1 py-2.5 first:pt-1 last:pb-0">
          <span aria-hidden="true" className="pt-px text-[13px] font-black tabular-nums text-[color:var(--maple)]">{String(index + 1).padStart(2, "0")}</span>
          <span>
            {line.alt ? <span className="mr-1 font-bold">備案：</span> : null}
            {line.text}<SourceTag tag={line.tag} />
            {/* 網址跟步驟卡的帶我去同一種；字色跟著框裡的字（--sky 疊在結論框的洗色底上對比不保證到 AA）。inline-block：手機上整顆換行，不在字中間斷 */}
            {line.go !== undefined ? <>{" "}<Link href={`/go?to=${line.go}`} className="inline-block font-bold underline decoration-[color:var(--ink-faint)] underline-offset-4">帶我去{maps?.[String(line.go)]?.zh}</Link></> : null}
          </span>
        </li>
      ))}
    </ol>
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
export function JobArticleTable({ table, featured }: { table: CalcTable; /** 收合時露的怪（featuredMonsters）；不給、或怪不到 4 隻就整張露 */ featured?: number[] }) {
  const { assumptions, columns, midLevel, rows } = table;
  const magic = assumptions.accuracy.kind === "magic";
  const heal = assumptions.targets !== null;
  const shown = featured && rows.length > FEATURED_LIMIT ? new Set(featured) : null;
  const grid = (
      <div className="scroll-x rounded-xl border border-[color:var(--paper-edge)] bg-[color:var(--paper)]">
      <table className="w-full border-collapse whitespace-nowrap text-sm">
        <thead className="bg-[color:var(--paper-deep)] text-left text-[13px] font-bold">
          <tr>
            <th scope="col" className={`${STICKY_CELL} bg-[color:var(--paper-deep)] px-3 py-2 align-bottom`}>怪</th>
            {withOneTargetCell(
              table,
              columns.map(column => (
                <th key={column.level} scope="col" className={CALC_HEAD}>{column.targets ? `範圍 ${column.targets} 隻` : heal ? column.skill.name : "幾下"}<span className="block font-normal">Lv.{column.level}</span></th>
              )),
              <th key="one" scope="col" className={CALC_HEAD}>{assumptions.skill.name}打 1 隻<span className="block font-normal">Lv.{midLevel}</span></th>,
            )}
            <th scope="col" className={CALC_HEAD}>幾等不 MISS</th>
            <th scope="col" className="px-3 py-2 text-right align-bottom">等級</th>
            <th scope="col" className="px-3 py-2 text-right align-bottom">HP</th>
            <th scope="col" className="px-3 py-2 text-right align-bottom">{magic ? "魔防" : "物防"}</th>
            <th scope="col" className="px-3 py-2 text-right align-bottom">經驗</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr
              key={row.id}
              data-extra={shown && !shown.has(row.id) ? "" : undefined}
              className={`border-t border-[color:var(--paper-edge)] ${shown && !shown.has(row.id) ? "group-data-[open=false]/rows:hidden" : ""}`}
            >
              <td className={`${STICKY_CELL} bg-[color:var(--paper)] px-2.5 py-1.5`}>
                <Link href={`/db/monsters/${row.id}`} className="inline-flex items-center gap-1.5 font-bold hover:text-[color:var(--maple)]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={monsterImage(row.id)} alt="" width={32} height={32} loading="lazy" className="h-8 w-8 shrink-0 object-contain" />
                  {row.name}
                </Link>
              </td>
              {withOneTargetCell(
                table,
                row.avgs.map((avg, index) => (
                  <td key={columns[index].level} className={`${NUMBER_CELL} font-bold`}>{avgText(avg)}</td>
                )),
                <td key="one" className={NUMBER_CELL}>{avgText(row.avgOne)}</td>,
              )}
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
  );
  return (
    <div className="space-y-1">
      <p className="text-[13px] font-bold ink-soft">{tableGearLine(table)}，平均幾下打死</p>
      {/* 提示放表上面：手機上第三欄被切一半，滑之前就要知道還有（放下面像版面壞掉，v1.79 評審） */}
      <p className="text-[13px] ink-soft md:hidden">表可以往右滑，看等級、HP、防禦、經驗。</p>
      {shown ? <ExpandRows total={rows.length}>{grid}</ExpandRows> : grid}
    </div>
  );
}

/** 路線卡右側的圖：手機也一樣文字繞圖，所以寬度寫比例不寫固定；電腦版欄寬大、字行數少，28% 才不會圖比字高一大截。pixelated 讓像素圖不糊，來源要是格子粗的像素圖（細緻的圖細線會碎，見 README 放圖約定） */
function StepImage({ step, jobName, monsters, maps, images }: { step: JobArticle["steps"][number]; jobName: string; monsters: Map<number, Monster>; maps: Record<string, MapRecord>; images?: ArticleImages }) {
  const size = images?.steps?.[String(step.map)];
  if (!images || !size) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`${images.dir}/${step.map}.webp`}
      alt={stepImageAlt(jobName, maps[String(step.map)]?.zh ?? "", monsters.get(step.mobs[0])?.n ?? "")}
      width={size.w}
      height={size.h}
      loading="lazy"
      className="float-right mb-1 ml-3 h-auto w-[42%] rounded-lg [image-rendering:pixelated] md:w-[28%]"
    />
  );
}

/** 路線卡的內文（圖、標題、說明、怪、帶我去）；主推卡跟收起來的備案卡共用。圖排在標題前面，標題才會繞著圖排；備案卡的標題在收合那一行，這裡不放 */
function StepBody({ step, index, article, jobName, monsters, maps, images, heading }: { heading?: React.ReactNode; step: JobArticle["steps"][number]; index: number; article: JobArticle; jobName: string; monsters: Map<number, Monster>; maps: Record<string, MapRecord>; images?: ArticleImages }) {
  return (
    <div className="min-w-0 space-y-1.5 text-[15px] leading-relaxed [display:flow-root]">
      {/* 同一張圖連寫兩步（獵人 31～36、37～50）只放第一步，不然連看兩張一樣的圖 */}
      {article.steps.findIndex(other => other.map === step.map) === index ? <StepImage step={step} jobName={jobName} monsters={monsters} maps={maps} images={images} /> : null}
      {heading}
      <p>{step.text}<SourceTag tag={step.tag} /></p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
        {step.mobs.flatMap(id => monsters.get(id) ?? []).map(monster => (
          <Link key={monster.id} href={`/db/monsters/${monster.id}`} className="inline-flex items-center gap-1 font-bold ink-soft hover:text-[color:var(--maple)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={monsterImage(monster.id)} alt="" width={24} height={24} loading="lazy" className="h-6 w-6 shrink-0 object-contain" />
            {monster.n}
          </Link>
        ))}
        <Link href={`/go?to=${step.go ?? step.map}`} className="font-bold text-[color:var(--sky)] underline underline-offset-4">帶我去{maps[String(step.go ?? step.map)]?.zh}</Link>
      </div>
    </div>
  );
}

/** 結論框跳轉連結的字 */
const TOPIC_LINK: Record<NonNullable<ArticleSection["topic"]>, string> = { quests: "必解任務", skills: "技能怎麼點" };

/**
 * 攻略文頁首（v1.95，設計系統 A）：大圖鋪滿卡片寬、往下漸層到深色，標題跟署名壓在圖下緣。
 * 固定深色（force-dark），淺色模式也一樣，圖上的字只要量一套對比。卡片的 padding 用負 margin 吃掉，圖才貼齊卡片邊。
 * 筆電 720 高的第一屏要看得到結論框：電腦版圖高壓在 280px（整欄寬照 16:9 會 600 多高）；手機照 16:9。
 */
function ArticleCover({ title, alt, hero, dir, byline }: { title: string; alt: string; hero: { w: number; h: number }; dir: string; byline: React.ReactNode }) {
  return (
    <header className="force-dark -mx-4 -mt-4 overflow-hidden rounded-t-[var(--radius-card)] sm:-mx-5 sm:-mt-5">
      <div className="relative">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`${dir}/hero.webp`} alt={alt} width={hero.w} height={hero.h} fetchPriority="high" className="aspect-video w-full object-cover object-[50%_35%] md:aspect-auto md:h-[280px]" />
        <div aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(to_bottom,transparent_40%,var(--paper))]" />
      </div>
      <div className="relative -mt-12 space-y-3 px-4 pb-4 sm:-mt-16 sm:px-5 sm:pb-5">
        <h1 className="text-[26px] font-black leading-tight tracking-tight sm:text-[32px]">{title}</h1>
        {byline}
      </div>
    </header>
  );
}

export function JobArticleView({
  jobName,
  rangeLabel,
  path,
  jobPath,
  article,
  table,
  monsters,
  maps,
  dataNote,
  jsonLd,
  images,
}: {
  jobName: string;
  rangeLabel: string;
  path: string;
  /** 這個職業的攻略頁（/jobs/230） */
  jobPath: string;
  /** 已經換好代號 */
  article: JobArticle;
  table: CalcTable;
  monsters: Map<number, Monster>;
  maps: Record<string, MapRecord>;
  /** 計算表那段的第一行：這張表是哪一版遊戲資料算的 */
  dataNote: string;
  jsonLd: object[];
  /** 這篇有哪些圖；只畫裡面有的 */
  images?: ArticleImages;
}) {
  const pinned = pinnedSections(article.sections);
  return (
    <SeoPage
      trail={[{ name: "攻略", path: "/guides" }, { name: jobName, path: jobPath }, { name: rangeLabel, path }]}
      title={article.title}
      cover={images?.hero ? <ArticleCover title={article.title} alt={article.heroAlt} hero={images.hero} dir={images.dir} byline={<Byline article={article} images={images} />} /> : undefined}
      jsonLd={jsonLd}
    >
      {images?.hero ? null : <Byline article={article} images={images} />}

      <div id="answer" className="scroll-mt-header space-y-1.5 rounded-[var(--radius-card)] border border-l-[3px] border-[color:var(--paper-edge)] border-l-[color:var(--maple)] glass-fill p-3.5 text-[15px] leading-relaxed sm:p-4">
        <p className="text-[12px] font-extrabold tracking-[0.1em] text-[color:var(--maple)]">先講結論</p>
        <NumberedLines lines={article.answer} maps={maps} />
        {/* 直接跳到必解任務、技能點法（v1.80）；那類段落不存在就不放 */}
        {pinned.some(({ anchor }) => anchor) ? (
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-sm font-bold">
            <span className="ink-soft">直接看</span>
            {pinned.filter(({ anchor }) => anchor).map(({ section }) => (
              <a key={section.topic} href={`#${section.topic}`} className="text-[color:var(--sky)] underline underline-offset-4">{TOPIC_LINK[section.topic!]}</a>
            ))}
          </p>
        ) : null}
      </div>

      <p className="text-[15px] leading-relaxed">{article.intro}</p>

      {/* 手機收合（v1.78，拍板 A）：主推卡照舊整張；備案卡只剩「備案 起～迄＋標題」一行，點開才看內文 */}
      <section className="space-y-2">
        <Heading>每個等級去哪裡</Heading>
        <ol>
          {article.steps.map((step, index) => {
            const card = { step, index, article, jobName, monsters, maps, images };
            return step.alt ? (
              <li key={index} className="border-t border-[color:var(--paper-edge)] first:border-t-0">
                <Fold
                  id={`alt:${index}`}
                  summary={
                    <>
                      <span className="mr-1.5 whitespace-nowrap text-[13px] font-bold tabular-nums text-[color:var(--maple)]">備案 {step.from}～{step.to}</span>
                      <h3 className="inline text-[15px] font-bold leading-snug">{step.title}</h3>
                      {" "}<span className="whitespace-nowrap text-[13px] font-bold ink-soft">{step.kind === "party" ? "組隊" : "單練"}</span>
                    </>
                  }
                >
                  <div className="pb-3"><StepBody {...card} /></div>
                </Fold>
              </li>
            ) : (
              <li key={index} className="grid gap-x-3.5 gap-y-1 border-t border-[color:var(--paper-edge)] py-3 first:border-t-0 sm:grid-cols-[5.5rem_minmax(0,1fr)]">
                <p className="font-black tabular-nums text-[color:var(--maple)]">{step.from}～{step.to}</p>
                <StepBody {...card} heading={
                  <h3 className="font-bold">
                    {step.title}
                    {" "}<span className="whitespace-nowrap text-[13px] font-bold ink-soft">{step.kind === "party" ? "組隊" : "單練"}</span>
                  </h3>
                } />
              </li>
            );
          })}
        </ol>
      </section>

      <section className="space-y-2">
        <Heading>幾下打死、打不打得中<SourceTag tag="calc" /></Heading>
        <JobArticleTable table={table} featured={featuredMonsters(article.steps, table.rows)} />
        <Fold id="assume" className="border-t border-[color:var(--paper-edge)]" summary={<span className="text-sm font-bold">這張表怎麼算的</span>}>
          <div className="space-y-1 pb-3 text-[13px] leading-relaxed ink-soft">
            <p>{dataNote}</p>
            <p className="font-bold">這張表的假設</p>
            <ul className="list-disc space-y-0.5 pl-5">
              {assumptionLines(table).map(line => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <p>公式是舊版玩家整理，經典版沒驗證。HP、防禦、經驗來自遊戲客戶端資料。下數是平均值，沒算 MISS 跟怪的密度；不 MISS 寫 {table.from} 的代表一進這段就打得中，寫「超過 {table.to} 等」的是到 {table.to} 等還不保證打中，會有 MISS。</p>
          </div>
        </Fold>
        <SeoLinks links={[{ href: articleDamageHref(table), text: "開計算機改成自己的數值" }]} />
      </section>

      <AdSlot unit="article" />

      {/* 必解任務、技能點法是玩家最常來查的，照舊整段露著，排在收起來的段落前面（v1.79）；必解先、點法後（v1.80） */}
      {pinned.map(({ section, anchor }, index) => (
        <section key={index} id={anchor ? section.topic : undefined} className="scroll-mt-header space-y-2 text-[15px] leading-relaxed">
          <Heading>{section.heading}</Heading>
          {section.paragraphs?.map((line, lineIndex) => (
            <p key={lineIndex}>{line.text}<SourceTag tag={line.tag} /></p>
          ))}
          {section.items?.length ? <Lines lines={section.items} /> : null}
        </section>
      ))}

      {/* 後面的段落只剩標題（標題還是 h2），一段一段點開；疊成一張清單，中間不留大空白。開關的鍵用原本的位置，露出來的段落不佔號 */}
      <div className="border-b border-[color:var(--paper-edge)]">
        {article.sections.map((section, index) => section.topic ? null : (
          <section key={index} className="border-t border-[color:var(--paper-edge)] text-[15px] leading-relaxed">
            <Fold id={`sec:${index}`} summary={<h2 className="text-base font-black leading-snug sm:text-lg">{section.heading}</h2>}>
              <div className="space-y-2 pb-3">
                {section.paragraphs?.map((line, lineIndex) => (
                  <p key={lineIndex}>{line.text}<SourceTag tag={line.tag} /></p>
                ))}
                {section.items?.length ? <Lines lines={section.items} /> : null}
              </div>
            </Fold>
          </section>
        ))}
      </div>

      <SeoLinks
        links={[
          { href: "/plan/train", text: "照我的等級排練功圖" },
          { href: jobPath, text: `${jobName}完整攻略` },
        ]}
      />

      <section className="border-y border-[color:var(--paper-edge)] text-[13px] leading-relaxed ink-soft">
        <Fold id="sources" summary={<h2 className="font-bold">資料來源</h2>}>
          <ul className="list-disc space-y-0.5 pb-3 pl-5">
            <li>怪物、技能數值：遊戲客戶端資料（<Link href="/db/monsters" className="underline underline-offset-2">怪物資料</Link>）</li>
            {article.sources.map(source => (
              <li key={source.url}>
                <a href={source.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">{source.label}</a>
              </li>
            ))}
          </ul>
        </Fold>
      </section>
    </SeoPage>
  );
}
