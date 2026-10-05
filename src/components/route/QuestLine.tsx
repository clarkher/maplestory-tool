"use client";

import Link from "next/link";
import { formatNumber } from "@/lib/format";
import type { Quest } from "@/lib/types";

/** 一組任務一行：同一條任務線收起來，列要交什麼、拿多少。 */
export function QuestLine({
  title,
  quests,
  exp,
  extra,
  parts,
  as: Tag = "li",
  showPrerequisite = true,
}: {
  title: string;
  quests: Quest[];
  exp: number;
  extra?: string | null;
  /** 「第 a–b 段／共 N 段」（整條線算，跟先解同一個寫法）；不分段就不給 */
  parts?: string | null;
  as?: "li" | "div";
  /** 只列到一條線的後段時要提醒「要先解前一段」；必解清單是整條線從頭列，不用提醒 */
  showPrerequisite?: boolean;
}) {
  const needs = new Map<string, number>();
  for (const quest of quests) {
    for (const item of quest.needItems ?? []) needs.set(item.n, (needs.get(item.n) ?? 0) + (item.c ?? 1));
    for (const mob of quest.needMobs ?? []) needs.set(`打${mob.n}`, (needs.get(`打${mob.n}`) ?? 0) + (mob.c ?? 1));
  }
  const ids = new Set(quests.map(quest => quest.id));
  const hasEarlier = quests.some(quest => quest.pre?.some(id => !ids.has(id)));
  const needText = [...needs.entries()].slice(0, 3).map(([name, count]) => `${name}×${formatNumber(count)}`).join("、");

  return (
    <Tag className="flex items-baseline justify-between gap-2 text-[14px]">
      <span className="min-w-0">
        <Link href={`/db/quests?id=${quests[0].id}`} className="font-bold hover:text-[color:var(--maple)]">
          {title}
        </Link>
        {parts ? <span className="ml-1 whitespace-nowrap text-[12px] ink-faint">{parts}</span> : null}
        {needText ? <span className="ml-1.5 text-[12px] ink-soft">{needText}</span> : null}
        {hasEarlier && showPrerequisite ? <span className="ml-1.5 text-[11px] ink-faint">（要先解前一段）</span> : null}
      </span>
      <span className="shrink-0 text-right">
        <span className="block text-[13px] font-black tabular-nums text-[color:var(--gold)]">+{formatNumber(exp)}</span>
        {extra ? <span className="block text-[11px] ink-faint">{extra}</span> : null}
      </span>
    </Tag>
  );
}
