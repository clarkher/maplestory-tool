// src/app/plan/speed/MesoCard.tsx
"use client";

import { useId } from "react";
import { itemImage } from "@/lib/data";
import { Card } from "./parts";

export type PotionRow = { key: string; iconId: number; text: string };

const FIELD =
  "mt-1 block w-full rounded-lg border border-[color:var(--paper-edge)] bg-[color:var(--paper)] px-3 py-1.5 text-base font-normal tabular-nums outline-none focus:border-[color:var(--maple)]";

/**
 * 楓幣收益卡（v1.20 版面 C）：撿到／藥水／淨賺（都是每 10 分鐘）、玩家自己填的「開始時楓幣」「現在楓幣」、
 * 每種藥水一行，最後是讀不到快捷鍵、補過藥、有一段沒算到的提醒。
 */
export function MesoCard({
  picked,
  potion,
  net,
  startText,
  nowText,
  onStart,
  onNow,
  potions,
  noQuickslot,
  restocked,
  uncounted,
}: {
  picked: string;
  potion: string;
  net: string;
  startText: string;
  nowText: string;
  onStart: (text: string) => void;
  onNow: (text: string) => void;
  potions: PotionRow[];
  noQuickslot: boolean;
  restocked: boolean;
  uncounted: boolean;
}) {
  const ids = useId();
  const filled = net !== "—";
  return (
    <Card>
      <h2 className="text-[15px] font-black">楓幣收益</h2>
      <div className="mt-2 grid grid-cols-3 gap-2.5">
        <Cell label="撿到" value={picked} />
        <Cell label="藥水" value={potion} color="text-[color:var(--maple)]" />
        <Cell label="淨賺" value={net} color="text-[color:var(--leaf)]" />
      </div>
      <p className="mt-1 text-[12px] ink-soft">都是每 10 分鐘</p>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <label htmlFor={`${ids}-start`} className="text-[13px] font-bold">
          開始時楓幣
          <input id={`${ids}-start`} inputMode="numeric" autoComplete="off" value={startText} onChange={event => onStart(event.target.value)} className={FIELD} />
        </label>
        <label htmlFor={`${ids}-now`} className="text-[13px] font-bold">
          現在楓幣
          <input id={`${ids}-now`} inputMode="numeric" autoComplete="off" value={nowText} onChange={event => onNow(event.target.value)} className={FIELD} />
        </label>
      </div>
      {filled ? null : <p className="mt-1.5 text-[12px] ink-soft">開道具欄看楓幣，填開始跟現在就算得出來</p>}
      {potions.length ? (
        <ul className="mt-3 space-y-1 text-[13px]">
          {potions.map(row => (
            <li key={row.key} className="flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={itemImage(row.iconId)} alt="" width={24} height={24} className="size-6 shrink-0 object-contain [image-rendering:pixelated]" />
              <span>{row.text}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {noQuickslot ? <p className="mt-2 text-[13px] font-bold text-[color:var(--gold)]">讀不到快捷鍵：把快捷鍵打開、不要擋到</p> : null}
      {restocked ? <p className="mt-2 text-[12px] ink-soft">這段中途補過藥，楓幣只供參考</p> : null}
      {uncounted ? <p className="mt-1 text-[12px] ink-soft">有一段沒算到（數字跳太多）</p> : null}
    </Card>
  );
}

function Cell({ label, value, color = "" }: { label: string; value: string; color?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[13px] font-bold ink-soft">{label}</p>
      <p className={`truncate text-[22px] font-black leading-tight tabular-nums sm:text-[26px] ${value === "—" ? "" : color}`}>{value}</p>
    </div>
  );
}
