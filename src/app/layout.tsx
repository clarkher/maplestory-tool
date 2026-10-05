import type { Metadata, Viewport } from "next";
import { Noto_Sans_TC } from "next/font/google";
import "./globals.css";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";

const notoTC = Noto_Sans_TC({
  subsets: ["latin"],
  weight: ["400", "500", "700", "900"],
  variable: "--font-noto-tc",
  display: "swap",
});

const SITE_URL = "https://maplestory-tool-three.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "楓谷幫手｜新楓之谷經典版 各職業升級路線、技能配點、必解任務",
    template: "%s｜楓谷幫手",
  },
  description:
    "選職業、填等級，馬上知道現在去哪練、先解哪些任務、技能點哪個。29 個職業一路排到 Lv.120，還會帶你一步步走過去。台服新楓之谷經典版專用。",
  keywords: ["新楓之谷經典版", "楓之谷", "練功地圖", "技能配點", "必解任務", "任務攻略", "轉職", "MapleStory Classic"],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "zh_TW",
    url: SITE_URL,
    siteName: "楓谷幫手",
    title: "楓谷幫手｜新楓之谷經典版 各職業升級路線",
    description: "選職業、填等級，馬上知道今天去哪練、技能點哪個、哪些任務順便解、材料先存什麼。",
    images: [{ url: "/og.jpg", width: 1200, height: 630, alt: "楓谷幫手" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "楓谷幫手｜新楓之谷經典版 各職業升級路線",
    description: "選職業、填等級，馬上知道今天去哪練、技能點哪個、哪些任務順便解。",
    images: ["/og.jpg"],
  },
  robots: { index: true, follow: true },
  // Google Search Console 網域擁有權驗證（token 存在 ~/.claude/analytics-ids.json）
  verification: { google: "cl86r4pMdVHkk9oV0qw9WO577cGYmbrB05aSwjeFXww" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbf5ea" },
    { media: "(prefers-color-scheme: dark)", color: "#16110c" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

/** 在 React 接手前先把主題套上去，避免深色模式的使用者看到一閃的白底。 */
const themeBootstrap = `(function(){try{var t=localStorage.getItem("ms-theme");if(!t){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";}document.documentElement.dataset.theme=t==="dark"?"dark":"light";}catch(e){document.documentElement.dataset.theme="light";}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body className={`${notoTC.variable} antialiased`}>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:px-4 focus:py-2 focus:glass-solid"
        >
          跳到主要內容
        </a>
        <SiteHeader />
        <main id="main" className="mx-auto w-full max-w-6xl px-4 pb-24 pt-4 sm:px-6">
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
