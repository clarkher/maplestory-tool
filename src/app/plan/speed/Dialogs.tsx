// src/app/plan/speed/Dialogs.tsx
"use client";

import { useEffect, useId, useRef, useState } from "react";
import { mapName } from "@/lib/data";
import { formatNumber } from "@/lib/format";
import { checkCharId, parseCoupon, type Coupon } from "@/lib/speed/view";
import type { MapRecord } from "@/lib/types";
import { BUTTON_MAIN, MapChoices } from "./parts";

const FIELD =
  "mt-1 block w-full rounded-lg border border-[color:var(--paper-edge)] bg-[color:var(--paper)] px-3 py-2 text-base font-normal outline-none focus:border-[color:var(--maple)]";
export const SECOND = "rounded-md px-3 py-2 text-sm font-bold ink-soft hover:bg-[color:var(--maple-wash)]";

/**
 * 瀏覽器內建的對話框（showModal）：鍵盤焦點關在裡面、按 Esc 等於 onCancel、背後的頁面點不到。
 * open 由頁面控制；Esc 不讓瀏覽器自己關（不然 open 跟畫面對不起來），交給 onCancel。
 */
export function Modal({ open, labelledBy, onCancel, children }: { open: boolean; labelledBy: string; onCancel: () => void; children: React.ReactNode }) {
  // 瀏覽器有時會自己關（上一次 Esc 之後頁面沒再被點過，下一次 Esc 攔不住）：關掉時頁面還以為開著，就當成 onCancel，狀態才對得起來
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={labelledBy}
      onCancel={event => {
        event.preventDefault();
        onCancel();
      }}
      onClose={() => {
        if (open) onCancel();
      }}
      className="m-auto w-[min(26rem,calc(100vw-2rem))] rounded-[var(--radius-card)] border border-[color:var(--paper-edge)] bg-[color:var(--paper)] p-5 text-[color:var(--ink)] shadow-[var(--float-shadow)] backdrop:bg-[rgb(0_0_0/0.45)]"
    >
      {open ? children : null}
    </dialog>
  );
}

export type IdChoice = { charId: string | null; isPublic: boolean; askId: boolean };

/**
 * 按「分享遊戲畫面」時問要不要填角色 ID（mode＝start），或從控制卡那行打開來改（mode＝edit，不開始分享）。
 * ID 只用這次開著的頁面（2026-10-20 使用者：一個人會練很多隻，不記在電腦裡）；「排行顯示我的 ID」「下次不要再問我」記在電腦裡。
 * start 的兩顆按鈕都直接開始分享：分享視窗一定要在玩家點擊的當下叫出來，所以這裡按下去就呼叫 onConfirm(…, true)。
 */
export function IdDialog({
  mode,
  initial,
  onConfirm,
  onClose,
}: {
  mode: "start" | "edit" | null;
  initial: IdChoice;
  onConfirm: (choice: IdChoice, start: boolean) => void;
  onClose: () => void;
}) {
  const ids = useId();
  return (
    <Modal open={mode !== null} labelledBy={`${ids}-title`} onCancel={onClose}>
      {mode ? <IdForm key={mode} mode={mode} initial={initial} titleId={`${ids}-title`} onConfirm={onConfirm} onClose={onClose} /> : null}
    </Modal>
  );
}

