import { afterEach, describe, expect, it, vi } from "vitest";
import { donateMethods, donateReturn, donateStatus, isPaidStatus, parseDonateAmount } from "../donate";
import { backToSupport, clientIp, createRateLimiter } from "../donate/server/http";
import { aioParams, autoSubmitPage, checkMacValue, ecpayResultStatus, newTradeNo, verifyCheckMac } from "../donate/server/ecpay";
import { confirmPayment, linePayHeaders, requestBody, requestPayment } from "../donate/server/linepay";
import { footerLinks } from "../footer-links";

// 綠界公開的測試商店金鑰（官方文件上的，不是我們的）
const STAGE = { merchantId: "3002607", hashKey: "pwFHCqoQZGmho4w6", hashIv: "EkRm7iFT261dpevs" };

describe("贊助設定（v2.22）", () => {
  it("donateMethods：沒開、開一個、兩個都開", () => {
    expect(donateMethods({ ecpay: false, linepay: false })).toEqual([]);
    expect(donateMethods({ ecpay: false, linepay: true })).toEqual(["linepay"]);
    expect(donateMethods({ ecpay: true, linepay: true })).toEqual(["ecpay", "linepay"]);
  });

  it("頁尾：兩個都沒開就沒有贊助連結，有開排在聯絡我們後面", () => {
    expect(footerLinks(false).map(link => link.href)).toEqual(["/about", "/privacy", "/terms", "/contact"]);
    expect(footerLinks(true).map(link => link.href)).toEqual(["/about", "/privacy", "/terms", "/contact", "/support"]);
    expect(footerLinks(true).at(-1)?.text).toBe("贊助楓谷幫手");
  });

  it("金額只收 30～10,000 的整數", () => {
    expect(parseDonateAmount("100")).toBe(100);
    expect(parseDonateAmount(" 30 ")).toBe(30);
    expect(parseDonateAmount("10000")).toBe(10000);
    for (const bad of ["29", "10001", "50.5", "-100", "", "abc", "1e3", undefined, 100]) expect(parseDonateAmount(bad)).toBeNull();
  });

  it("付完回來的 status 只認四種", () => {
    expect(donateStatus("?status=thanks")).toBe("thanks");
    expect(donateStatus("?status=issued")).toBe("issued");
    expect(donateStatus("?status=hack")).toBeNull();
    expect(donateStatus("")).toBeNull();
  });
});

describe("綠界 CheckMacValue", () => {
  it("跟姓名學 server/ecpay.py（對照官方 PHP SDK）算出一樣的值", () => {
    const params = {
      MerchantID: "3002607", MerchantTradeNo: "MH0123456789abcdef01", MerchantTradeDate: "2026/11/13 20:05:09", PaymentType: "aio",
      TotalAmount: "100", TradeDesc: "贊助楓谷幫手", ItemName: "贊助楓谷幫手",
      ReturnURL: "https://maplehelper.tw/api/donate/ecpay/notify", OrderResultURL: "https://maplehelper.tw/api/donate/ecpay/result",
      ClientBackURL: "https://maplehelper.tw/support", ChoosePayment: "ALL", EncryptType: "1",
    };
    expect(checkMacValue(params, STAGE)).toBe("AA312301D58316B3BAE43B79420866B804CBB9763F4BE90AF24E92B4D15AC3A2");
    // 特殊字元：.NET 不編的 !*()-_. 、編的 ' ~ 空白、中文
    expect(checkMacValue({ a: "x y!*()'~-_.", B: "中文" }, STAGE)).toBe("8ED94F660D31DA7668A86CF6D5DAC7EB40D861B3DEA20E65A03B79BB38318D99");
  });

  it("aioParams 帶對網址、金額，CheckMacValue 驗得過；改一個字就驗不過", () => {
    const params = aioParams({ keys: STAGE, tradeNo: "MH1", amount: 100, origin: "https://maplehelper.tw", now: new Date("2026-11-13T12:00:00Z") });
    expect(params.MerchantTradeDate).toBe("2026/11/13 20:00:00");
    expect(params.TotalAmount).toBe("100");
    expect(params.ReturnURL).toBe("https://maplehelper.tw/api/donate/ecpay/notify");
    expect(verifyCheckMac(params, STAGE)).toBe(true);
    expect(verifyCheckMac({ ...params, TotalAmount: "1" }, STAGE)).toBe(false);
    expect(verifyCheckMac({ ...params, CheckMacValue: "" }, STAGE)).toBe(false);
  });

  it("訂單編號 20 碼以內英數、每次不同", () => {
    const a = newTradeNo();
    expect(a).toMatch(/^MH[0-9a-f]{18}$/);
    expect(newTradeNo()).not.toBe(a);
  });

  it("自動送出頁把值轉義", () => {
    const html = autoSubmitPage("https://payment-stage.ecpay.com.tw/x", { ItemName: `"><script>` });
    expect(html).toContain('action="https://payment-stage.ecpay.com.tw/x"');
    expect(html).not.toContain(`"><script>`);
  });

  it("付款結果：1 付好、ATM／超商取號是繳費資料產生、其他沒成功", () => {
    expect(ecpayResultStatus("1")).toBe("thanks");
    expect(ecpayResultStatus("2")).toBe("issued");
    expect(ecpayResultStatus("10100073")).toBe("issued");
    expect(ecpayResultStatus("10100058")).toBe("failed");
    expect(ecpayResultStatus(undefined)).toBe("failed");
  });
});

