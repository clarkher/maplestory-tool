import type { Metadata } from "next";
import Link from "next/link";

/**
 * /guides 本身沒有總表（規格：不開文章總表）；有人砍網址尾巴或少打一個字母，帶去 /guide 職業攻略，不給 404。
 * 不用 permanentRedirect：Cloudflare 全靜態輸出時它只寫進 RSC 資料，HTML 沒有轉址，不跑 JavaScript 就留在空頁。
 */
export const metadata: Metadata = {
  title: "職業攻略",
  robots: { index: false, follow: true },
  alternates: { canonical: "/guide" },
};

export default function Page() {
  return (
    <>
      <meta httpEquiv="refresh" content="0;url=/guide" />
      <p className="p-4 text-[15px]">
        正在帶你去<Link href="/guide" className="font-bold underline underline-offset-4">職業攻略</Link>
      </p>
    </>
  );
}
