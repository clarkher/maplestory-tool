import Link from "next/link";
import { itemImage, monsterImage, npcImage } from "@/lib/asset-paths";
import { mobColor, type ShopLine } from "@/lib/atlas-view";
import type { AtlasMap, AtlasNpc } from "@/lib/types";
import { Chip } from "@/components/route/bits";
import { OpenUntil } from "./OpenUntil";

/** 地圖頁的一張卡（怪物、NPC、門各一張） */
export function AtlasCard({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[1.125rem] border border-[color:var(--paper-edge)] bg-[color:var(--glass-strong)] p-4">
      {/* 小字長（「共 90 樣・參考舊版資料…」）時整段換到下一行，標題不會被擠成直的 */}
      <h2 className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="shrink-0 text-base font-black">{title}</span>
        {sub ? <span className="text-xs font-normal ink-soft">{sub}</span> : null}
      </h2>
      {children}
    </section>
  );
}

const row = "flex items-center gap-2.5 border-t border-[color:var(--paper-edge)] py-2";
const actionLink = "tap-safe inline-flex shrink-0 items-center text-[13px] font-extrabold text-[color:var(--maple)] hover:underline";

export function MobRows({ mobs }: { mobs: AtlasMap["mobs"] }) {
  return (
    <div>
      {mobs.map((mob, index) => (
        <div key={mob.id} className={row}>
          <span className="size-2.5 shrink-0 rounded-full" style={{ background: mobColor(index) }} />
          {mob.img ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={monsterImage(mob.id)} alt="" width={36} height={36} loading="lazy" className="size-9 shrink-0 object-contain [image-rendering:pixelated]" />
          ) : (
            // 上游沒有這隻的圖：留同樣大小的空格，不放壞圖
            <span className="size-9 shrink-0" />
          )}
          <div className="min-w-0 flex-1">
            {mob.pg ? (
              <Link href={`/db/monsters/${mob.id}`} className="text-[15px] font-extrabold hover:text-[color:var(--maple)]">
                {mob.n}
              </Link>
            ) : (
              <span className="text-[15px] font-extrabold">{mob.n}</span>
            )}
            <div className="text-xs ink-soft">{mob.lv} 等</div>
          </div>
          <div className="text-right">
            <div className="text-[17px] font-black tabular-nums">{mob.k} 隻</div>
            <div className="text-[11px] ink-soft">同時在場</div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function NpcRows({ npcs }: { npcs: { id: number; n: string; img?: boolean; note?: string }[] }) {
  return (
    <div>
      {npcs.map(npc => (
        <div key={npc.id} className={row}>
          {npc.img ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={npcImage(npc.id)} alt="" width={40} height={40} loading="lazy" className="size-10 shrink-0 object-contain [image-rendering:pixelated]" />
          ) : (
            <span className="size-10 shrink-0" />
          )}
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-extrabold">{npc.n}</div>
            {npc.note ? <div className="text-xs ink-soft">{npc.note}</div> : null}
          </div>
          <Link href={`/db/npcs/${npc.id}`} className={actionLink}>
            看 NPC
          </Link>
        </div>
      ))}
    </div>
  );
}

export function DoorRows({ doors }: { doors: { to: number; n: string; href: string }[] }) {
  return (
    <div>
      {doors.map(door => (
        <div key={door.to} className={row}>
          <span className="inline-flex size-[22px] shrink-0 items-center justify-center rounded-md border-2 border-[color:var(--leaf)]">
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
              <path d="M2 5h6M5 2l3 3-3 3" stroke="var(--leaf)" strokeWidth="1.6" fill="none" />
            </svg>
          </span>
          <span className="min-w-0 flex-1 text-[15px] font-extrabold">{door.n}</span>
          <Link href={door.href} className={actionLink}>
            過去看
          </Link>
        </div>
      ))}
    </div>
  );
}

/** NPC 頁「在哪」：每張所在地圖一列，小字寫「大陸・區域」 */
export function PlaceRows({ places }: { places: { id: number; n: string; sub?: string }[] }) {
  return (
    <div>
      {places.map(place => (
        <div key={place.id} className={row}>
          <div className="min-w-0 flex-1">
            <Link href={`/db/maps/${place.id}`} className="text-[15px] font-extrabold hover:text-[color:var(--maple)]">
              {place.n}
            </Link>
            {place.sub ? <div className="text-xs ink-soft">{place.sub}</div> : null}
          </div>
          <Link href={`/db/maps/${place.id}`} className={actionLink}>
            看地圖
          </Link>
        </div>
      ))}
    </div>
  );
}

function ShopRow({ line, name }: { line: ShopLine; name: string }) {
  const body = (
    <div className={`${row} py-1.5`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={itemImage(line.id)} alt="" width={32} height={32} loading="lazy" className="size-8 shrink-0 object-contain [image-rendering:pixelated]" />
      <div className="min-w-0 flex-1">
        <Link href={`/db/items?id=${line.id}`} className="text-sm font-extrabold hover:text-[color:var(--maple)]">
          {name}
        </Link>
        <div className="flex flex-wrap items-center gap-1.5 text-xs ink-soft">
          {line.s}
          {line.until ? <Chip tone="maple">活動限定・到 {line.until}</Chip> : null}
        </div>
      </div>
      <b className="shrink-0 text-right text-sm font-black tabular-nums">{line.price}</b>
    </div>
  );
  // 活動店：過了結束時間瀏覽器自己藏起來，不用等重建
  return line.e ? <OpenUntil end={line.e}>{body}</OpenUntil> : body;
}

/** NPC 頁「賣什麼」：先列 first 樣，其餘收在 details（不靠 JavaScript 也打得開） */
export function ShopRows({ lines, nameOf, first = 8 }: { lines: ShopLine[]; nameOf: (id: number) => string; first?: number }) {
  const head = lines.slice(0, first);
  const rest = lines.slice(first);
  return (
    <div>
      {head.map((line, index) => (
        <ShopRow key={`${line.id}-${line.pr}-${index}`} line={line} name={nameOf(line.id)} />
      ))}
      {rest.length ? (
        <details className="group">
          <summary className="tap-safe flex cursor-pointer list-none justify-center border-t border-[color:var(--paper-edge)] pt-2.5 text-[13px] font-extrabold text-[color:var(--maple)] hover:underline [&::-webkit-details-marker]:hidden">
            <span className="group-open:hidden">看全部 {lines.length} 樣</span>
            <span className="hidden group-open:inline">收起來</span>
          </summary>
          <div className="mt-2.5">
            {rest.map((line, index) => (
              <ShopRow key={`${line.id}-${line.pr}-${index}`} line={line} name={nameOf(line.id)} />
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}

/** NPC 頁「任務」：任務名連任務頁，後面小字寫這個 NPC 的角色（接、交、接・交、相關） */
export function QuestRows({ quests }: { quests: NonNullable<AtlasNpc["quests"]> }) {
  return (
    <div>
      {quests.map(quest => (
        <div key={quest.id} className={row}>
          <div className="min-w-0 flex-1">
            <Link href={`/db/quests/${quest.id}`} className="text-[15px] font-extrabold hover:text-[color:var(--maple)]">
              {quest.n}
            </Link>
            <span className="ml-1.5 text-xs ink-soft">{quest.r}</span>
          </div>
          <Link href={`/db/quests/${quest.id}`} className={actionLink}>
            看任務
          </Link>
        </div>
      ))}
    </div>
  );
}
