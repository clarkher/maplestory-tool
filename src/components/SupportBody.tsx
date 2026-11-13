"use client";

import { useEffect, useState } from "react";
import { track } from "@/lib/analytics";
import { DONATE_STATUS_TEXT, donateReturn, isPaidStatus, type DonateMethod, type DonateStatus } from "@/lib/donate";
import { DonateForm } from "./DonateForm";

/**
 * /support 主圖以下（v2.24）。付完導回來（?status=thanks／issued）把請人贊助的說明換成謝謝、放最上面，
 * 送 GA donate_paid，再用 replaceState 把 ?status= 拿掉，重新整理不會再算一次（state 要傳 null，見 AvatarSim）。
 * 取消、失敗的訊息照舊在金額上面。
 */
export function SupportBody({ methods }: { methods: DonateMethod[] }) {
  const [status, setStatus] = useState<DonateStatus | null>(null);

  useEffect(() => {
    const back = donateReturn(window.location.search);
    if (!back) return;
    setStatus(back.status);
    if (isPaidStatus(back.status)) track("donate_paid", { status: back.status, method: back.method ?? "unknown" });
    window.history.replaceState(null, "", window.location.pathname);
  }, []);

  const paid = status !== null && isPaidStatus(status);

  return (
    <>
      {paid ? (
        <div role="status" className="space-y-1.5 rounded-[var(--radius-card)] border-2 border-[color:var(--maple)] bg-[color:var(--paper-deep)] p-4">
          <p className="text-lg font-black">{DONATE_STATUS_TEXT[status]}</p>
          <p className="text-[15px] leading-relaxed ink-soft">楓谷幫手會繼續每天更新遊戲資料、做新的工具。</p>
        </div>
      ) : (
        <div className="space-y-1.5 text-[15px] leading-relaxed">
          <p className="text-lg font-black">楓谷幫手不收費、不用登入。</p>
          <p className="ink-soft">如果它幫你少走冤枉路、少浪費楓幣，可以請楓谷幫手喝杯珍奶，會用在每天更新遊戲資料、主機費用、做新的工具。</p>
        </div>
      )}

      <section className="rounded-[var(--radius-card)] glass wood-frame p-4 sm:p-5">
        <DonateForm methods={methods} status={paid ? null : status} />
      </section>
    </>
  );
}
