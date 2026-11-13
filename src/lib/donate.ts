/**
 * 贊助楓谷幫手（v2.22）。付款走 Worker 的 /api/donate/*（綠界 AIO、LINE Pay v3），金鑰是 Worker secret，不進 repo、不進前端：
 *   ECPAY_MERCHANT_ID、ECPAY_HASH_KEY、ECPAY_HASH_IV、LINEPAY_CHANNEL_ID、LINEPAY_CHANNEL_SECRET（`wrangler secret put <名稱> [--env dev]`）
 * 測試機（APP_ENV 不是 production）打兩家的沙盒，正式機打正式。
 *
 * DONATE_ENABLED 關掉＝那顆按鈕不畫；兩個都關＝/support 寫「目前沒有開放贊助」、頁尾連結跟攻略文結尾小卡都不出現。
 */
export type DonateMethod = "ecpay" | "linepay";
export type DonatePlacement = "footer" | "guide_end" | "support_page";

export const DONATE_ENABLED: Record<DonateMethod, boolean> = { ecpay: true, linepay: true };

/** 有開的付款方式，順序 ecpay → linepay */
export function donateMethods(enabled: Record<DonateMethod, boolean> = DONATE_ENABLED): DonateMethod[] {
  return (["ecpay", "linepay"] as const).filter(method => enabled[method]);
}

export const DONATE_METHOD_LABEL: Record<DonateMethod, string> = {
  ecpay: "用信用卡／ATM／超商付款",
  linepay: "用 LINE Pay 付款",
};

/** 金額：快選三個，也可以自己填（整數 NT$30～10,000；超商代碼最低 30） */
export const DONATE_PICKS = [50, 100, 300];
export const DONATE_DEFAULT = 100;
export const DONATE_MIN = 30;
export const DONATE_MAX = 10000;

/** 表單送來的金額：不是 30～10,000 的整數回 null */
export function parseDonateAmount(raw: unknown): number | null {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (!/^\d{1,6}$/.test(text)) return null;
  const amount = Number(text);
  return amount >= DONATE_MIN && amount <= DONATE_MAX ? amount : null;
}

/** 付完回 /support 帶的 ?status= */
export type DonateStatus = "thanks" | "issued" | "cancel" | "failed";

export const DONATE_STATUS_TEXT: Record<DonateStatus, string> = {
  thanks: "收到你的贊助了，謝謝你！",
  issued: "繳費資料已經產生，照綠界頁面上的期限繳完就完成了。謝謝你！",
  cancel: "付款取消了，沒有扣款。",
  failed: "這次付款沒有成功，沒有扣款。可以再試一次，或換另一種付款方式。",
};

export function donateStatus(search: string): DonateStatus | null {
  const value = new URLSearchParams(search).get("status");
  return value && value in DONATE_STATUS_TEXT ? (value as DonateStatus) : null;
}