function IdForm({
  mode,
  initial,
  titleId,
  onConfirm,
  onClose,
}: {
  mode: "start" | "edit";
  initial: IdChoice;
  titleId: string;
  onConfirm: (choice: IdChoice, start: boolean) => void;
  onClose: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const errorId = useId();
  const form = useRef<HTMLFormElement>(null);
  const flags = () => {
    const data = new FormData(form.current!);
    return { isPublic: data.get("isPublic") === "on", askId: data.get("dontAsk") !== "on" };
  };
  return (
    <form
      ref={form}
      className="space-y-3"
      onSubmit={event => {
        event.preventDefault();
        const checked = checkCharId(String(new FormData(event.currentTarget).get("charId") ?? ""));
        if (!checked.ok) {
          setError(checked.error);
          return;
        }
        onConfirm({ charId: checked.charId, ...flags() }, mode === "start");
      }}
    >
      <h2 id={titleId} className="text-lg font-black">
        {mode === "start" ? "這次要填角色 ID 嗎？" : "這次的角色 ID"}
      </h2>
      <p className="text-sm leading-relaxed ink-soft">填了，排行榜可以掛你的名字；不填也照樣記錄，排行寫「匿名玩家」。只用這次，重新整理就要重填。</p>
      <label className="block text-sm font-bold">
        角色 ID
        <input
          name="charId"
          defaultValue={initial.charId ?? ""}
          maxLength={24}
          autoComplete="off"
          autoFocus
          aria-invalid={error !== null}
          aria-describedby={error ? errorId : undefined}
          className={FIELD}
        />
      </label>
      {error ? (
        <p id={errorId} role="alert" className="text-[13px] font-bold text-[color:var(--maple)]">
          {error}
        </p>
      ) : null}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="isPublic" defaultChecked={initial.isPublic} className="size-4 accent-[color:var(--maple)]" />
        排行榜顯示我的 ID（不勾就寫「匿名玩家」）
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="dontAsk" defaultChecked={!initial.askId} className="size-4 accent-[color:var(--maple)]" />
        下次不要再問我
      </label>
      <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
        {mode === "start" ? (
          <button type="button" onClick={() => onConfirm({ charId: null, ...flags() }, true)} className={SECOND}>
            不填，直接開始
          </button>
        ) : (
          <button type="button" onClick={onClose} className={SECOND}>
            取消
          </button>
        )}
        <button type="submit" className={BUTTON_MAIN}>
          {mode === "start" ? "開始分享" : "好"}
        </button>
      </div>
      {mode === "start" ? <p className="text-[12px] ink-soft">勾了「下次不要再問我」，之後要填就按「分享遊戲畫面」下面的「填角色 ID」。</p> : null}
    </form>
  );
}

/** 一段存好、等玩家說有沒有開加倍券的：id、token 是伺服器給的（改同一筆用） */
export type PendingCoupon = {
  id: string;
  token: string;
  startedAt: number;
  minutes: number;
  duration: string;
  gained: number;
  /** 存的時候送出去的（補填後重寫「上一段」那句用） */
  run: { durationSec: number; mapId: number | null; charId: string | null };
};

/**
 * 一段存好就跳出來問「有沒有開加倍券」（2026-10-20 使用者）：這段已經先當沒開存了，勾了才送去改同一筆。
 * 倍率預設 1.5（1.10～3.00），其中幾分鐘有開預設整段。onSubmit 回錯誤訊息（null＝好了）；沒開直接關。
 */
export function CouponDialog({
  pending,
  onSubmit,
  onClose,
}: {
  pending: PendingCoupon | null;
  onSubmit: (pending: PendingCoupon, coupon: Coupon) => Promise<string | null>;
  onClose: (id: string) => void;
}) {
  const ids = useId();
  return (
    <Modal open={pending !== null} labelledBy={`${ids}-title`} onCancel={() => pending && onClose(pending.id)}>
      {pending ? <CouponForm key={pending.id} pending={pending} titleId={`${ids}-title`} onSubmit={onSubmit} onClose={onClose} /> : null}
    </Modal>
  );
}

function CouponForm({
  pending,
  titleId,
  onSubmit,
  onClose,
}: {
  pending: PendingCoupon;
  titleId: string;
  onSubmit: (pending: PendingCoupon, coupon: Coupon) => Promise<string | null>;
  onClose: (id: string) => void;
}) {
  const [on, setOn] = useState(false);
  const [mult, setMult] = useState("1.5");
  const [minutes, setMinutes] = useState(String(pending.minutes));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const errorId = useId();
  return (
    <form
      className="space-y-3"
      onSubmit={async event => {
        event.preventDefault();
        const parsed = parseCoupon(on, mult, minutes, pending.minutes);
        if (!parsed.ok) {
          setError(parsed.error);
          return;
        }
        if (!parsed.coupon) {
          onClose(pending.id);
          return;
        }
        setBusy(true);
        const failed = await onSubmit(pending, parsed.coupon);
        setBusy(false);
        if (failed) setError(failed);
        else onClose(pending.id);
      }}
    >
      <h2 id={titleId} className="text-lg font-black">
        上一段有開加倍券嗎？
      </h2>
      <p className="text-sm leading-relaxed ink-soft">
        練了 {pending.duration}、拿到 {formatNumber(pending.gained)} 經驗。勾了會扣掉加倍的部分，算出你實際的練功速度。
      </p>
      <label className="flex items-center gap-2 text-sm font-bold">
        <input type="checkbox" checked={on} onChange={event => setOn(event.target.checked)} className="size-4 accent-[color:var(--maple)]" />
        有開加倍券
      </label>
      {on ? (
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm font-bold">
            倍率
            <input
              value={mult}
              onChange={event => setMult(event.target.value)}
              inputMode="decimal"
              aria-describedby={`${errorId}-mult`}
              aria-invalid={error?.startsWith("倍率") ?? false}
              className={FIELD}
            />
            <span id={`${errorId}-mult`} className="mt-1 block text-[12px] font-normal ink-soft">
              1.10～3.00，例如 1.15、1.6
            </span>
          </label>
          <label className="block text-sm font-bold">
            其中幾分鐘有開
            <input
              value={minutes}
              onChange={event => setMinutes(event.target.value)}
              inputMode="numeric"
              aria-describedby={`${errorId}-min`}
              aria-invalid={error?.startsWith("有開的分鐘") ?? false}
              className={FIELD}
            />
            <span id={`${errorId}-min`} className="mt-1 block text-[12px] font-normal ink-soft">
              預設整段（{pending.minutes} 分鐘）
            </span>
          </label>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="text-[13px] font-bold text-[color:var(--maple)]">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
        {on ? (
          <button type="button" onClick={() => onClose(pending.id)} disabled={busy} className={SECOND}>
            先不填
          </button>
        ) : null}
        <button type="submit" disabled={busy} className={BUTTON_MAIN}>
          {on ? (busy ? "記下來…" : "記下來") : "沒開"}
        </button>
      </div>
    </form>
  );
}

/**
 * 讀到的角色狀態（開始前那個問題用）：job 是畫面讀到的職業；讀不到就是「我的路線」選的，fromProfile 標出來。
 * charId：先填進 ID 欄的（這次已經填過的，沒有就是狀態列讀到的名字）；mapName：現在當成哪張圖（認不準是最像的那張，guessed）
 */
export type ReadNow = {
  job: string | null;
  fromProfile: boolean;
  level: number;
  exp: number;
  percent: number | null;
  charId: string | null;
  mapName: string | null;
  guessed: boolean;
};

/**
 * 分享之後一讀到就問「已讀取到職業、目前經驗，是否開始計算？」（2026-11-02 使用者）：
 * 按「開始計算」一路算到按「結束」，中間不會自己停（使用者選 A）。數字跟著畫面每秒更新。
 * v2.06（2026-11-11 使用者）：角色 ID 自動帶入狀態列讀到的名字、可以改，空著也能開始；結束存檔前會再確認一次。
 * 名字要等字樣板載好才讀得到：欄位還沒動過時，讀到了就補進去；玩家動過就不蓋掉。
 */
export function StartDialog({ read, onStart, onClose }: { read: ReadNow | null; onStart: (charId: string | null) => void; onClose: () => void }) {
  const ids = useId();
  return (
    <Modal open={read !== null} labelledBy={`${ids}-title`} onCancel={onClose}>
      {read ? <StartForm read={read} titleId={`${ids}-title`} onStart={onStart} onClose={onClose} /> : null}
    </Modal>
  );
}

function StartForm({ read, titleId, onStart, onClose }: { read: ReadNow; titleId: string; onStart: (charId: string | null) => void; onClose: () => void }) {
  const suggested = read.charId ?? "";
  const [text, setText] = useState(suggested);
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errorId = useId();
  // 名字晚一點才讀到（字樣板剛載好）：玩家還沒動過欄位就補進去
  const shown = touched ? text : suggested;
  return (
    <form
      className="space-y-3"
      onSubmit={event => {
        event.preventDefault();
        const checked = checkCharId(shown);
        if (!checked.ok) {
          setError(checked.error);
          return;
        }
        onStart(checked.charId);
      }}
    >
      <h2 id={titleId} className="text-lg font-black">
        讀到你的角色了，要開始計算嗎？
      </h2>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[15px]">
        <dt className="ink-soft">職業</dt>
        <dd className="font-bold">
          {read.job ?? "讀不到"}
          {read.job && read.fromProfile ? <span className="ml-1 text-[13px] font-normal ink-soft">（畫面讀不到，用「我的路線」選的）</span> : null}
        </dd>
        <dt className="ink-soft">等級</dt>
        <dd className="font-bold tabular-nums">Lv.{read.level}</dd>
        <dt className="ink-soft">目前經驗</dt>
        <dd className="font-bold tabular-nums">
          {formatNumber(read.exp)}
          {read.percent !== null ? `（${read.percent.toFixed(2)}%）` : ""}
        </dd>
        <dt className="ink-soft">地圖</dt>
        <dd className="font-bold">
          {read.mapName ?? "還沒認出來"}
          {read.mapName && read.guessed ? <span className="ml-1 text-[13px] font-normal ink-soft">（應該是，結束時可以改）</span> : null}
        </dd>
      </dl>
      <label className="block text-sm font-bold">
        角色 ID<span className="ml-1 font-normal ink-soft">（可以改，空著也能開始）</span>
        <input
          value={shown}
          onChange={event => {
            setTouched(true);
            setText(event.target.value);
            setError(null);
          }}
          maxLength={24}
          autoComplete="off"
          placeholder={suggested ? undefined : "讀不到名字，可以自己打"}
          aria-invalid={error !== null}
          aria-describedby={error ? errorId : undefined}
          className={FIELD}
        />
      </label>
      {error ? (
        <p id={errorId} role="alert" className="text-[13px] font-bold text-[color:var(--maple)]">
          {error}
        </p>
      ) : null}
      <p className="text-sm ink-soft">按下去就開始算，練完按「結束」。</p>
      <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
        <button type="button" onClick={onClose} className={SECOND}>
          先不要
        </button>
        <button type="submit" autoFocus className={BUTTON_MAIN}>
          開始計算
        </button>
      </div>
    </form>
  );
}

/**
 * 按「結束」之後、存檔前（2026-11-11 使用者：結束後存檔前再次確認 ID）：這段還沒送出去。
 * mapId、charId 是先填好的（地圖認不準時是最像的那張）；choices＝這次分享看過、跟認的時候排前面的地圖。
 */
export type PendingEnd = {
  startedAt: number;
  duration: string;
  gained: number;
  mapId: number | null;
  choices: number[];
  charId: string | null;
};
export type EndAnswer = { mapId: number | null; charId: string | null; isPublic: boolean };

/** 存檔前確認地圖跟角色 ID：按「存檔」照欄位存；按 Esc、點外面也照先填好的存（不能因為沒回答就漏存） */
export function EndDialog({
  pending,
  maps,
  isPublic,
  onSave,
}: {
  pending: PendingEnd | null;
  maps: Record<string, MapRecord>;
  isPublic: boolean;
  onSave: (pending: PendingEnd, answer: EndAnswer) => void;
}) {
  const ids = useId();
  return (
    <Modal
      open={pending !== null}
      labelledBy={`${ids}-title`}
      onCancel={() => pending && onSave(pending, { mapId: pending.mapId, charId: pending.charId, isPublic })}
    >
      {pending ? <EndForm key={pending.startedAt} pending={pending} maps={maps} isPublic={isPublic} titleId={`${ids}-title`} onSave={onSave} /> : null}
    </Modal>
  );
}

function EndForm({
  pending,
  maps,
  isPublic: initialPublic,
  titleId,
  onSave,
}: {
  pending: PendingEnd;
  maps: Record<string, MapRecord>;
  isPublic: boolean;
  titleId: string;
  onSave: (pending: PendingEnd, answer: EndAnswer) => void;
}) {
  const [mapId, setMapId] = useState(pending.mapId);
  const [picking, setPicking] = useState(pending.mapId === null);
  const [text, setText] = useState(pending.charId ?? "");
  const [isPublic, setIsPublic] = useState(initialPublic);
  const [error, setError] = useState<string | null>(null);
  const errorId = useId();
  return (
    <form
      className="space-y-4"
      onSubmit={event => {
        event.preventDefault();
        const checked = checkCharId(text);
        if (!checked.ok) {
          setError(checked.error);
          return;
        }
        onSave(pending, { mapId, charId: checked.charId, isPublic });
      }}
    >
      <div>
        <h2 id={titleId} className="text-lg font-black">
          存檔前確認一下
        </h2>
        <p className="mt-1 text-sm leading-relaxed ink-soft">
          練了 {pending.duration}、拿到 {formatNumber(pending.gained)} 經驗。地圖對了才排得進那張圖的排行；ID 空著就寫「匿名玩家」。
        </p>
      </div>
      <div className="space-y-2">
        <p className="text-sm font-bold">地圖</p>
        {mapId !== null && !picking ? (
          <p className="text-[15px]">
            <span className="font-bold">{mapName(maps, mapId)}</span>{" "}
            <button type="button" onClick={() => setPicking(true)} className="text-sm font-bold text-[color:var(--sky)] hover:underline">
              不對，換一張
            </button>
          </p>
        ) : (
          <MapChoices
            choices={pending.choices}
            maps={maps}
            heading="選你在哪張圖"
            onPick={id => {
              setMapId(id);
              setPicking(false);
            }}
          />
        )}
      </div>
      <div className="space-y-2">
        <label className="block text-sm font-bold">
          角色 ID
          <input
            value={text}
            onChange={event => {
              setText(event.target.value);
              setError(null);
            }}
            maxLength={24}
            autoComplete="off"
            aria-invalid={error !== null}
            aria-describedby={error ? errorId : undefined}
            className={FIELD}
          />
        </label>
        {error ? (
          <p id={errorId} role="alert" className="text-[13px] font-bold text-[color:var(--maple)]">
            {error}
          </p>
        ) : null}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isPublic} onChange={event => setIsPublic(event.target.checked)} className="size-4 accent-[color:var(--maple)]" />
          排行榜顯示我的 ID（不勾就寫「匿名玩家」）
        </label>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
        <button type="submit" autoFocus className={BUTTON_MAIN}>
          存檔
        </button>
      </div>
    </form>
  );
}

/** 一段存好、缺地圖或角色 ID 要補的（id、token 改同一筆用；choices＝這次分享看過的地圖） */
export type PendingFill = {
  id: string;
  token: string;
  startedAt: number;
  duration: string;
  gained: number;
  needMap: boolean;
  needId: boolean;
  choices: number[];
  /** 存的時候送出去的（補好後重寫「上一段」那句用） */
  run: { durationSec: number; mapId: number | null; charId: string | null };
};
export type FillAnswer = { mapId: number | null; charId: string | null; isPublic: boolean; askId: boolean };

/**
 * 結束之後缺地圖或角色 ID（2026-11-02 使用者：請選或略過）：這段已經先存了，選了才送去改同一筆。
 * onSubmit 回錯誤訊息（null＝好了）；略過直接關（勾的「下次不要再問我」照樣記）。
 */
export function FillDialog({
  pending,
  maps,
  initial,
  onSubmit,
  onClose,
}: {
  pending: PendingFill | null;
  maps: Record<string, MapRecord>;
  initial: { isPublic: boolean; askId: boolean };
  onSubmit: (pending: PendingFill, answer: FillAnswer) => Promise<string | null>;
  onClose: (id: string, askId: boolean) => void;
}) {
  const ids = useId();
  return (
    <Modal open={pending !== null} labelledBy={`${ids}-title`} onCancel={() => pending && onClose(pending.id, initial.askId)}>
      {pending ? <FillForm key={pending.id} pending={pending} maps={maps} initial={initial} titleId={`${ids}-title`} onSubmit={onSubmit} onClose={onClose} /> : null}
    </Modal>
  );
}

function FillForm({
  pending,
  maps,
  initial,
  titleId,
  onSubmit,
  onClose,
}: {
  pending: PendingFill;
  maps: Record<string, MapRecord>;
  initial: { isPublic: boolean; askId: boolean };
  titleId: string;
  onSubmit: (pending: PendingFill, answer: FillAnswer) => Promise<string | null>;
  onClose: (id: string, askId: boolean) => void;
}) {
  const [mapId, setMapId] = useState<number | null>(null);
  const [charText, setCharText] = useState("");
  const [isPublic, setIsPublic] = useState(initial.isPublic);
  const [dontAsk, setDontAsk] = useState(!initial.askId);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const askId = !dontAsk;
  const title = pending.needMap && pending.needId ? "這段在哪張圖、哪個角色？" : pending.needMap ? "這段在哪張圖練的？" : "這段是哪個角色？";
  return (
    <form
      className="space-y-4"
      onSubmit={async event => {
        event.preventDefault();
        const checked = checkCharId(charText);
        if (!checked.ok) {
          setError(checked.error);
          return;
        }
        if (mapId === null && checked.charId === null) {
          onClose(pending.id, askId);
          return;
        }
        setBusy(true);
        const failed = await onSubmit(pending, { mapId, charId: checked.charId, isPublic, askId });
        setBusy(false);
        if (failed) setError(failed);
        else onClose(pending.id, askId);
      }}
    >
      <div>
        <h2 id={titleId} className="text-lg font-black">
          {title}
        </h2>
        <p className="mt-1 text-sm leading-relaxed ink-soft">
          練了 {pending.duration}、拿到 {formatNumber(pending.gained)} 經驗，已經記下來了。補上{pending.needMap ? "地圖才排得進那張圖的排行" : "ID，排行就能掛你的名字"}；不想補就按略過。
        </p>
      </div>
      {pending.needMap ? (
        mapId !== null ? (
          <p className="text-sm">
            <span className="font-bold">{mapName(maps, mapId)}</span>{" "}
            <button type="button" onClick={() => setMapId(null)} className="font-bold text-[color:var(--sky)] hover:underline">
              改
            </button>
          </p>
        ) : (
          <MapChoices choices={pending.choices} maps={maps} onPick={setMapId} heading="選地圖" />
        )
      ) : null}
      {pending.needId ? (
        <div className="space-y-2">
          <label className="block text-sm font-bold">
            角色 ID
            <input value={charText} onChange={event => setCharText(event.target.value)} maxLength={24} autoComplete="off" className={FIELD} />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isPublic} onChange={event => setIsPublic(event.target.checked)} className="size-4 accent-[color:var(--maple)]" />
            排行榜顯示我的 ID（不勾就寫「匿名玩家」）
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={dontAsk} onChange={event => setDontAsk(event.target.checked)} className="size-4 accent-[color:var(--maple)]" />
            下次不要再問我 ID
          </label>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="text-[13px] font-bold text-[color:var(--maple)]">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
        <button type="button" onClick={() => onClose(pending.id, askId)} disabled={busy} className={SECOND}>
          略過
        </button>
        <button type="submit" disabled={busy} className={BUTTON_MAIN}>
          {busy ? "記下來…" : "記下來"}
        </button>
      </div>
    </form>
  );
}
