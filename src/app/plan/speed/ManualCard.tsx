// src/app/plan/speed/ManualCard.tsx
"use client";

import { useId, useState } from "react";
import { MapPicker } from "@/components/MapPicker";
import { formatNumber } from "@/lib/format";
import type { MapRecord } from "@/lib/types";
import { etaText } from "@/lib/speed/format";
import { autoMinutes, expFromPercent, manualResult, parseManualRow, parseMinutes, type ManualState, type ManualText } from "@/lib/speed/manual";
import { BUTTON_LINE, BUTTON_MAIN, Card } from "./parts";

const FIELD =
  "mt-1 block w-full rounded-lg border bg-[color:var(--paper)] px-3 py-1.5 text-base font-normal tabular-nums outline-none focus:border-[color:var(--maple)]";

/** 欄位裡的字照原樣留（玩家可能打到一半），畫面上的 % 跟結果才照驗過的算 */
function rowView(text: ManualText, toNext: number[]) {
  const parsed = parseManualRow(text, toNext);
  const levelOnly = parseManualRow({ level: text.level, exp: "0" }, toNext);
  const level = levelOnly.ok ? levelOnly.row.level : null;
  const percent = parsed.ok ? (parsed.row.exp / toNext[parsed.row.level]) * 100 : null;
  return { parsed, level, percent };
}

function clock(at: number): string {
  const time = new Date(at);
  return `${String(time.getHours()).padStart(2, "0")}:${String(time.getMinutes()).padStart(2, "0")}`;
}

/**
 * 首屏「自己填等級、經驗」（v2.09，2026-11-11 使用者選 A）：開始、現在各一列，經驗可以打數字也可以拉 %（防呆：
 * 等級要在表裡、經驗不能超過這一級、現在不能比開始少）。填好一列就記下時間，兩列都好就算 10 分鐘經驗、升級還要多久；
 * 分鐘照兩次的時間差先填（差不到 3 分鐘＝一起填的，不帶、請玩家填），可以改。結果不進排行（手打的沒辦法驗證），選了地圖可以記進「跟我之前比」。
 */
export function ManualCard({
  state,
  toNext,
  maps,
  now,
  onChange,
  onRecord,
}: {
  state: ManualState;
  toNext: number[];
  maps: Record<string, MapRecord>;
  /** 現在時間（「現在」那列按「填現在時間」用） */
  now: () => number;
  onChange: (next: ManualState) => void;
  /** 記進跟我之前比：回 false＝沒記成（沒有 localStorage） */
  onRecord: (entry: { mapId: number; level: number; per10: number; sec: number }) => boolean;
}) {
  const ids = useId();
  const [mapId, setMapId] = useState<number | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const start = rowView(state.start, toNext);
  const current = rowView(state.now, toNext);
  const auto = autoMinutes(state.start.at, state.now.at);
  const minutesText = state.minutes || (auto !== null ? String(auto) : "");
  // 兩列都填好、卻看不出練了多久（同時填的）：請玩家自己填，不猜
  const askMinutes = !minutesText && start.parsed.ok && current.parsed.ok;
  const minutes = parseMinutes(minutesText);
  const result = start.parsed.ok && current.parsed.ok && minutes.ok ? manualResult(start.parsed.row, current.parsed.row, minutes.minutes, toNext) : null;

  const setRow = (key: "start" | "now", patch: Partial<ManualText>) => {
    const next = { ...state[key], ...patch };
    // 這一列填好（等級、經驗都對）就記下時間；改了數字也更新時間（玩家是照現在的畫面填的）
    const ok = parseManualRow(next, toNext).ok;
    setSaved(null);
    onChange({ ...state, [key]: { ...next, at: ok ? now() : null } });
  };

  return (
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-black">自己填等級、經驗</h2>
        <p className="text-[12px] ink-soft">練之前填「開始」，練完填「現在」，就算得出 10 分鐘拿多少</p>
      </div>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <Row id={`${ids}-start`} title="開始" text={state.start} view={start} toNext={toNext} onRow={patch => setRow("start", patch)} />
        <Row id={`${ids}-now`} title="現在" text={state.now} view={current} toNext={toNext} onRow={patch => setRow("now", patch)} />
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label htmlFor={`${ids}-min`} className="text-[13px] font-bold">
          練了幾分鐘
          <input
            id={`${ids}-min`}
            inputMode="numeric"
            autoComplete="off"
            value={minutesText}
            placeholder="兩列都填好會自己算"
            onChange={event => {
              setSaved(null);
              onChange({ ...state, minutes: event.target.value });
            }}
            aria-invalid={minutesText !== "" && !minutes.ok}
            className={`${FIELD} w-40 ${minutesText !== "" && !minutes.ok ? "border-[color:var(--maple)]" : "border-[color:var(--paper-edge)]"}`}
          />
        </label>
        {state.minutes && auto !== null ? (
          <button type="button" onClick={() => onChange({ ...state, minutes: "" })} className="pb-2 text-sm font-bold text-[color:var(--sky)] hover:underline">
            照填的時間算（{auto} 分）
          </button>
        ) : null}
        <button
          type="button"
          disabled={!current.parsed.ok}
          onClick={() => {
            setSaved(null);
            onChange({ start: { ...state.now }, now: { level: state.now.level, exp: "", at: null }, minutes: "" });
          }}
          className={`${BUTTON_LINE} mb-0.5 disabled:opacity-50`}
        >
          從現在接著算
        </button>
      </div>
      {askMinutes ? <p className="mt-1 text-[13px] font-bold text-[color:var(--maple)]">兩列差不多同時填的，看不出練了多久：請填練了幾分鐘</p> : null}
      {minutesText !== "" && !minutes.ok ? <p role="alert" className="mt-1 text-[13px] font-bold text-[color:var(--maple)]">{minutes.error}</p> : null}

      <div className="mt-4 border-t border-[color:var(--paper-edge)] pt-3" aria-live="polite">
        {result?.ok ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[13px] ink-soft">10 分鐘經驗</p>
                <p className="text-[26px] font-black tabular-nums">{formatNumber(Math.round(result.per10))}</p>
              </div>
              <div>
                <p className="text-[13px] ink-soft">升級還要</p>
                <p className="text-[26px] font-black tabular-nums">{etaText(result.etaMinutes)}</p>
              </div>
            </div>
            <p className="mt-1 text-[13px] ink-soft">
              {minutes.ok ? `${minutes.minutes} 分鐘拿到 ${formatNumber(result.gained)}。` : ""}自己填的不進排行，選了地圖可以記進「跟我之前比」。
            </p>
            <div className="mt-2 flex flex-wrap items-end gap-2">
              <div className="min-w-[220px] flex-1">
                <MapPicker label="在哪張圖" value={mapId} maps={maps} onSelect={id => { setMapId(id); setSaved(null); }} />
              </div>
              <button
                type="button"
                disabled={mapId === null || !current.parsed.ok || !minutes.ok}
                onClick={() => {
                  if (mapId === null || !current.parsed.ok || !minutes.ok) return;
                  const ok = onRecord({ mapId, level: current.parsed.row.level, per10: Math.round(result.per10), sec: minutes.minutes * 60 });
                  setSaved(ok ? "記好了" : "這個瀏覽器存不了（可能是無痕模式）");
                }}
                className={`${BUTTON_MAIN} disabled:opacity-50`}
              >
                記進跟我之前比
              </button>
            </div>
            {saved ? <p role="status" className="mt-1 text-[13px] font-bold">{saved}</p> : null}
          </>
        ) : (
          <p className="text-sm ink-soft">{result && !result.ok ? result.error : "兩列都填好就會算出來。"}</p>
        )}
      </div>
    </Card>
  );
}

