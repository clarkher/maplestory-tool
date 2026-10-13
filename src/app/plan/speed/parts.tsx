// src/app/plan/speed/parts.tsx
"use client";

import Link from "next/link";
import { memo, useId, useState } from "react";
import { GoButton } from "@/components/PlanShell";
import { MapPicker } from "@/components/MapPicker";
import { itemImage, mapName, monsterImage } from "@/lib/data";
import { formatNumber } from "@/lib/format";
import { monsterDrops } from "@/lib/monster-view";
import { killExp, type Member } from "@/lib/speed/party-exp";
import type { BoardRow } from "@/lib/speed/server/rules";
import type { SpeedSettings } from "@/lib/speed/settings";
import { jobName, partyKillLine } from "@/lib/speed/view";
import type { Item, MapRecord, Monster, TrainingRow } from "@/lib/types";

export const BUTTON_MAIN = "rounded-full bg-[color:var(--maple)] px-4 py-2 font-bold text-[color:var(--on-accent)] disabled:opacity-60";
export const BUTTON_LINE = "rounded-full border border-[color:var(--paper-edge)] px-3 py-1.5 text-sm font-bold hover:bg-[color:var(--maple-wash)]";

export function Card({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[var(--radius-card)] glass wood-frame p-4 sm:p-5">
      {title ? <h2 className="mb-3 text-lg font-black">{title}</h2> : null}
      {children}
    </section>
  );
}

/** 角色 ID、要不要在排行顯示：第一次用要填；填過收成一行，按「改」再打開 */
export function CharacterCard({ settings, onSave }: { settings: SpeedSettings; onSave: (patch: Pick<SpeedSettings, "charId" | "isPublic">) => void }) {
  const [editing, setEditing] = useState(!settings.charId);
  const [error, setError] = useState<string | null>(null);
  const errorId = useId();
  if (!editing && settings.charId) {
    return (
      <Card>
        <div className="flex items-center justify-between gap-3">
          <p className="min-w-0 text-sm">
            <span className="font-bold">你的角色：{settings.charId}</span>
            <span className="ink-soft"> · {settings.isPublic ? "排行顯示這個 ID" : "排行顯示「匿名玩家」"}</span>
          </p>
          <button type="button" onClick={() => setEditing(true)} className="shrink-0 text-sm font-bold text-[color:var(--sky)] hover:underline">
            改
          </button>
        </div>
      </Card>
    );
  }
  return (
    <Card title="你的角色">
      <form
        className="space-y-3"
        onSubmit={event => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          const charId = String(data.get("charId") ?? "").trim();
          const length = Array.from(charId).length;
          if (length < 2 || length > 12) {
            setError("角色 ID 要 2～12 個字。");
            return;
          }
          setError(null);
          onSave({ charId, isPublic: data.get("isPublic") === "on" });
          setEditing(false);
        }}
      >
        <label className="block text-sm font-bold">
          角色 ID
          <input
            name="charId"
            defaultValue={settings.charId}
            required
            maxLength={12}
            autoComplete="off"
            aria-invalid={error !== null}
            aria-describedby={error ? errorId : undefined}
            className="mt-1 block w-full rounded-lg border border-[color:var(--paper-edge)] bg-[color:var(--paper)] px-3 py-2 text-base font-normal outline-none focus:border-[color:var(--maple)]"
          />
        </label>
        {/* 讀螢幕軟體要唸得出來：role=alert 一出現就唸，欄位用 aria-describedby 指過來 */}
        {error ? (
          <p id={errorId} role="alert" className="text-[13px] font-bold text-[color:var(--maple)]">
            {error}
          </p>
        ) : null}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="isPublic" defaultChecked={settings.isPublic} className="size-4 accent-[color:var(--maple)]" />
          排行榜顯示我的 ID（不勾就顯示「匿名玩家」）
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className={`${BUTTON_MAIN} text-sm`}>
            存起來
          </button>
          {settings.charId ? (
            <button type="button" onClick={() => setEditing(false)} className="text-sm font-bold ink-soft hover:underline">
              取消
            </button>
          ) : null}
          <span className="text-[13px] ink-soft">存在這台電腦，下次不用再填。</span>
        </div>
      </form>
    </Card>
  );
}

