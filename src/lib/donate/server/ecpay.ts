// 綠界 AIO 金流（CheckMacValue SHA256），寫法對照官方 PHP SDK，跟姓名學 server/ecpay.py 同一套。
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";

export type EcpayKeys = { merchantId: string; hashKey: string; hashIv: string };

export function ecpayKeys(): EcpayKeys | null {
  const { ECPAY_MERCHANT_ID: merchantId, ECPAY_HASH_KEY: hashKey, ECPAY_HASH_IV: hashIv } = process.env;
  return merchantId && hashKey && hashIv ? { merchantId, hashKey, hashIv } : null;
}

export function ecpayCheckoutUrl(production: boolean): string {
  return production
    ? "https://payment.ecpay.com.tw/Cashier/AioCheckOut/V5"
    : "https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5";
}

// .NET 的 UrlEncode 不編這幾個字，綠界照它算
const NET_KEEP: Record<string, string> = { "%2d": "-", "%5f": "_", "%2e": ".", "%21": "!", "%2a": "*", "%28": "(", "%29": ")" };

function ecpayUrlEncode(source: string): string {
  let encoded = encodeURIComponent(source)
    .replace(/%20/g, "+")
    .replace(/[!'()*~]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
    .toLowerCase();
  for (const [from, to] of Object.entries(NET_KEEP)) encoded = encoded.split(from).join(to);
  return encoded;
}

export function checkMacValue(params: Record<string, string>, keys: Pick<EcpayKeys, "hashKey" | "hashIv">): string {
  const pairs = Object.entries(params)
    .filter(([key]) => key !== "CheckMacValue")
    .sort(([a], [b]) => (a.toLowerCase() < b.toLowerCase() ? -1 : a.toLowerCase() > b.toLowerCase() ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`);
  const raw = `HashKey=${keys.hashKey}&${pairs.join("&")}&HashIV=${keys.hashIv}`;
  return createHash("sha256").update(ecpayUrlEncode(raw)).digest("hex").toUpperCase();
}

export function verifyCheckMac(params: Record<string, string>, keys: Pick<EcpayKeys, "hashKey" | "hashIv">): boolean {
  const received = Buffer.from((params.CheckMacValue ?? "").toUpperCase());
  const expected = Buffer.from(checkMacValue(params, keys));
  return received.length === expected.length && timingSafeEqual(received, expected);
}

/** 訂單編號：20 碼以內英數，兩家共用 */
export function newTradeNo(): string {
  return `MH${randomUUID().replace(/-/g, "")}`.slice(0, 20);
}

function taiwanTime(now: Date): string {
  const t = new Date(now.getTime() + 8 * 3600_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${t.getUTCFullYear()}/${pad(t.getUTCMonth() + 1)}/${pad(t.getUTCDate())} ${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}:${pad(t.getUTCSeconds())}`;
}

/** AIO 表單參數（含 CheckMacValue）。付款方式全開：信用卡、ATM、超商代碼等由綠界頁面讓人選 */
export function aioParams(input: { keys: EcpayKeys; tradeNo: string; amount: number; origin: string; now?: Date }): Record<string, string> {
  const { keys, tradeNo, amount, origin } = input;
  const params: Record<string, string> = {
    MerchantID: keys.merchantId,
    MerchantTradeNo: tradeNo,
    MerchantTradeDate: taiwanTime(input.now ?? new Date()),
    PaymentType: "aio",
    TotalAmount: String(amount),
    TradeDesc: "贊助楓谷幫手",
    ItemName: "贊助楓谷幫手",
    ReturnURL: `${origin}/api/donate/ecpay/notify`,
    OrderResultURL: `${origin}/api/donate/ecpay/result`,
    ClientBackURL: `${origin}/support`,
    ChoosePayment: "ALL",
    EncryptType: "1",
  };
  params.CheckMacValue = checkMacValue(params, keys);
  return params;
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
}

/** 自動送出到綠界的頁面（綠界只收瀏覽器 POST 表單） */
export function autoSubmitPage(action: string, params: Record<string, string>): string {
  const inputs = Object.entries(params)
    .map(([key, value]) => `<input type="hidden" name="${escapeHtml(key)}" value="${escapeHtml(value)}">`)
    .join("");
  return `<!doctype html><html lang="zh-Hant-TW"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>前往綠界付款</title></head>`
    + `<body style="font-family:sans-serif;padding:24px"><form id="pay" method="post" action="${escapeHtml(action)}">${inputs}<p>正在前往綠界付款頁…</p><button type="submit">沒有自動跳轉就按這裡</button></form>`
    + `<script>document.getElementById("pay").submit()</script></body></html>`;
}

/** OrderResultURL 的 RtnCode：1 付好；2（ATM 取號）、10100073（超商代碼取號）是繳費資料產生了 */
export function ecpayResultStatus(rtnCode: string | undefined): "thanks" | "issued" | "failed" {
  if (rtnCode === "1") return "thanks";
  if (rtnCode === "2" || rtnCode === "10100073") return "issued";
  return "failed";
}
