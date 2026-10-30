import { Fragment } from "react";
import { labelSides, type LabelSide, mobColor, pinPercent, showNpcLabels } from "@/lib/atlas-view";
import type { AtlasMap } from "@/lib/types";

/** 圖很扁（城鎮常見）時，畫面至少這麼高，寬度不夠就在卡片裡左右滑 */
const MIN_HEIGHT = 170;

/**
 * 標籤怎麼對齊點：水平方向照點在圖上的位置等比例往回推（點在 10% 就把標籤往左推自己寬度的 10%），
 * 所以靠左邊往右長、靠右邊往左長、中間置中，怎樣都不會超出圖框。
 * 上下由 labelSides 決定：靠上緣、或放上面會跟別的標籤疊到時放點的下方。
 */
function labelShift(left: number, side: LabelSide): string {
  return `translate(-${left}%, ${side === "down" ? "40%" : "-115%"})`;
}

/**
 * 疊的順序（下到上）：門標籤 z1 → NPC 標籤 z2 → 門、NPC 的位置小點 z3 → 怪物圓點 z4。
 * 怪物點、每個門／NPC 真正的位置永遠看得到，標籤只是說明，被蓋一點沒關係。
 */
const marker = "absolute z-[3] -ml-[3.5px] -mt-[3.5px] size-[7px] rounded-full border-[1.5px] border-[#222]";

const labelBase =
  "absolute max-w-[46%] overflow-hidden text-ellipsis whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-black leading-tight shadow-[0_1px_3px_#0007]";

/** 整張地圖畫面，上面疊怪物圓點、NPC、門（伺服器畫好，不用 JavaScript） */
export function MapView({ map, src }: { map: AtlasMap & { b: [number, number, number, number] }; src: string }) {
  const [, , width, height] = map.b;
  const ratio = width / height;
  const labels = showNpcLabels(map.npcs);
  const minWidth = Math.round(MIN_HEIGHT * ratio);
  const npcs = map.npcs.map(npc => ({ npc, pos: pinPercent(map.b, [npc.x, npc.y]) }));
  const doors = map.doors.flatMap(door => door.p.map(point => ({ door, pos: pinPercent(map.b, point) })));
  // 先排 NPC 名字（有寫名字時）再排門，靠很近的後者翻到點下方
  const sides = labelSides([...(labels ? npcs : []).map(item => item.pos), ...doors.map(item => item.pos)]);
  const npcSide = (index: number) => sides[index];
  const doorSide = (index: number) => sides[(labels ? npcs.length : 0) + index];

  return (
    <div>
      <div className="overflow-x-auto overscroll-x-contain rounded-[14px] border border-[color:var(--paper-edge)]">
        <div className="relative overflow-hidden bg-black" style={{ minWidth, aspectRatio: `${width} / ${height}` }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={`${map.n}的地圖畫面`} className="absolute inset-0 block size-full" />

          {map.mobs.flatMap((mob, index) =>
            mob.p.map((point, n) => {
              const pos = pinPercent(map.b, point);
              return (
                <span
                  key={`m${mob.id}-${n}`}
                  data-mob={mob.id}
                  className="absolute z-[4] -ml-[5.5px] -mt-[5.5px] size-[11px] rounded-full border-2 border-white shadow-[0_1px_2px_#0006]"
                  style={{ left: `${pos.left}%`, top: `${pos.top}%`, background: mobColor(index) }}
                />
              );
            }),
          )}

          {npcs.map(({ npc, pos }, index) =>
            labels ? (
              <Fragment key={`n${npc.id}`}>
                <span
                  className={`${labelBase} z-[2] bg-white text-[#222]`}
                  style={{ left: `${pos.left}%`, top: `${pos.top}%`, transform: labelShift(pos.left, npcSide(index)) }}
                >
                  {npc.n}
                </span>
                <span className={`${marker} bg-white`} style={{ left: `${pos.left}%`, top: `${pos.top}%` }} />
              </Fragment>
            ) : (
              <span
                key={`n${npc.id}`}
                title={npc.n}
                className="absolute z-[3] -ml-[5px] -mt-[5px] size-[10px] rotate-45 border-[1.5px] border-[#222] bg-[#ffd84a]"
                style={{ left: `${pos.left}%`, top: `${pos.top}%` }}
              />
            ),
          )}

          {doors.map(({ door, pos }, n) => {
            return (
              <Fragment key={`d${door.to}-${n}`}>
                <span
                  className={`${labelBase} z-[1] bg-[color:var(--leaf)] text-[color:var(--on-accent)]`}
                  style={{ left: `${pos.left}%`, top: `${pos.top}%`, transform: labelShift(pos.left, doorSide(n)) }}
                >
                  往 {door.n}
                </span>
                <span className={`${marker} bg-[color:var(--leaf)]`} style={{ left: `${pos.left}%`, top: `${pos.top}%` }} />
              </Fragment>
            );
          })}
        </div>
      </div>
      {/* 手機卡片內寬約 300 多、電腦約 560：超過才會出現左右捲動 */}
      {minWidth > 330 ? (
        <p className={`mt-1.5 text-xs ink-faint ${minWidth > 560 ? "" : "sm:hidden"}`}>圖比較寬，左右滑看整張</p>
      ) : null}

      <div className="mt-2 flex flex-wrap gap-x-2.5 gap-y-1 text-xs ink-soft">
        {map.mobs.map((mob, index) => (
          <span key={mob.id} className="inline-flex items-center gap-1">
            <span className="inline-block size-[9px] rounded-full" style={{ background: mobColor(index) }} />
            {mob.n}
          </span>
        ))}
        {map.npcs.length ? (
          labels ? (
            <span>白色標籤＝NPC</span>
          ) : (
            <span className="inline-flex items-center gap-1">
              <span className="inline-block size-[8px] rotate-45 border border-[#222] bg-[#ffd84a]" />
              NPC
            </span>
          )
        ) : null}
        {doors.length ? <span>綠色標籤＝門</span> : null}
      </div>
    </div>
  );
}