function Row({
  id,
  title,
  text,
  view,
  toNext,
  onRow,
}: {
  id: string;
  title: string;
  text: ManualText;
  view: ReturnType<typeof rowView>;
  toNext: number[];
  onRow: (patch: Partial<ManualText>) => void;
}) {
  const levelBad = !view.parsed.ok && view.parsed.field === "level" && text.level !== "";
  const expBad = !view.parsed.ok && view.parsed.field === "exp" && text.exp !== "";
  const error = levelBad || expBad ? (view.parsed.ok ? null : view.parsed.error) : null;
  const sliderPercent = view.percent ?? 0;
  return (
    <fieldset className="min-w-0">
      <legend className="flex w-full items-baseline justify-between text-[14px] font-black">
        {title}
        <span className="text-[12px] font-normal ink-soft">{text.at !== null ? `${clock(text.at)} 填的` : ""}</span>
      </legend>
      <div className="mt-1 grid grid-cols-[5.5rem_minmax(0,1fr)] gap-2">
        <label htmlFor={`${id}-lv`} className="text-[13px] font-bold">
          等級
          <input
            id={`${id}-lv`}
            inputMode="numeric"
            autoComplete="off"
            value={text.level}
            onChange={event => onRow({ level: event.target.value })}
            aria-invalid={levelBad}
            className={`${FIELD} ${levelBad ? "border-[color:var(--maple)]" : "border-[color:var(--paper-edge)]"}`}
          />
        </label>
        <label htmlFor={`${id}-exp`} className="text-[13px] font-bold">
          目前經驗
          <input
            id={`${id}-exp`}
            inputMode="numeric"
            autoComplete="off"
            value={text.exp}
            onChange={event => onRow({ exp: event.target.value })}
            aria-invalid={expBad}
            className={`${FIELD} ${expBad ? "border-[color:var(--maple)]" : "border-[color:var(--paper-edge)]"}`}
          />
        </label>
      </div>
      <div className="mt-2 flex items-center gap-3">
        <input
          type="range"
          min={0}
          max={100}
          step={0.01}
          value={sliderPercent}
          disabled={view.level === null}
          aria-label={`${title}的經驗百分比`}
          onChange={event => {
            if (view.level === null) return;
            const exp = expFromPercent(Number(event.target.value), view.level, toNext);
            if (exp !== null) onRow({ exp: String(exp) });
          }}
          className="h-2 flex-1 accent-[color:var(--maple)] disabled:opacity-40"
        />
        <span className="w-16 shrink-0 text-right text-[13px] font-bold tabular-nums">{view.percent !== null ? `${view.percent.toFixed(2)}%` : "—"}</span>
      </div>
      {view.level === null && text.level === "" ? <p className="mt-1 text-[12px] ink-soft">先填等級才能拉 %</p> : null}
      {error ? (
        <p role="alert" className="mt-1 text-[13px] font-bold text-[color:var(--maple)]">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
