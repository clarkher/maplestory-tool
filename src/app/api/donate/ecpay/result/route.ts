// src/app/api/donate/ecpay/result/route.ts
import { ecpayKeys, ecpayResultStatus, verifyCheckMac } from "@/lib/donate/server/ecpay";
import { backToSupport, formFields } from "@/lib/donate/server/http";

export const dynamic = "force-dynamic";

/** 綠界付完把瀏覽器 POST 回來（OrderResultURL）：驗章後照結果回 /support 顯示謝謝／繳費資料已產生／沒成功 */
export async function POST(request: Request): Promise<Response> {
  const keys = ecpayKeys();
  const fields = await formFields(request);
  if (!keys || !fields || !verifyCheckMac(fields, keys)) return backToSupport(request, "failed");
  return backToSupport(request, ecpayResultStatus(fields.RtnCode));
}
