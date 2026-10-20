// src/app/plan/speed/Dialogs.tsx
"use client";

import { useEffect, useId, useRef, useState } from "react";
import { formatNumber } from "@/lib/format";
import { checkCharId, parseCoupon, type Coupon } from "@/lib/speed/view";
import { BUTTON_MAIN } from "./parts";

const FIELD =
  "mt-1 block w-full rounded-lg border border-[color:var(--paper-edge)] bg-[color:var(--paper)] px-3 py-2 text-base font-normal outline-none focus:border-[color:var(--maple)]";
const SECOND = "rounded-full px-3 py-2 text-sm font-bold ink-soft hover:bg-[color:var(--maple-wash)]";

/**
 * 瀏覽器內建的對話框（showModal）：鍵盤焦點關在裡面、按 Esc 等於 onCancel、背後的頁面點不到。
 * open 由頁面控制；Esc 不讓瀏覽器自己關（不然 open 跟畫面對不起來），交給 onCancel。
 */
function Modal({ open, labelledBy, onCancel, children }: { open: boolean; labelledBy: string; onCancel: () => void; children: React.ReactNode }) {
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
      className="m-auto w-[min(26rem,calc(100vw-2rem))] rounded-[var(--radius-card)] border border-[color:var(--paper-edge)] bg-[color:var(--paper)] p-5 text-[color:var(--ink)] shadow-[var(--glass-shadow)] backdrop:bg-[rgb(0_0_0/0.45)]"
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