describe("LINE Pay v3", () => {
  const keys = { channelId: "1234567890", channelSecret: "secret" };
  afterEach(() => vi.unstubAllGlobals());

  it("簽章：Base64(HMAC-SHA256(secret, secret+path+body+nonce))", () => {
    const headers = linePayHeaders(keys, "/v3/payments/request", "{}", "nonce-1");
    // node -e "crypto.createHmac('sha256','secret').update('secret/v3/payments/request{}nonce-1').digest('base64')"
    expect(headers["X-LINE-Authorization"]).toBe("R912Zd06zlblQa2D9HW91wFpkOBuF03PRwPgFVpyMKQ=");
    expect(headers["X-LINE-ChannelId"]).toBe("1234567890");
    expect(headers["X-LINE-Authorization-Nonce"]).toBe("nonce-1");
  });

  it("request 內容：金額、商品加總一致，付完回 confirm 帶金額", () => {
    const body = JSON.parse(requestBody({ tradeNo: "MH1", amount: 300, origin: "https://maplehelper.tw" }));
    expect(body.amount).toBe(300);
    expect(body.packages[0].amount).toBe(300);
    expect(body.packages[0].products[0].price * body.packages[0].products[0].quantity).toBe(300);
    expect(body.redirectUrls.confirmUrl).toBe("https://maplehelper.tw/api/donate/linepay/confirm?amount=300");
    expect(body.redirectUrls.cancelUrl).toBe("https://maplehelper.tw/support?status=cancel");
  });

  it("request 成功回付款網址，失敗回 null", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ returnCode: "0000", info: { paymentUrl: { web: "https://pay.line.me/x" } } })));
    expect(await requestPayment("https://sandbox-api-pay.line.me", keys, { tradeNo: "MH1", amount: 100, origin: "https://a" })).toBe("https://pay.line.me/x");
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ returnCode: "1104" })));
    expect(await requestPayment("https://sandbox-api-pay.line.me", keys, { tradeNo: "MH1", amount: 100, origin: "https://a" })).toBeNull();
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("down"); }));
    expect(await requestPayment("https://sandbox-api-pay.line.me", keys, { tradeNo: "MH1", amount: 100, origin: "https://a" })).toBeNull();
  });

  it("confirm 只收數字交易編號", async () => {
    const fetchMock = vi.fn(async () => Response.json({ returnCode: "0000" }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await confirmPayment("https://sandbox-api-pay.line.me", keys, "2026111300000001", 100)).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith("https://sandbox-api-pay.line.me/v3/payments/2026111300000001/confirm", expect.anything());
    expect(await confirmPayment("https://sandbox-api-pay.line.me", keys, "../x", 100)).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("v2.24 confirm 失敗（重新整理、按上一頁又送一次）就查付款紀錄，查得到算付好了", async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url.includes("/confirm") ? Response.json({ returnCode: "1172" }) : Response.json({ returnCode: "0000", info: [{ transactionId: 2026111300000001 }] }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await confirmPayment("https://sandbox-api-pay.line.me", keys, "2026111300000001", 100)).toBe(true);
    const [detailUrl, detailInit] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    expect(detailUrl).toBe("https://sandbox-api-pay.line.me/v3/payments?transactionId=2026111300000001");
    expect(detailInit.method).toBe("GET");
    // GET 的簽章是 secret + 路徑 + 查詢字串 + nonce
    const headers = detailInit.headers as Record<string, string>;
    expect(headers["X-LINE-Authorization"]).toBe(linePayHeaders(keys, "/v3/payments", "transactionId=2026111300000001", headers["X-LINE-Authorization-Nonce"])["X-LINE-Authorization"]);
  });

  it("v2.24 confirm 失敗、查不到付款紀錄才算沒成功", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) =>
      url.includes("/confirm") ? Response.json({ returnCode: "1150" }) : Response.json({ returnCode: "0000", info: [] })));
    expect(await confirmPayment("https://sandbox-api-pay.line.me", keys, "2026111300000001", 100)).toBe(false);
    vi.stubGlobal("fetch", vi.fn(async (url: string) =>
      url.includes("/confirm") ? Response.json({ returnCode: "1150" }) : Response.json({ returnCode: "1150" })));
    expect(await confirmPayment("https://sandbox-api-pay.line.me", keys, "2026111300000001", 100)).toBe(false);
  });
});

