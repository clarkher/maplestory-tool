"use client";

import Link from "next/link";
import { Fragment, useState } from "react";
import { RouteIcon } from "@/components/Icons";
import { itemImage, mapName, npcImage } from "@/lib/data";
import { formatNumber } from "@/lib/format";
import { npcGoTarget, partsText, type NowQuest } from "@/lib/now-plan";
import type { MapRecord } from "@/lib/types";
import { PartsText, SourceLinks, SourceTag, Sprite, levelText } from "./bits";

/** 一開始顯示幾條；其餘按「還有 N 個任務」展開（關鍵獎勵可能超過 5 個，不能藏掉） */
const FIRST_SHOWN = 5;

/** 先解：一次就做完的任務，關鍵獎勵排前面。 */
export function TodoList({ items, routable, maps }: { items: NowQuest[]; routable: Set<number>; maps: Record<string, MapRecord> }) {
  const [showAll, setShowAll] = useState(false);
  if (!items.length) return null;
  const shown = showAll ? items : items.slice(0, FIRST_SHOWN);
  return (
    <section aria-label="先解" className="space-y-2">
      <h2 className="px-1 pt-1 text-[16px] font-black">出發前，先解這 {items.length} 個任務</h2>
      <ul className="space-y-2">
        {shown.map(item => (
          <TodoRow key={item.key} item={item} routable={routable} maps={maps} />
        ))}
      </ul>
      {items.length > FIRST_SHOWN ? (
        <button
          type="button"
          onClick={() => setShowAll(value => !value)}
          aria-expanded={showAll}
          className="tap-safe w-full rounded-full border border-[color:var(--paper-edge)] text-[14px] font-bold"
        >
          {showAll ? "收起" : `還有 ${items.length - FIRST_SHOWN} 個任務`}
        </button>
      ) : null}
    </section>
  );
}

function TodoRow({ item, routable, maps }: { item: NowQuest; routable: Set<number>; maps: Record<string, MapRecord> }) {
  const [open, setOpen] = useState(false);
  const fraction = levelText(item.fraction);
  const parts = partsText(item);
  const lead = [item.exp ? `+${formatNumber(item.exp)} 經驗` : null, fraction].filter((chunk): chunk is string => Boolean(chunk));
  // NPC 站在隱藏地圖（卡伊琳的訓練場）時帶去它的回城點，按鈕寫出那張圖
  const go = npcGoTarget(item.npc?.map, maps, routable);
  return (
    <li className="rounded-[var(--radius-card)] glass wood-frame p-3">
      <div className="flex gap-2.5">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[color:var(--paper-deep)]">
          {item.rewardItem ? <Sprite src={itemImage(item.rewardItem)} size={32} /> : item.npc ? <Sprite src={npcImage(item.npc.id)} size={32} /> : null}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5">
            <b className="text-[14px] leading-snug">{item.title}</b>
            {item.reward ? (
              <span className="rounded-full bg-[color:var(--gold-wash)] px-2 py-0.5 text-[11px] font-black text-[color:var(--gold)]">{item.reward}</span>
            ) : null}
          </span>
          {/* 每一塊（+經驗、約幾級、第幾段／共幾段）各自不斷行，375 寬不會把「段」字單獨擠到下一行；
              分隔的「・」放在前一塊的結尾、後面可以換行（「・」不能放在行首，放開頭整行就沒地方斷，360 寬會凸出卡片） */}
          <span className="mt-0.5 block text-[12px] tabular-nums ink-soft">
            {lead.map((chunk, index) => (
              <Fragment key={index}>
                <span className="whitespace-nowrap">
                  {chunk}
                  {index < lead.length - 1 || parts ? "・" : null}
                </span>
                <wbr />
              </Fragment>
            ))}
            {parts ? <PartsText text={parts} /> : null}
          </span>
          <span className="mt-1 flex items-center justify-between gap-2">
            {/* 要去的地圖名不能被截掉：放不下就換行 */}
            <span className="min-w-0 text-[12px] leading-snug ink-faint">{item.npc ? `${item.npc.n}・${item.npc.mapName ?? ""}` : ""}</span>
            {go ? (
              <Link href={`/go?to=${go.map}`} className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[color:var(--maple)] px-2.5 py-1 text-[12px] font-bold text-[color:var(--maple)]">
                <RouteIcon size={13} />
                {go.viaReturn ? `帶我去${mapName(maps, go.map)}` : "帶我去"}
              </Link>
            ) : null}
          </span>
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-1.5">
        {item.rec ? <SourceTag kind="guide" verified={item.rec.v} /> : <SourceTag kind="data" />}
        {item.rec ? (
          <button type="button" onClick={() => setOpen(value => !value)} aria-expanded={open} className="text-[12px] font-bold text-[color:var(--sky)]">
            {open ? "收起" : "為什麼要解"}
          </button>
        ) : null}
      </div>
      {open && item.rec ? (
        <div className="mt-2 space-y-1 rounded-lg bg-[color:var(--paper)] p-2">
          <p className="text-[13px] leading-relaxed ink-soft">{item.rec.why}</p>
          <SourceLinks urls={item.rec.s} />
        </div>
      ) : null}
    </li>
  );
}
