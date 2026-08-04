import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "聯絡我們",
  description: "回報資料錯誤、建議功能，或任何關於楓谷幫手的問題。",
  alternates: { canonical: "/contact" },
};

export default function Page() {
  return (
    <article className="space-y-5 py-6">
      <h1 className="text-[26px] font-black tracking-tight sm:text-[32px]">聯絡我們</h1>
      <p className="text-[15px] leading-relaxed ink-soft">
        發現數字不對、路線走不通、或想要什麼功能，都直接寫信說。附上你在哪一頁、看到什麼，我修得比較快。
      </p>

      <section className="rounded-[var(--radius-card)] glass wood-frame p-5">
        <p className="text-sm ink-faint">電子郵件</p>
        <a
          href="mailto:clark042007@gmail.com"
          className="mt-1 block break-all text-xl font-black text-[color:var(--maple)] hover:underline"
        >
          clark042007@gmail.com
        </a>
      </section>

      <section className="rounded-[var(--radius-card)] glass wood-frame p-5">
        <h2 className="mb-2 text-lg font-black">回報資料錯誤時，這些資訊很有幫助</h2>
        <ul className="list-inside list-disc space-y-1 text-[15px] leading-relaxed ink-soft">
          <li>哪一頁、哪個怪／道具／任務／地圖（附上網址最好）</li>
          <li>站上顯示什麼、遊戲裡實際是什麼</li>
          <li>你的等級與職業（如果跟推薦結果有關）</li>
        </ul>
      </section>
    </article>
  );
}