describe("付完回來（v2.24）", () => {
  it("回 /support 帶 status 跟付款方式", () => {
    const res = backToSupport(new Request("https://maplehelper.tw/api/donate/linepay/confirm"), "thanks", "linepay");
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("https://maplehelper.tw/support?status=thanks&method=linepay");
  });

  it("donateReturn：讀 status 跟 method，method 不認得就不帶", () => {
    expect(donateReturn("?status=thanks&method=ecpay")).toEqual({ status: "thanks", method: "ecpay" });
    expect(donateReturn("?status=issued&method=x")).toEqual({ status: "issued", method: null });
    expect(donateReturn("?method=ecpay")).toBeNull();
  });

  it("付好了（thanks、issued）才算 paid", () => {
    expect(isPaidStatus("thanks")).toBe(true);
    expect(isPaidStatus("issued")).toBe(true);
    expect(isPaidStatus("cancel")).toBe(false);
    expect(isPaidStatus("failed")).toBe(false);
  });
});

describe("防灌（v2.24）", () => {
  it("同一個位址一分鐘最多 5 次，換位址、過一分鐘就重算", () => {
    const limiter = createRateLimiter(5, 60_000);
    for (let i = 0; i < 5; i++) expect(limiter.allow("1.1.1.1", 0)).toBe(true);
    expect(limiter.allow("1.1.1.1", 1_000)).toBe(false);
    expect(limiter.allow("2.2.2.2", 1_000)).toBe(true);
    expect(limiter.allow("1.1.1.1", 60_001)).toBe(true);
  });

  it("位址：先看 Cloudflare 的 cf-connecting-ip，再看 x-forwarded-for", () => {
    expect(clientIp(new Request("https://a", { headers: { "cf-connecting-ip": "9.9.9.9", "x-forwarded-for": "1.1.1.1" } }))).toBe("9.9.9.9");
    expect(clientIp(new Request("https://a", { headers: { "x-forwarded-for": "1.1.1.1, 2.2.2.2" } }))).toBe("1.1.1.1");
    expect(clientIp(new Request("https://a"))).toBe("unknown");
  });
});
