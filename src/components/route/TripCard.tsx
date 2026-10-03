"use client";

import Link from "next/link";
import { useState } from "react";
import { GoButton } from "@/components/PlanShell";
import { itemImage, mapName, monsterImage } from "@/lib/data";
import { formatNumber } from "@/lib/format";
import { groupQuests, levelFraction, type Trip, type TripTag } from "@/lib/route-planner";
import type { MapRecord, Monster, Quest } from "@/lib/types";
import { SourceLinks, SourceTag, Sprite, levelText } from "./bits";

const TAG_TEXT: Record<TripTag, string> = {
  fast: "練功最快",
  quests: "順便解最多任務",
  players: "玩家推薦",
  alt: "人多時的備案",
};

export function TripCard({
  trip,
  index,
  level,
  maps,
  monsters,
  toNext,
  routable,
}: {
  trip: Trip;
  index: number;
  level: number;
  maps: Record<string, MapRecord>;
  monsters: Map<number, Monster>;
  toNext: number[];
  routable: Set<number>;
}) {
  const [showWhy, setShowWhy] = useState(false);
  const record = maps[String(trip.map)];
  const lead = trip.mobs.find(([id]) => monsters.has(id));
  const groups = groupQuests(trip.quests);
  const fraction = levelText(levelFraction(trip.questExp, level, toNext));
  const isParty = trip.guide?.kind === "party";
  const loot = trip.loot.filter(material => material.droppers.length);

  return (
    <article className="overflow-hidden rounded-[var(--radius-card)] glass wood-frame">
      <div className="flex items-center gap-3 bg-[color:var(--paper-deep)] p-3">
        <span className="w-5 shrink-0 text-center text-2xl font-black tabular-nums text-[color:var(--maple)]">{index + 1}</span>
        {lead ? <Sprite src={monsterImage(lead[0])} size={48} /> : null}
        <span className="min-w-0 flex-1">
          <span className="block text-[16px] font-black leading-tight">{mapName(maps, trip.map)}</span>
          {record?.st ? <span className="block text-[12px] ink-soft">{record.st}</span> : null}
          <span className="mt-1 flex flex-wrap gap-1">
            {trip.tags.map(tag => (
              <span key={tag} className="rounded-full bg-[color:var(--leaf-wash)] px-2 py-0.5 text-[11px] font-bold text-[color:var(--leaf)]">
                {TAG_TEXT[tag]}
              </span>
            ))}
            {isParty ? (
              <span className="rounded-full bg-[color:var(--sky-wash)] px-2 py-0.5 text-[11px] font-bold text-[color:var(--sky)]">組隊</span>
            ) : null}
          </span>
        </span>
        {routable.has(trip.map) ? (
          <GoButton to={trip.map} />
        ) : isParty ? (
          <Link href="/guide" className="tap-safe inline-flex shrink-0 items-center rounded-full bg-[color:var(--sky)] px-3.5 text-sm font-bold text-white">
            看圖解
          </Link>
        ) : null}
      </div>

      {!trip.row && isParty && !trip.questExp ? (
        <Link href="/guide" className="block border-b border-[color:var(--paper-edge)] px-3 py-2.5 text-[14px] font-bold text-[color:var(--sky)]">
          這是組隊任務，打法跟入口看圖解 →
        </Link>
      ) : (
      <dl className="grid grid-cols-2 divide-x divide-[color:var(--paper-edge)] border-b border-[color:var(--paper-edge)] text-center">
        <div className="p-2">
          <dt className="text-[11px] ink-faint">清一輪</dt>
          <dd className="text-[17px] font-black tabular-nums">{trip.row ? formatNumber(trip.row.exp1) : "—"}</dd>
        </div>
        <div className="p-2">
          <dt className="text-[11px] ink-faint">順便解任務</dt>
          <dd className="text-[17px] font-black tabular-nums text-[color:var(--gold)]">
            {trip.questExp ? `+${formatNumber(trip.questExp)}` : "—"}
          </dd>
          {fraction ? <dd className="text-[11px] ink-faint">{fraction}</dd> : null}
        </div>
      </dl>
      )}

      <div className="space-y-2.5 p-3">
        {trip.mobs.length ? (
          <div className="flex flex-wrap gap-1.5">
            {trip.mobs.slice(0, 3).map(([id, count]) => {
              const monster = monsters.get(id);
              if (!monster) return null;
              return (
                <Link
                  key={id}
                  href={`/db/monsters?id=${id}`}
                  className="inline-flex items-center gap-1 rounded-full bg-[color:var(--paper-deep)] py-0.5 pl-0.5 pr-2.5 text-[12px] font-bold"
                >
                  <Sprite src={monsterImage(id)} size={22} />
                  {monster.n}
                  <span className="font-normal tabular-nums ink-faint">Lv{monster.lv} ×{count}</span>
                </Link>
              );
            })}
          </div>
        ) : null}

        {groups.length ? (
          <ul className="space-y-1.5">
            {groups.slice(0, 4).map(group => (
              <QuestLine key={group.key} title={group.title} quests={group.quests} exp={group.exp} />
            ))}
          </ul>
        ) : null}

        {loot.length ? (
          <div className="rounded-lg bg-[color:var(--leaf-wash)] px-2 py-1.5">
            <p className="mb-1 text-[11px] font-bold text-[color:var(--leaf)]">一路撿</p>
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {loot.map(material => (
                <span key={material.id} className="inline-flex items-center gap-1 text-[13px] font-bold">
                  <Sprite src={itemImage(material.id)} size={20} />
                  {material.n} ×{formatNumber(material.c)}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        {trip.guide ? (
          <div className="rounded-xl border border-[color:var(--paper-edge)] p-2.5">
            <button type="button" onClick={() => setShowWhy(value => !value)} aria-expanded={showWhy} className="flex w-full items-center justify-between gap-2 text-left">
              <span className="text-[13px] font-bold">玩家怎麼說（Lv.{trip.guide.from}–{trip.guide.to}）</span>
              <SourceTag kind="guide" verified={trip.guide.v} />
            </button>
            {showWhy ? (
              <div className="mt-2 space-y-1.5">
                <p className="text-[13px] leading-relaxed ink-soft">{trip.guide.why}</p>
                <SourceLinks urls={trip.guide.s} />
              </div>
            ) : null}
          </div>
        ) : (
          <div className="flex justify-end">
            <SourceTag kind="data" />
          </div>
        )}
      </div>
    </article>
  );
}

/** 一組任務一行：同一條任務線收起來，列要交什麼、拿多少。 */
export function QuestLine({
  title,
  quests,
  exp,
  extra,
  as: Tag = "li",
  showPrerequisite = true,
}: {
  title: string;
  quests: Quest[];
  exp: number;
  extra?: string | null;
  as?: "li" | "div";
  /** 必解清單是整條線從頭列，不用提醒前置；一趟卡只列這張圖做得到的那段，要提醒 */
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
        {quests.length > 1 ? <span className="ml-1 text-[12px] ink-faint">{quests.length} 段</span> : null}
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
