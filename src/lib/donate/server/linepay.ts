// LINE Pay Online API v3：request（拿付款網址）→ 使用者在 LINE Pay 付 → 回 confirmUrl 我們打 confirm 才真的扣款。
// 簽章：Base64(HMAC-SHA256(secret, secret + apiPath + body或query + nonce))，同 ~/.claude/scripts/ecpay-wire 的 linepay/sign.js。
import { createHmac, randomUUID } from "node:crypto";

export type LinePayKeys = { channelId: string; channelSecret: string };

export function linePayKeys(): LinePayKeys | null {
  const { LINEPAY_CHANNEL_ID: channelId, LINEPAY_CHANNEL_SECRET: channelSecret } = process.env;
  return channelId && channelSecret ? { channelId, channelSecret } : null;
}

export function linePayApi(production: boolean): string {
  return production ? "https://api-pay.line.me" : "https://sandbox-api-pay.line.me";
}

export function linePayHeaders(keys: LinePayKeys, apiPath: string, body: string, nonce: string = randomUUID()): Record<string, string> {
  const signature = createHmac("sha256", keys.channelSecret).update(keys.channelSecret + apiPath + body + nonce).digest("base64");
  return {
    "Content-Type": "application/json",
    "X-LINE-ChannelId": keys.channelId,
    "X-LINE-Authorization-Nonce": nonce,
    "X-LINE-Authorization": signature,
  };
}

export function requestBody(input: { tradeNo: string; amount: number; origin: string }): string {
  const { tradeNo, amount, origin } = input;
  return JSON.stringify({
    amount,
    currency: "TWD",
    orderId: tradeNo,
    packages: [{ id: "donate", amount, name: "楓谷幫手", products: [{ name: "贊助楓谷幫手", quantity: 1, price: amount }] }],
    redirectUrls: {
      confirmUrl: `${origin}/api/donate/linepay/confirm?amount=${amount}`,
      cancelUrl: `${origin}/support?status=cancel`,
    },
  });
}

type LinePayReply = { returnCode?: string; info?: { paymentUrl?: { web?: string } } | unknown[] };

async function call(api: string, keys: LinePayKeys, apiPath: string, body: string): Promise<LinePayReply | null> {
  try {
    const res = await fetch(api + apiPath, { method: "POST", headers: linePayHeaders(keys, apiPath, body), body });
    return (await res.json()) as LinePayReply;
  } catch {
    return null;
  }
}

/** 付款紀錄（Payment Details API）：GET，簽章用查詢字串代替 body。查得到這筆＝已經付好了 */
async function paid(api: string, keys: LinePayKeys, transactionId: string): Promise<boolean> {
  const apiPath = "/v3/payments";
  const query = `transactionId=${transactionId}`;
  try {
    const res = await fetch(`${api}${apiPath}?${query}`, { method: "GET", headers: linePayHeaders(keys, apiPath, query) });
    const reply = (await res.json()) as LinePayReply;
    return reply.returnCode === "0000" && Array.isArray(reply.info) && reply.info.length > 0;
  } catch {
    return false;
  }
}

/** 回 LINE Pay 付款頁網址；失敗回 null */
export async function requestPayment(api: string, keys: LinePayKeys, input: { tradeNo: string; amount: number; origin: string }): Promise<string | null> {
  const reply = await call(api, keys, "/v3/payments/request", requestBody(input));
  const info = reply?.info;
  return reply?.returnCode === "0000" && info && !Array.isArray(info) ? info.paymentUrl?.web ?? null : null;
}

/**
 * 真的扣款；金額要跟 request 一樣，不一樣 LINE Pay 會拒絕。
 * v2.24：付完重新整理、按上一頁會再 confirm 一次，LINE Pay 回錯誤碼——錢其實扣了。confirm 失敗就查付款紀錄，查得到算付好了。
 */
export async function confirmPayment(api: string, keys: LinePayKeys, transactionId: string, amount: number): Promise<boolean> {
  if (!/^\d{1,30}$/.test(transactionId)) return false;
  const reply = await call(api, keys, `/v3/payments/${transactionId}/confirm`, JSON.stringify({ amount, currency: "TWD" }));
  if (reply?.returnCode === "0000") return true;
  return paid(api, keys, transactionId);
}
