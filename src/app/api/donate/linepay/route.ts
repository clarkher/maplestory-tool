// src/app/api/donate/linepay/route.ts
import { parseDonateAmount } from "@/lib/donate";
import { newTradeNo } from "@/lib/donate/server/ecpay";
import { backToSupport, formFields, isProduction, originOf } from "@/lib/donate/server/http";
import { linePayApi, linePayKeys, requestPayment } from "@/lib/donate/server/linepay";

export const dynamic = "force-dynamic";

/** /support 的表單送 amount 過來 → 跟 LINE Pay 要付款網址 → 303 過去。失敗回 /support?status=failed */
export async function POST(request: Request): Promise<Response> {
  const keys = linePayKeys();
  const amount = parseDonateAmount((await formFields(request))?.amount);
  if (!keys || amount === null) return backToSupport(request, "failed");
  const url = await requestPayment(linePayApi(isProduction()), keys, { tradeNo: newTradeNo(), amount, origin: originOf(request) });
  return url ? Response.redirect(url, 303) : backToSupport(request, "failed");
}
