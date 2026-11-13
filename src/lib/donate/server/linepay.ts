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

type LinePayReply = { returnCode?: string; info?: { paymentUrl?: { web?: string } } };

async function call(api: string, keys: LinePayKeys, apiPath: string, body: string): Promise<LinePayReply | null> {
  try {
    const res = await fetch(api + apiPath, { method: "POST", headers: linePayHeaders(keys, apiPath, body), body });
    return (await res.json()) as LinePayReply;
  } catch {
    return null;
  }
}

/** 回 LINE Pay 付款頁網址；失敗回 null */
export async function requestPayment(api: string, keys: LinePayKeys, input: { tradeNo: string; amount: number; origin: string }): Promise<string | null> {
  const reply = await call(api, keys, "/v3/payments/request", requestBody(input));
  return reply?.returnCode === "0000" ? reply.info?.paymentUrl?.web ?? null : null;
}

/** 真的扣款；金額要跟 request 一樣，不一樣 LINE Pay 會拒絕 */
export async function confirmPayment(api: string, keys: LinePayKeys, transactionId: string, amount: number): Promise<boolean> {
  if (!/^\d{1,30}$/.test(transactionId)) return false;
  const reply = await call(api, keys, `/v3/payments/${transactionId}/confirm`, JSON.stringify({ amount, currency: "TWD" }));
  return reply?.returnCode === "0000";
}
