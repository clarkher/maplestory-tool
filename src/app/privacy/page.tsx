import type { Metadata } from "next";
import { withOpenGraph } from "@/lib/seo";

export const metadata: Metadata = withOpenGraph({
  title: "隱私權政策",
  description: "楓谷幫手的隱私權政策：我們收集什麼、不收集什麼，以及資料存在哪裡。",
  alternates: { canonical: "/privacy" },
});

export default function Page() {
  return (
    <article className="prose-page space-y-5 py-6">
      <h1 className="text-[26px] font-black tracking-tight sm:text-[32px]">隱私權政策</h1>
      <p className="ink-soft">最後更新：2026 年 11 月 13 日</p>

      <Block title="我們不需要你的帳號">
        本站不提供註冊、不需要登入，也沒有任何帳號系統。你不用給我們電子郵件、電話或任何個人身分資料（練功測速的角色 ID 是遊戲裡的名字，不是帳號，填不填由你）。
      </Block>

      <Block title="存在你自己瀏覽器裡的東西">
        <p>
          你填的等級與職業、你在任務頁按「我做完了」的任務、「帶我去」上次選的出發點，以及白天／夜晚配色的選擇，只存在你自己裝置的 localStorage 裡，不會送到我們的伺服器。
          只有一個例外：練功測速認不出畫面上的職業時，存一筆紀錄會帶上你在「我的路線」選的職業。
        </p>
        <p className="mt-2">
          練功測速的公開與否、要不要在分享時問角色 ID、自動／手動、組隊設定、你點選過的地圖，也記在你自己的裝置裡；角色 ID 不記，只用在這次開著的頁面。
          存一筆紀錄時，會送出角色 ID（有填的話）、公開與否、自動／手動、組隊設定，跟這段算在哪張圖（包括你自己點選的）；事後補填加倍券時，會送出倍率跟開了幾分鐘；打開一張圖的排行時，會送出那張圖的編號（見下面「練功測速」）。
        </p>
        <p className="mt-2">清除瀏覽器資料就會一併消失，我們也拿不回來。</p>
      </Block>

      <Block title="練功測速">
        <p>用「練功測速」時，遊戲畫面只在你的瀏覽器裡辨識，畫面本身不會上傳。</p>
        <p className="mt-2">
          一段練滿 5 分鐘、而且有拿到經驗，就會存一筆到我們的資料庫；沒填角色 ID 也會存，排行寫「匿名玩家」。存的內容：
        </p>
        <ul className="mt-2 list-inside list-disc space-y-1">
          <li>你填的：角色 ID（有填的話）、要不要公開、組隊時隊友的等級跟誰在打怪、有沒有開加倍券（倍率、開了幾分鐘）。</li>
          <li>從畫面認出來的：等級、職業（認不出來時用你在「我的路線」選的）、地圖（認不出來時用你點選的）、拿到的經驗。</li>
          <li>其他：練了多久、開始時間、自動或手動、升了幾級、死了幾次、頁面版本，以及照這些算出來的 10 分鐘經驗（有開加倍券的扣掉加倍）、全隊 10 分鐘打幾隻。</li>
        </ul>
        <p className="mt-2">拿來做每張地圖的實測排行、改進練功推薦。</p>
        <p className="mt-2">
          排行上要顯示你的 ID，必須是上榜的那一筆跟你最新的一筆都勾了公開；其他情況一律顯示「匿名玩家」。
        </p>
        <p className="mt-2">
          在我們的資料庫裡，網路位址只存轉換過的一串字（混了當天日期），不存原本的位址；只拿來擋同一個位址一直送資料，以及排行上沒填角色 ID 的紀錄分組（同一個位址同一天只列最好的一筆），紀錄不拿它跨天認人。
          存好一筆時，你的瀏覽器會拿到一組只能用來補填這筆加倍券的鑰匙（一天內有效）；我們的資料庫只存它轉換過的字。
          主機端的存取記錄還是會有原本的位址（見下面「伺服器記錄」）。
        </p>
      </Block>

      <Block title="野王計時">
        開房間或加入房間時，房號跟你按的打死時間會存到我們的資料庫，給同房的隊友看。網路位址只存轉換過的一串字，用來擋同一個位址一直開房間、一直送資料。
        按下打死時，如果算得出跟上一次的間隔，不論有沒有開房間，都會把這個間隔送回來修正預估時間，不會掛上你的名字。其他紀錄沒開房間時只存在你自己的裝置裡。
      </Block>

      <Block title="伺服器記錄">
        本站部署在 Cloudflare。與所有網站一樣，主機端會產生標準的存取記錄（IP 位址、瀏覽器種類、造訪時間），
        用途是維運與防止濫用。
      </Block>

      <Block title="網站分析">
        <p>
          本站用 Google Analytics 了解有多少人來、看了哪些頁、用了哪些功能（包括查資料時搜尋的字、選的職業跟等級範圍），拿來決定先改哪裡。
          它會使用 Cookie，資料由 Google 處理。
        </p>
        <p className="mt-2">
          不想被記錄，可以安裝 <ExternalLink href="https://tools.google.com/dlpage/gaoptout">Google Analytics 停用工具</ExternalLink>。
        </p>
      </Block>

      <Block title="廣告">
        <p>
          本站可能顯示 Google AdSense 廣告。第三方供應商（包括 Google）會使用 Cookie，根據你先前在本站或其他網站瀏覽的內容放送廣告。
          Google 及其合作夥伴會利用廣告 Cookie，依你在本站和其他網站的瀏覽內容，顯示合適的廣告。
        </p>
        <p className="mt-2">
          你可以到 <ExternalLink href="https://adssettings.google.com">Google 廣告設定</ExternalLink> 停用個人化廣告，
          或到 <ExternalLink href="https://www.aboutads.info">www.aboutads.info</ExternalLink> 停用部分第三方供應商的個人化廣告 Cookie。
        </p>
      </Block>

      <Block title="贊助">
        贊助的付款由綠界科技或 LINE Pay 處理，卡號、帳戶、付款人資料都在它們那邊輸入，本站不收集也拿不到；本站也不存贊助紀錄（金額、訂單編號只轉交給付款平台）。
        網站分析只會記錄「點了贊助按鈕」這個事件（在哪點的、選哪種付款方式），不記金額，也不知道你最後有沒有付。
      </Block>

      <Block title="YouTube 頻道">
        楓谷幫手的 YouTube 頻道用 YouTube API 服務上傳我們自己做的影片。這個上傳工具只碰我們自己的頻道，不會讀取或保存你的 YouTube 資料。
        使用 YouTube 時適用 <ExternalLink href="https://www.youtube.com/t/terms">YouTube 服務條款</ExternalLink> 與{" "}
        <ExternalLink href="https://policies.google.com/privacy">Google 隱私權政策</ExternalLink>。
      </Block>

      <Block title="第三方">
        <p>本站的網頁字型由 Google Fonts 在建置時取得並自行提供，瀏覽字型不會連到 Google。遊戲圖片與資料檔大多由本站自己提供。</p>
        <p className="mt-2">
          除了上面的 Google Analytics 跟廣告，還有兩個地方會連到外部：紙娃娃的角色圖向 maplestory.io 即時產生，楓幣匯率的資料從 GitHub 讀取。對方會看到你的網路位址等連線資訊，紙娃娃還會看到你選的穿搭。
        </p>
      </Block>

      <Block title="兒童隱私">
        本站不會要任何人（包括兒童）提供真實姓名、電話、電子郵件這類聯絡得到本人的資料。
        練功測速只會存你自己決定填的遊戲角色 ID，跟上面「練功測速」寫的練功紀錄。
      </Block>

      <Block title="有問題">
        寫信到 <a className="font-bold text-[color:var(--maple)]" href="mailto:clark042007@gmail.com">clark042007@gmail.com</a>。
      </Block>
    </article>
  );
}

function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return <a className="font-bold text-[color:var(--maple)]" href={href} target="_blank" rel="noopener noreferrer">{children}</a>;
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[var(--radius-card)] glass wood-frame p-4 sm:p-5">
      <h2 className="mb-2 text-lg font-black">{title}</h2>
      <div className="text-[15px] leading-relaxed ink-soft">{children}</div>
    </section>
  );
}