export function BigNumber({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div>
      <p className="text-sm font-bold ink-soft">{label}</p>
      <p className="text-[34px] font-black leading-tight tabular-nums">{value}</p>
      {note ? <p className="text-[13px] ink-soft">{note}</p> : null}
    </div>
  );
}

/** 認不出地圖時：候選點一下（記住這個長相），或自己搜 */
export function MapChoices({ choices, maps, onPick }: { choices: number[]; maps: Record<string, MapRecord>; onPick: (mapId: number) => void }) {
  return (
    <div className="space-y-3">
      <p className="text-sm font-bold">你在哪張圖？點一次，之後會記住。</p>
      {choices.length ? (
        <div className="flex flex-wrap gap-2">
          {choices.map(id => (
            <button key={id} type="button" onClick={() => onPick(id)} className="rounded-full border border-[color:var(--paper-edge)] px-3 py-1.5 text-sm font-bold hover:bg-[color:var(--maple-wash)]">
              {mapName(maps, id)}
            </button>
          ))}
        </div>
      ) : null}
      <MapPicker label={choices.length ? "找不到就搜尋" : "搜尋地圖"} value={null} maps={maps} onSelect={onPick} />
    </div>
  );
}

/**
 * 偵測到的地圖：名字、帶我去、這張圖的怪（等級、HP、經驗、刷怪點、掉寶、算傷害）。
 * party 有給（勾了組隊、有隊友、知道自己等級）時，每隻怪多一行「組隊每隻」，卡片最下面標公式的出處。
 * 包成 memo：頁面每秒讀一張畫面就重畫一次，這張卡（一張圖上百個掉寶）的 props 沒變就整張跳過。
 */
