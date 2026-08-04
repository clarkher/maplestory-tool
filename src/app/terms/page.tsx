import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "服務條款",
  description: "楓谷幫手的服務條款：使用規範、資料來源與免責聲明。",
  alternates: { canonical: "/terms" },
};

export default function Page() {
  return (
    <article className="space-y-5 py-6">
      <h1 className="text-[26px] font-black tracking-tight sm:text-[32px]">服務條款</h1>
      <p className="ink-soft">最後更新：2026 年 8 月 4 日</p>

      <Block title="這是什麼">
        楓谷幫手是玩家自製的免費查詢工具，幫你決定要去哪練功、接什麼任務、想要的東西去哪打。
        本站與遊戲營運商、發行商沒有任何關係，也未經其授權或背書。
      </Block>

      <Block title="資料的準確度">
        <p>站上的遊戲數值來自遊戲客戶端匯出的資料，地圖路線來自 v83 版本的地圖檔。我們盡力讓資料正確，但不保證完全無誤，也不保證與你當下遊玩的版本一致。</p>
        <p className="mt-2">練功效率是相對比較的指數，不是保證的每小時經驗；掉落機率官方沒有公開，本站一律不提供百分比。依這些資訊做的任何遊戲決定，風險由你自行承擔。</p>
      </Block>

      <Block title="智慧財產">
        遊戲名稱、圖像、角色與所有遊戲內容的權利屬於各自的權利人。本站僅為方便玩家查詢而重新整理呈現。
        若權利人認為有不妥之處，請來信告知，我們會配合處理。
      </Block>

      <Block title="服務可用性">
        本站是免費提供的個人專案，不保證持續可用，也可能隨時修改或停止服務。
      </Block>

      <Block title="免責">
        本服務以「現狀」提供，不提供任何明示或默示的擔保。在法律允許的最大範圍內，
        我們不對因使用本站而產生的任何損失負責。
      </Block>

      <Block title="聯絡">
        <a className="font-bold text-[color:var(--maple)]" href="mailto:clark042007@gmail.com">clark042007@gmail.com</a>
      </Block>
    </article>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[var(--radius-card)] glass wood-frame p-4 sm:p-5">
      <h2 className="mb-2 text-lg font-black">{title}</h2>
      <div className="text-[15px] leading-relaxed ink-soft">{children}</div>
    </section>
  );
}
