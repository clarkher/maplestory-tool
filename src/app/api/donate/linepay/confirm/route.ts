// src/app/api/donate/linepay/confirm/route.ts
import { parseDonateAmount } from "@/lib/donate";
import { backToSupport, isProduction } from "@/lib/donate/server/http";
import { confirmPayment, linePayApi, linePayKeys } from "@/lib/donate/server/linepay";

export const dynamic = "force-dynamic";

/** LINE Pay 付完導回來（confirmUrl）：打 confirm 才真的扣款，成功回 /support?status=thanks */
export async function GET(request: Request): Promise<Response> {
  const keys = linePayKeys();
  const query = new URL(request.url).searchParams;
  const amount = parseDonateAmount(query.get("amount") ?? "");
  const transactionId = query.get("transactionId") ?? "";
  if (!keys || amount === null) return backToSupport(request, "failed");
  const ok = await confirmPayment(linePayApi(isProduction()), keys, transactionId, amount);
  return backToSupport(request, ok ? "thanks" : "failed");
}
