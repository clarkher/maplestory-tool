// 片做好直接上傳到「楓谷幫手」YouTube 頻道（一律私人，使用者在 YouTube 工作室看完再改公開）。
// 秘密（Actions secrets）：YT_CLIENT_ID、YT_CLIENT_SECRET、YT_REFRESH_TOKEN（Google Cloud 專案 maplehelper-youtube，
// 頻道帳號授權一次換來的）。缺任何一個就不上傳。
// 注意：API 專案還沒過 YouTube 稽核前，API 上傳的片只能是私人、改不了公開。
import { readFile } from "node:fs/promises";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const UPLOAD_URL = "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status";
const THUMB_URL = "https://www.googleapis.com/upload/youtube/v3/thumbnails/set";
export const TAGS = ["楓之谷經典版", "楓谷幫手", "新楓之谷", "官方公告"];

function fail(what, status, text) {
  const e = new Error(`${what} → HTTP ${status}：${String(text).slice(0, 300)}`);
  e.status = status;
  return e;
}

/** youtube.txt（第一行標題、空行、說明欄）拆回標題跟說明 */
export function parseYoutubeTxt(text) {
  const [first, ...rest] = String(text).replace(/\r/g, "").split("\n");
  return { title: first.trim(), description: rest.join("\n").trim() };
}

/** Shorts 標題加 #Shorts，總長壓在 100 字內 */
export function shortsTitle(title) {
  const tail = " #Shorts";
  const chars = [...String(title).trim()];
  const room = 100 - tail.length;
  return (chars.length > room ? chars.slice(0, room).join("") : chars.join("")) + tail;
}

export function youtubeFromEnv(env) {
  const { YT_CLIENT_ID: clientId, YT_CLIENT_SECRET: clientSecret, YT_REFRESH_TOKEN: refreshToken } = env;
  if (!clientId || !clientSecret || !refreshToken) return null;
  return { clientId, clientSecret, refreshToken };
}

export async function getAccessToken({ clientId, clientSecret, refreshToken, fetcher = fetch }) {
  const res = await fetcher(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" }).toString(),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw fail("YouTube 換 token", res.status, await res.text());
  return (await res.json()).access_token;
}

/** resumable 上傳；回傳影片 id */
export async function uploadVideo({ file, title, description, tags = TAGS, privacy = "private", token, fetcher = fetch }) {
  const data = await readFile(file);
  const init = await fetcher(UPLOAD_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json; charset=utf-8",
      "x-upload-content-type": "video/mp4",
      "x-upload-content-length": String(data.length),
    },
    body: JSON.stringify({
      snippet: { title, description, tags, categoryId: "20", defaultLanguage: "zh-TW", defaultAudioLanguage: "zh-TW" },
      status: { privacyStatus: privacy, selfDeclaredMadeForKids: false },
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!init.ok) throw fail("YouTube 開始上傳", init.status, await init.text());
  const session = init.headers.get("location");
  if (!session) throw new Error("YouTube 沒給上傳網址");
  const put = await fetcher(session, {
    method: "PUT",
    headers: { "content-type": "video/mp4", "content-length": String(data.length) },
    body: data,
    signal: AbortSignal.timeout(600_000),
  });
  if (!put.ok) throw fail("YouTube 上傳影片", put.status, await put.text());
  return (await put.json()).id;
}

export async function setThumbnail({ videoId, file, token, fetcher = fetch }) {
  const res = await fetcher(`${THUMB_URL}?videoId=${encodeURIComponent(videoId)}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "image/png" },
    body: await readFile(file),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw fail("YouTube 設封面", res.status, await res.text());
}

/**
 * 正片＋Shorts 都傳（私人），正片設封面。回 { main, shorts } 影片 id。
 * 封面失敗不算整個失敗（新頻道沒驗證電話前不能自訂封面）。
 */
export async function uploadPair({ files, ytText, creds, fetcher = fetch, log = console.log }) {
  const pick = (n) => files.find((f) => f.replace(/\\/g, "/").endsWith(`/${n}`));
  const { title, description } = parseYoutubeTxt(ytText);
  const token = await getAccessToken({ ...creds, fetcher });
  const main = await uploadVideo({ file: pick("main.mp4"), title, description, token, fetcher });
  try {
    await setThumbnail({ videoId: main, file: pick("cover.png"), token, fetcher });
  } catch (e) {
    log(`封面沒設成（片照樣在）：${e.message}`);
  }
  const shorts = await uploadVideo({ file: pick("shorts.mp4"), title: shortsTitle(title), description, token, fetcher });
  return { main, shorts };
}

export const studioUrl = (id) => `https://studio.youtube.com/video/${id}/edit`;
