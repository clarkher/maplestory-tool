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
    default: "楓谷幫手｜新楓之谷經典版 練功、任務、打寶規劃",
    template: "%s｜楓谷幫手",
  },
  description:
    "告訴你等級跟職業，就知道現在該去哪練功、能接哪些任務、想要的東西去哪打，還會帶你一步步走過去。新楓之谷經典版 Artale 專用。",
  keywords: ["新楓之谷經典版", "Artale", "楓之谷", "練功地圖", "任務攻略", "掉落查詢", "MapleStory Classic"],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "zh_TW",
    url: SITE_URL,
    siteName: "楓谷幫手",
    title: "楓谷幫手｜新楓之谷經典版 練功、任務、打寶規劃",
    description: "說出等級跟職業，馬上知道去哪練、接什麼任務、想要的東西去哪打，還會帶你走過去。",
    images: [{ url: "/og.jpg", width: 1200, height: 630, alt: "楓谷幫手" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "楓谷幫手｜新楓之谷經典版 練功、任務、打寶規劃",
    description: "說出等級跟職業，馬上知道去哪練、接什麼任務、想要的東西去哪打。",
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
