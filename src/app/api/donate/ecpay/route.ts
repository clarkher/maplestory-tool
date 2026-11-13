// src/app/api/donate/ecpay/route.ts
import { parseDonateAmount } from "@/lib/donate";
import { aioParams, autoSubmitPage, ecpayCheckoutUrl, ecpayKeys, newTradeNo } from "@/lib/donate/server/ecpay";
import { backToSupport, formFields, isProduction, originOf } from "@/lib/donate/server/http";

export const dynamic = "force-dynamic";

/** /support 的表單送 amount 過來 → 回一頁自動 POST 到綠界付款頁。金額不對、沒設金鑰都回 /support?status=failed */
export async function POST(request: Request): Promise<Response> {
  const keys = ecpayKeys();
  const amount = parseDonateAmount((await formFields(request))?.amount);
  if (!keys || amount === null) return backToSupport(request, "failed");
  const params = aioParams({ keys, tradeNo: newTradeNo(), amount, origin: originOf(request) });
  return new Response(autoSubmitPage(ecpayCheckoutUrl(isProduction()), params), {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
  });
}