export const MapPanel = memo(function MapPanel({
  mapId,
  maps,
  monsterById,
  items,
  training,
  party,
}: {
  mapId: number;
  maps: Record<string, MapRecord>;
  monsterById: Map<number, Monster>;
  items: Map<number, Item>;
  training: TrainingRow[];
  party: Member[] | null;
}) {
  const row = training.find(item => item.m === mapId);
  const mobs = (row?.mobs ?? []).flatMap(([id, spawns]) => {
    const monster = monsterById.get(id);
    return monster ? [{ monster, spawns }] : [];
  });
  const name = mapName(maps, mapId);
  return (
    <Card>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="min-w-0">
          {maps[String(mapId)]?.st ? <p className="text-[13px] ink-soft">{maps[String(mapId)].st}</p> : null}
          <h2 className="text-lg font-black">{name}</h2>
        </div>
        <GoButton to={mapId} place={name} />
      </div>
      {mobs.length ? (
        <ul className="space-y-3">
          {mobs.map(({ monster, spawns }) => {
            const { shown } = monsterDrops(monster.drops, items);
            return (
              <li key={monster.id} className="rounded-xl border border-[color:var(--paper-edge)] p-3">
                <div className="flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={monsterImage(monster.id)} alt="" width={40} height={40} className="size-10 shrink-0 object-contain" />
                  <div className="min-w-0 flex-1">
                    <p className="font-bold">{monster.n}</p>
                    <p className="text-[13px] ink-soft">
                      Lv.{monster.lv ?? "?"} · HP {formatNumber(monster.hp)} · 經驗 {formatNumber(monster.exp)} · 刷怪點 {spawns} 個
                    </p>
                  </div>
                  <Link href={`/plan/damage?mob=${monster.id}`} className="shrink-0 text-sm font-bold text-[color:var(--sky)] hover:underline">
                    算傷害
                  </Link>
                </div>
                {party && monster.exp ? <p className="mt-2 text-[13px] font-bold">{partyKillLine(killExp(monster.exp, monster.lv ?? 0, party))}</p> : null}
                {shown.length ? (
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {shown.map(itemId => (
                      <li key={itemId}>
                        <Link
                          href={`/db/items?id=${itemId}`}
                          className="inline-flex items-center gap-1 rounded-full bg-[color:var(--paper-deep)] py-0.5 pl-0.5 pr-2 text-[12px] font-bold transition-colors hover:bg-[color:var(--maple-wash)]"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={itemImage(itemId)} alt="" width={18} height={18} loading="lazy" className="size-[18px] object-contain" />
                          {items.get(itemId)?.n}
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm ink-soft">這張圖沒有怪物資料。</p>
      )}
      {party && mobs.length ? (
        <p className="mt-3 text-[12px] leading-relaxed ink-soft">
          組隊經驗照玩家整理的公式算（打到的人多拿 20%、其他照等級分，加組隊加成），台服沒驗證；沒算祈禱、經驗卷。
        </p>
      ) : null}
    </Card>
  );
});

export type BoardState = { kind: "loading" } | { kind: "error" } | { kind: "ok"; open: boolean; solo: BoardRow[]; party: BoardRow[] };

/** 一張圖的排行：單練照 10 分鐘經驗、組隊照全隊 10 分鐘打幾隻，各前 10 名（memo：每秒重畫時 props 沒變就跳過） */
export const Leaderboard = memo(function Leaderboard({ board, tab, onTab }: { board: BoardState; tab: "solo" | "party"; onTab: (tab: "solo" | "party") => void }) {
  const rows = board.kind === "ok" ? board[tab] : [];
  const ids = useId();
  const tabId = (key: "solo" | "party") => `${ids}-tab-${key}`;
  const panelId = `${ids}-panel`;
  return (
    <Card title="這張圖的實測排行">
      <div className="mb-3 flex gap-1" role="tablist" aria-label="排行分頁">
        {(["solo", "party"] as const).map(key => (
          <button
            key={key}
            id={tabId(key)}
            type="button"
            role="tab"
            aria-selected={tab === key}
            aria-controls={panelId}
            onClick={() => onTab(key)}
            className={`rounded-full px-3 py-1 text-sm font-bold ${tab === key ? "bg-[color:var(--maple)] text-[color:var(--on-accent)]" : "ink-soft hover:bg-[color:var(--maple-wash)]"}`}
          >
            {key === "solo" ? "單練" : "組隊"}
          </button>
        ))}
      </div>
      <div id={panelId} role="tabpanel" aria-labelledby={tabId(tab)}>
        {board.kind === "loading" ? (
          <p className="text-sm ink-soft">載入中…</p>
        ) : board.kind === "error" ? (
          <p className="text-sm ink-soft">排行暫時連不上，等一下再過來。</p>
        ) : !board.open ? (
          <p className="text-sm ink-soft">排行還沒開。</p>
        ) : rows.length ? (
          <ol className="space-y-1.5">
            {rows.map((row, index) => {
              const job = jobName(row.job);
              return (
                <li key={`${row.name ?? "匿名"}-${index}`} className="flex items-baseline gap-2 text-sm">
                  <span className="w-5 shrink-0 text-right font-black tabular-nums">{index + 1}</span>
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-bold">{row.name ?? "匿名玩家"}</span>
                    <span className="ink-soft">
                      {" "}
                      · {job ? `${job} ` : ""}Lv.{row.level}
                      {tab === "party" ? ` · ${row.partySize} 人隊` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 font-bold tabular-nums">{tab === "party" ? `全隊 ${row.kills !== null ? formatNumber(Math.round(row.kills)) : "—"} 隻／10 分` : formatNumber(row.expPer10)}</span>
                  <span className="w-[104px] shrink-0 text-right text-[12px] ink-soft">
                    練 {row.minutes} 分 · {row.date.slice(5).replace("-", "/")}
                  </span>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="text-sm ink-soft">這張圖還沒有人練滿 10 分鐘。</p>
        )}
        <p className="mt-3 text-[12px] ink-soft">
          {tab === "party" ? "數字是全隊 10 分鐘打幾隻，用隊長填的等級回推。" : "數字是 10 分鐘拿到的經驗。"}玩家自己量的，沒有驗證。
        </p>
      </div>
    </Card>
  );
});

export function Disclaimer() {
  return <p className="text-[13px] leading-relaxed ink-soft">這是玩家做的工具，不是官方的。只看你分享出來的畫面，不讀、不改遊戲程式。用不用由你決定。</p>;
}
