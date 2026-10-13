import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "隱私權政策",
  description: "楓谷幫手的隱私權政策：我們收集什麼、不收集什麼，以及資料存在哪裡。",
  alternates: { canonical: "/privacy" },
};

export default function Page() {
  return (
    <article className="prose-page space-y-5 py-6">
      <h1 className="text-[26px] font-black tracking-tight sm:text-[32px]">隱私權政策</h1>
      <p className="ink-soft">最後更新：2026 年 10 月 13 日</p>

      <Block title="我們不需要你的帳號">
        本站不提供註冊、不需要登入，也沒有任何帳號系統。你不用給我們電子郵件、電話或任何個人身分資料（練功測速的角色 ID 是遊戲裡的名字，不是帳號，填不填由你）。
      </Block>

      <Block title="存在你自己瀏覽器裡的東西">
        <p>你填的等級與職業、你在任務頁按「我做完了」的任務、「帶我去」上次選的出發點，以及白天／夜晚配色的選擇，只存在你自己裝置的 localStorage 裡，不會送到我們的伺服器。練功測速的角色 ID、公開與否、自動／手動、組隊設定、你點選過的地圖，也一樣只存在你自己的裝置裡。</p>
        <p className="mt-2">清除瀏覽器資料就會一併消失，我們也拿不回來。</p>
      </Block>

      <Block title="練功測速">
        <p>用「練功測速」時，遊戲畫面只在你的瀏覽器裡辨識，畫面本身不會上傳。</p>
        <p className="mt-2">
          一段練滿 5 分鐘、而且有拿到經驗，才會存一筆到我們的資料庫；沒填角色 ID 就什麼都不存。存的內容：
        </p>
        <ul className="mt-2 list-inside list-disc space-y-1">
          <li>你填的：角色 ID、要不要公開、組隊時隊友的等級跟誰在打怪。</li>
          <li>從畫面認出來的：等級、職業、地圖（認不出來時用你點選的）、拿到的經驗。</li>
          <li>其他：練了多久、開始時間、自動或手動、升了幾級、死了幾次、頁面版本，以及照這些算出來的 10 分鐘經驗、全隊 10 分鐘打幾隻。</li>
        </ul>
        <p className="mt-2">拿來做每張地圖的實測排行、改進練功推薦。</p>
        <p className="mt-2">
          排行上要顯示你的 ID，必須是上榜的那一筆跟你最新的一筆都勾了公開；其他情況一律顯示「匿名玩家」。
        </p>
        <p className="mt-2">
          網路位址只存轉換過的一串字（混了當天日期），不存原本的位址；只拿來擋同一個位址一直送資料，紀錄不拿它跨天認人。
        </p>
      </Block>

      <Block title="伺服器記錄">
        本站部署在 Vercel。與所有網站一樣，主機端會產生標準的存取記錄（IP 位址、瀏覽器種類、造訪時間），
        用途是維運與防止濫用。我們沒有另外建立分析或追蹤系統。
      </Block>

      <Block title="第三方">
        本站的網頁字型由 Google Fonts 在建置時取得並自行提供，瀏覽時不會再連到 Google。
        遊戲圖片與資料檔都由本站自己提供，不會即時向外部服務請求。
      </Block>

      <Block title="兒童隱私">
        本站不主動蒐集任何個人資料，因此也不會蒐集兒童的個人資料。
      </Block>

      <Block title="有問題">
        寫信到 <a className="font-bold text-[color:var(--maple)]" href="mailto:clark042007@gmail.com">clark042007@gmail.com</a>。
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
