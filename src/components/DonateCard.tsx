import Link from "next/link";
import { donateMethods } from "@/lib/donate";

/** 攻略文結尾小卡（v2.22）：放在「看完這篇，接著看」後面，連到 /support。沒開贊助就不畫 */
export function DonateCard() {
  if (donateMethods().length === 0) return null;
  return (
    <aside className="flex items-center gap-3 rounded-[var(--radius-card)] border border-[color:var(--paper-edge)] glass-fill p-2.5 pr-4">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/assets/support/tea.webp" alt="" width={512} height={512} loading="lazy" className="size-16 shrink-0 rounded-md object-cover sm:size-20" />
      <p className="min-w-0 flex-1 text-[15px] font-bold leading-snug">這篇幫到你了？請楓谷幫手喝杯珍奶</p>
      <Link
        href="/support"
        data-ga="donate"
        data-placement="guide_end"
        className="tap-safe inline-flex shrink-0 items-center justify-center rounded-md bg-[color:var(--maple)] px-4 py-2 text-sm font-bold text-[color:var(--on-accent)] shadow-sm"
      >
        贊助
      </Link>
    </aside>
  );
}
