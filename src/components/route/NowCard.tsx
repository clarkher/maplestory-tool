"use client";

import Image from "next/image";
import Link from "next/link";
import { RouteIcon } from "@/components/Icons";
import { GoButton } from "@/components/PlanShell";
import { mapName, minimapImage, monsterImage, npcImage } from "@/lib/data";
import { formatNumber } from "@/lib/format";
import type { MainPick, TrainOption } from "@/lib/now-plan";
import type { MapRecord, Monster } from "@/lib/types";
import { SourceTag, Sprite } from "./bits";

type Common = { level: number; jobName: string; maps: Record<string, MapRecord>; monsters: Map<number, Monster>; routable: Set<number> };

/** 主推大卡：最上面只講「現在去哪」。 */
export function NowCard({ pick, ...common }: Common & { pick: MainPick }) {
  if (pick.kind === "advance") return <AdvanceCard pick={pick} {...common} />;
  if (pick.kind === "pq") return <PqCard pick={pick} {...common} />;
  return <MapCard pick={pick} {...common} />;
}

function Hero({ map, maps, mobs, label }: { map?: number; maps: Record<string, MapRecord>; mobs: Array<[number, number]>; label: string }) {
  const record = map !== undefined ? maps[String(map)] : undefined;
  return (
    <div className="relative">
      {map !== undefined && record?.mm ? (
        <Image src={minimapImage(map)} alt="" width={750} height={288} unoptimized className="h-36 w-full object-cover [image-rendering:pixelated]" />
      ) : (
        <div className="h-20 w-full bg-[color:var(--paper-deep)]" />
      )}
      <span className="absolute left-3 top-3 rounded-full bg-[color:var(--maple)] px-2.5 py-1 text-[12px] font-black text-white shadow">{label}</span>
      {mobs.length ? (
        <span className="absolute bottom-2 right-3 flex gap-1">
          {mobs.slice(0, 2).map(([id]) => (
            <span key={id} className="grid size-14 place-items-center rounded-xl bg-white/85 shadow">
              <Sprite src={monsterImage(id)} size={48} />
            </span>
          ))}
        </span>
      ) : null}
    </div>
  );
}

function mobLine(option: TrainOption, monsters: Map<number, Monster>): string {
  return option.mobs
    .slice(0, 2)
    .map(([id, count]) => {
      const monster = monsters.get(id);
      return monster ? `${monster.n} Lv${monster.lv ?? "?"}×${count}` : "";
    })
    .filter(Boolean)
    .join("、");
}

