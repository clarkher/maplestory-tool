import type { Metadata } from "next";
import { DonateForm } from "@/components/DonateForm";
import { donateMethods } from "@/lib/donate";
import { withOpenGraph } from "@/lib/seo";

export const metadata: Metadata = withOpenGraph({
  title: "贊助楓谷幫手",
  description: "楓谷幫手不收費、不用登入。如果它幫你少走冤枉路，可以請我喝杯珍奶。",
  alternates: { canonical: "/support" },
});

/** 贊助頁（v2.22）：不進導覽列，從頁尾、攻略文結尾小卡進來。付款走 /api/donate/*（綠界、LINE Pay），本站不碰卡號 */
export default function Page() {
  const methods = donateMethods();
  return (
    <article className="space-y-5 py-6">
      <h1 className="text-[26px] font-black tracking-tight sm:text-[32px]">贊助楓谷幫手</h1>
      {methods.length > 0 ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src="/assets/support/hero.webp" alt="楓谷幫手的寫手們在夜市喝珍奶、吃雞排和漢堡" width={1536} height={864} fetchPriority="high" className="aspect-video w-full rounded-xl object-cover" />
      ) : null}
      {methods.length === 0 ? (
        <p className="text-[15px] leading-relaxed ink-soft">目前沒有開放贊助。</p>
      ) : (
        <>
          <div className="space-y-2 text-[15px] leading-relaxed">
            <p className="text-lg font-black">楓谷幫手不收費、不用登入。</p>
            <p className="ink-soft">如果它幫你少走冤枉路、少浪費楓幣，可以請我喝杯珍奶。</p>
            <p className="ink-soft">贊助會用在：每天更新遊戲資料、主機費用、做新的工具。</p>
          </div>

          <section className="rounded-[var(--radius-card)] glass wood-frame p-4 sm:p-5">
            <DonateForm methods={methods} />
          </section>

          <p className="text-[13px] leading-relaxed ink-faint">
            贊助是自願的，不會解鎖任何功能，也不影響你能用的東西。付款由綠界／LINE Pay 處理，本站不會拿到你的卡號或個資。
          </p>
        </>
      )}
    </article>
  );
}
