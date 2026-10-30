import Link from "next/link";
import { monsterImage, npcImage } from "@/lib/asset-paths";
import { mobColor } from "@/lib/atlas-view";
import type { AtlasMap } from "@/lib/types";

/** 地圖頁的一張卡（怪物、NPC、門各一張） */
export function AtlasCard({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[1.125rem] border border-[color:var(--paper-edge)] bg-[color:var(--glass-strong)] p-4">
      <h2 className="mb-2 flex items-baseline gap-2">
        <span className="text-base font-black">{title}</span>
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
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={monsterImage(mob.id)} alt="" width={36} height={36} loading="lazy" className="size-9 shrink-0 object-contain [image-rendering:pixelated]" />
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

export function DoorRows({ doors }: { doors: { to: number; n: string; href: string; town?: boolean }[] }) {
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
          {door.town ? (
            <span className="inline-flex min-h-6 shrink-0 items-center rounded-full border border-[color:var(--paper-edge)] px-2 text-xs font-extrabold ink-soft">
              城鎮
            </span>
          ) : null}
          <Link href={door.href} className={actionLink}>
            過去看
          </Link>
        </div>
      ))}
    </div>
  );
}