function Chip({ tone, children }: { tone: "maple" | "gold" | "sky"; children: React.ReactNode }) {
  const tones = {
    maple: "bg-[color:var(--maple-wash)] text-[color:var(--maple)]",
    gold: "bg-[color:var(--gold-wash)] text-[color:var(--gold)]",
    sky: "bg-[color:var(--sky-wash)] text-[color:var(--sky)]",
  };
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-black ${tones[tone]}`}>{children}</span>;
}

function AltLine({ alt, prefix }: { alt?: TrainOption; prefix: string }) {
  if (!alt) return null;
  return (
    <p className="text-center text-[13px]">
      <span className="ink-faint">{prefix}</span>
      <b>{alt.title}</b>
    </p>
  );
}

function MapCard({ pick, level, jobName, maps, monsters, routable }: Common & { pick: Extract<MainPick, { kind: "map" }> }) {
  const { option, alt, ceiling } = pick;
  const record = maps[String(option.map)];
  return (
    <article aria-label="現在去這裡" className="overflow-hidden rounded-[var(--radius-card)] glass wood-frame">
      <Hero map={option.map} maps={maps} mobs={option.mobs} label={`Lv.${level} ${jobName}・現在去這裡`} />
      <div className="space-y-2.5 p-3.5">
        <div>
          <h2 className="text-[22px] font-black leading-tight">{option.title}</h2>
          <p className="text-[13px] ink-soft">{[record?.st, mobLine(option, monsters)].filter(Boolean).join("・")}</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {option.fit.note ? <Chip tone="maple">{jobName}專屬：{option.fit.note}</Chip> : null}
          {option.fit.warn ? <Chip tone="gold">{option.fit.warn}</Chip> : null}
          {option.party ? <Chip tone="sky">組隊</Chip> : null}
          {option.source === "guide" ? <SourceTag kind="guide" verified={option.guide?.v} /> : <SourceTag kind="data" />}
        </div>
        <p className="text-[12px] ink-soft">
          {option.row ? `清一輪 ${formatNumber(option.row.exp1)} 經驗・${option.row.sp} 隻怪` : null}
          {option.row && option.hops ? "・" : null}
          {option.hops && option.town ? `從${mapName(maps, option.town)}走 ${option.hops} 張圖` : null}
          {option.source === "data" ? <span className="block ink-faint">照遊戲資料排，還沒有玩家實測</span> : null}
        </p>
        {routable.has(option.map) ? (
          <Link href={`/go?to=${option.map}`} className="tap-safe flex w-full items-center justify-center gap-1.5 rounded-full bg-[color:var(--maple)] text-[15px] font-black text-white shadow-sm">
            <RouteIcon size={17} />
            帶我去 {option.title}
          </Link>
        ) : null}
        <AltLine alt={alt} prefix={alt?.party ? "有隊友：" : "人多時："} />
        {ceiling ? (
          <p className="rounded-lg bg-[color:var(--gold-wash)] px-2.5 py-1.5 text-[12px]">目前開放的練功圖最高到 Lv.{ceiling}，這張已經是你能去最好的。</p>
        ) : null}
      </div>
    </article>
  );
}

function PqCard({ pick, level, jobName, maps, routable }: Common & { pick: Extract<MainPick, { kind: "pq" }> }) {
  const { pq, window, alt } = pick;
  return (
    <article aria-label="現在去這裡" className="overflow-hidden rounded-[var(--radius-card)] glass wood-frame">
      <Hero map={pq.entrance} maps={maps} mobs={[]} label={`Lv.${level} ${jobName}・現在去這裡`} />
      <div className="space-y-2.5 p-3.5">
        <div>
          <h2 className="text-[22px] font-black leading-tight">{pq.name}</h2>
          <p className="text-[13px] ink-soft">{jobName}玩家推薦 Lv.{window[0]}–{window[1]} 打這個，入口在{mapName(maps, pq.entrance)}</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Chip tone="sky">組隊</Chip>
          <SourceTag kind="guide" />
        </div>
        <span className="grid grid-cols-[1fr_auto] gap-2">
          {routable.has(pq.entrance) ? (
            <Link href={`/go?to=${pq.entrance}`} className="tap-safe flex items-center justify-center gap-1.5 rounded-full bg-[color:var(--maple)] text-[15px] font-black text-white shadow-sm">
              <RouteIcon size={17} />
              帶我去入口
            </Link>
          ) : <span />}
          <Link href={pq.guide} className="tap-safe flex items-center justify-center rounded-full border border-[color:var(--sky)] px-4 text-[14px] font-bold text-[color:var(--sky)]">
            看打法
          </Link>
        </span>
        <AltLine alt={alt} prefix="人多時：" />
      </div>
    </article>
  );
}

function AdvanceCard({ pick, level, maps, routable }: Common & { pick: Extract<MainPick, { kind: "advance" }> }) {
  return (
    <article aria-label="可以轉職了" className="rounded-[var(--radius-card)] glass wood-frame p-3.5">
      <h2 className="text-[20px] font-black">Lv.{level}・可以轉職了</h2>
      <p className="mb-2.5 text-[13px] ink-soft">法師 8 等、其他職業 10 等就能轉。去找想轉的職業的教官：</p>
      <ul className="space-y-2">
        {pick.instructors.map(entry => (
          <li key={entry.job} className="flex items-center gap-2.5">
            <span className="grid size-11 shrink-0 place-items-end overflow-hidden rounded-xl bg-[color:var(--paper-deep)]">
              <Sprite src={npcImage(entry.npcId)} size={44} />
            </span>
            <span className="min-w-0 flex-1 text-[14px] leading-snug">
              <b>{entry.line}</b>
              <span className="ml-1 text-[12px] ink-soft">{entry.level} 等・找{entry.npcName}（{mapName(maps, entry.map)}）</span>
            </span>
            {routable.has(entry.map) && level >= entry.level ? <GoButton to={entry.map} label="去" /> : null}
          </li>
        ))}
      </ul>
    </article>
  );
}
