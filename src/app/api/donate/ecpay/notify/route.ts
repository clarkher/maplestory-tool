// src/app/api/donate/ecpay/notify/route.ts
import { ecpayKeys, verifyCheckMac } from "@/lib/donate/server/ecpay";
import { formFields } from "@/lib/donate/server/http";

export const dynamic = "force-dynamic";

/** 綠界背景通知（ReturnURL）：驗過 CheckMacValue 回 1|OK，綠界才不會一直重送。贊助不存資料庫，對帳看綠界後台 */
export async function POST(request: Request): Promise<Response> {
  const keys = ecpayKeys();
  const fields = await formFields(request);
  const ok = Boolean(keys && fields && verifyCheckMac(fields, keys));
  return new Response(ok ? "1|OK" : "0|CheckMacValue Error", { status: ok ? 200 : 400, headers: { "Content-Type": "text/plain" } });
}
