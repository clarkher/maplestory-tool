import Link from "next/link";
import { cardDate } from "@/lib/guide-catalog";
import type { Block, GuideDoc, Inline } from "@/lib/guide-markdown";
import { SeoPage } from "./SeoPage";

/**
 * 一般攻略文的頁面（v1.88，src/content/guides/*.md）：主圖、分類日期、內文。
 * 圖分兩種：遊戲小圖（道具、NPC、怪、技能）原尺寸放大兩倍、不抹糊；地圖畫面、小地圖、地區圖整欄寬。
 */
const SPRITE = /^\/assets\/(items|npcs|monster_frames|skills|meso)\//;

/** captioned：下面有圖說（同一段字），圖本身 alt 留空，螢幕閱讀器才不會念兩次 */
function Img({ src, alt, inline, captioned }: { src: string; alt: string; inline?: boolean; captioned?: boolean }) {
  if (captioned) alt = "";
  if (SPRITE.test(src)) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt={alt} loading="lazy" className={inline ? "inline-block max-h-8 align-middle [image-rendering:pixelated]" : "max-h-28 w-auto [image-rendering:pixelated]"} />
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} loading="lazy" className="w-full rounded-xl bg-[color:var(--paper-deep)] object-contain [image-rendering:pixelated]" />;
}

function Text({ nodes }: { nodes: Inline[] }) {
  return (
    <>
      {nodes.map((node, index) => {
        if (node.t === "text") return node.v;
        if (node.t === "b") return <strong key={index} className="text-[color:var(--ink)]"><Text nodes={node.c} /></strong>;
        if (node.t === "img") return <Img key={index} src={node.src} alt={node.alt} inline />;
        const internal = node.href.startsWith("/");
        return internal ? (
          <Link key={index} href={node.href} className="text-[color:var(--sky)] underline underline-offset-4"><Text nodes={node.c} /></Link>
        ) : (
          <a key={index} href={node.href} rel="noopener" className="text-[color:var(--sky)] underline underline-offset-4"><Text nodes={node.c} /></a>
        );
      })}
    </>
  );
}

function Blocks({ blocks }: { blocks: Block[] }) {
  return (
    <>
      {blocks.map((block, index) => {
        switch (block.t) {
          case "h":
            return block.level === 2 ? (
              <h2 key={index} id={block.id} className="scroll-mt-header pt-3 text-[21px] font-black tracking-tight"><Text nodes={block.c} /></h2>
            ) : (
              <h3 key={index} id={block.id} className="scroll-mt-header pt-1 text-[17px] font-black"><Text nodes={block.c} /></h3>
            );
          case "p":
            return <p key={index}><Text nodes={block.c} /></p>;
          case "list": {
            const List = block.ordered ? "ol" : "ul";
            return (
              <List key={index} start={block.start} className={`space-y-1 pl-5 ${block.ordered ? "list-decimal" : "list-disc"}`}>
                {block.items.map((item, i) => <li key={i}><Text nodes={item} /></li>)}
              </List>
            );
          }
          case "table":
            return (
              <div key={index} className="scroll-x -mx-1 px-1">
                {/* 表頭、第一欄（名稱）不折行，手機寬度不夠就往右滑，不要把怪名擠成三行 */}
                <table className="w-full min-w-[20rem] border-collapse text-[14px] [&_th]:whitespace-nowrap [&_td:first-child]:whitespace-nowrap">
                  <thead>
                    <tr>{block.head.map((cell, i) => <th key={i} className="border-b border-[color:var(--paper-edge)] px-2 py-1.5 text-left font-bold ink-soft"><Text nodes={cell} /></th>)}</tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, r) => (
                      <tr key={r}>{row.map((cell, i) => <td key={i} className="border-b border-[color:var(--paper-edge)] px-2 py-1.5 align-top"><Text nodes={cell} /></td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          case "quote":
            return (
              <div key={index} className="space-y-1.5 rounded-xl bg-[color:var(--maple-wash)] p-3.5 sm:p-4">
                <Blocks blocks={block.c} />
              </div>
            );
          case "img":
            return (
              <figure key={index} className="space-y-1">
                <Img src={block.src} alt={block.alt} captioned={Boolean(block.alt)} />
                <figcaption className="text-[13px] ink-faint">{block.alt}</figcaption>
              </figure>
            );
          case "hr":
            return <hr key={index} className="border-[color:var(--paper-edge)]" />;
        }
      })}
    </>
  );
}

export function GuideDocView({ doc, hero, jsonLd }: { doc: GuideDoc; hero: { src: string; w: number; h: number } | null; jsonLd: object[] }) {
  return (
    <SeoPage trail={[{ name: "攻略", path: "/guides" }, { name: doc.title, path: `/guides/${doc.slug}` }]} title={doc.title} jsonLd={jsonLd}>
      {hero ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={hero.src} alt={doc.heroAlt} width={hero.w} height={hero.h} fetchPriority="high" className="aspect-video w-full rounded-xl object-cover" />
      ) : null}
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] ink-faint">
        <span className="font-bold text-[color:var(--maple)]">{doc.category}</span>
        {doc.tags.map(tag => <span key={tag} className="rounded-full bg-[color:var(--paper-deep)] px-2 py-0.5 text-[12px] ink-soft">{tag}</span>)}
        <span>更新 {cardDate(doc.updated)}</span>
      </p>
      <article className="space-y-3 text-[15px] leading-relaxed">
        <Blocks blocks={doc.blocks} />
      </article>
    </SeoPage>
  );
}
