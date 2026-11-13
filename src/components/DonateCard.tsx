import Link from "next/link";
import { donateMethods } from "@/lib/donate";

/** 攻略文結尾小卡（v2.22）：放在「看完這篇，接著看」後面，連到 /support。沒開贊助就不畫 */
export function DonateCard() {
  if (donateMethods().length === 0) return null;
  return (
    <aside className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-[color:var(--paper-edge)] glass-fill px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-[15px] font-bold leading-snug">這篇幫到你了？請楓谷幫手喝杯飲料</p>
      <Link
        href="/support"
        data-ga="donate"
        data-placement="guide_end"
        className="tap-safe inline-flex shrink-0 items-center justify-center self-start rounded-md bg-[color:var(--maple)] px-5 py-2 text-sm font-bold text-[color:var(--on-accent)] shadow-sm sm:self-auto"
      >
        贊助
      </Link>
    </aside>
  );
}
