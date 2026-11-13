"use client";

import { useEffect, useState } from "react";
import { track } from "@/lib/analytics";
import {
  DONATE_DEFAULT, DONATE_MAX, DONATE_METHOD_LABEL, DONATE_MIN, DONATE_PICKS, DONATE_STATUS_TEXT,
  donateStatus, parseDonateAmount, type DonateMethod, type DonateStatus,
} from "@/lib/donate";
import { OPTION_OFF, OPTION_ON } from "./option-style";

const ACTION: Record<DonateMethod, string> = { ecpay: "/api/donate/ecpay", linepay: "/api/donate/linepay" };

/**
 * /support 的金額＋付款按鈕（v2.22）。一般表單 POST 到 /api/donate/<method>，由 Worker 轉去綠界／LINE Pay 付款頁。
 * 付完回來網址帶 ?status=，這裡讀出來顯示謝謝／取消／沒成功。
 */
export function DonateForm({ methods }: { methods: DonateMethod[] }) {
  const [amount, setAmount] = useState(String(DONATE_DEFAULT));
  const [status, setStatus] = useState<DonateStatus | null>(null);
  const valid = parseDonateAmount(amount) !== null;

  useEffect(() => {
    setStatus(donateStatus(window.location.search));
  }, []);

  return (
    <form method="post" className="space-y-4">
      {status ? (
        <p role="status" className={`rounded-md border px-3 py-2 text-[15px] font-bold ${status === "thanks" || status === "issued" ? OPTION_ON : "border-[color:var(--paper-edge)] bg-[color:var(--paper-deep)]"}`}>
          {DONATE_STATUS_TEXT[status]}
        </p>
      ) : null}

      <fieldset className="space-y-2">
        <legend className="mb-2 text-[15px] font-bold">金額（新台幣）</legend>
        <div className="flex flex-wrap gap-2">
          {DONATE_PICKS.map(pick => (
            <button
              key={pick}
              type="button"
              aria-pressed={amount === String(pick)}
              onClick={() => setAmount(String(pick))}
              className={`tap-safe rounded-md border px-4 text-[15px] font-bold tabular-nums ${amount === String(pick) ? OPTION_ON : OPTION_OFF}`}
            >
              {pick} 元
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-[15px]">
          <span className="ink-soft">自己填</span>
          <input
            name="amount"
            inputMode="numeric"
            pattern="[0-9]*"
            value={amount}
            onChange={event => setAmount(event.target.value.replace(/\D/g, "").slice(0, 5))}
            aria-describedby="donate-range"
            className="tap-safe w-28 rounded-md border border-[color:var(--paper-edge)] bg-[color:var(--paper)] px-3 text-[15px] font-bold tabular-nums"
          />
          <span className="ink-soft">元</span>
        </label>
        <p id="donate-range" className={`text-[13px] ${valid ? "ink-faint" : "font-bold text-[color:var(--maple)]"}`}>
          {DONATE_MIN}～{DONATE_MAX.toLocaleString("en-US")} 元
        </p>
      </fieldset>

      <div className="flex flex-col gap-2.5 sm:flex-row">
        {methods.map(method => (
          <button
            key={method}
            type="submit"
            formAction={ACTION[method]}
            disabled={!valid}
            onClick={() => track("donate_click", { placement: "support_page", method })}
            className="tap-safe rounded-md bg-[color:var(--maple)] px-5 py-2.5 text-[15px] font-bold text-[color:var(--on-accent)] shadow-sm disabled:opacity-40"
          >
            {DONATE_METHOD_LABEL[method]}
          </button>
        ))}
      </div>
    </form>
  );
}
