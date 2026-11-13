// 片放 GitHub prerelease（tag video-<公告id>）＋追蹤 issue 的留言文字。
// call(method, url, body, {contentType}) 由 makeCall() 產生：url 以 / 開頭打 REST API，完整網址（上傳）照用；
// body 是 Buffer 就原樣送（上傳資產），其他轉 JSON。測試傳假的 call。
import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";
import { bulletinUrl } from "../../announce/lib/bulletin.mjs";

const TYPES = { ".mp4": "video/mp4", ".png": "image/png", ".txt": "text/plain; charset=utf-8", ".json": "application/json" };

export function makeCall({ token, api = "https://api.github.com", fetcher = fetch } = {}) {
  return async function call(method, url, body, { contentType } = {}) {
    const raw = Buffer.isBuffer(body);
    const headers = {
      authorization: `Bearer ${token}`,
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      "user-agent": "maplestory-tool announce-video",
    };
    if (body !== undefined) headers["content-type"] = raw ? contentType ?? "application/octet-stream" : "application/json";
    const full = /^https?:\/\//.test(url) ? url : `${api}${url}`;
    // 上傳大檔給 10 分鐘，其他 2 分鐘
    const signal = AbortSignal.timeout(raw ? 600_000 : 120_000);
    const response = await fetcher(full, { method, headers, body: body === undefined ? undefined : raw ? body : JSON.stringify(body), signal });
    if (!response.ok) throw new Error(`${method} ${url.split("?")[0]} → HTTP ${response.status}：${String(await response.text()).slice(0, 300)}`);
    return response.status === 204 ? null : response.json();
  };
}

export const tagName = (id) => `video-${id}`;

/**
 * 建或更新 prerelease，上傳檔案（同名舊資產先刪）。
 * @returns {Promise<{htmlUrl:string, assetUrls:Record<string,string>}>}
 */
export async function upsertRelease(id, title, files, { call, repo }) {
  const tag = tagName(id);
  const name = `待審｜${title}`;
  let release;
  try {
    release = await call("GET", `/repos/${repo}/releases/tags/${tag}`);
  } catch (err) {
    if (!/HTTP 404/.test(err.message)) throw err;
    release = null;
  }
  if (!release) {
    release = await call("POST", `/repos/${repo}/releases`, {
      tag_name: tag,
      target_commitish: "main",
      name,
      prerelease: true,
      body: `官網公告 ${id} 自動做的快報片，待審。公告：${bulletinUrl(id)}`,
    });
  } else {
    const names = new Set(files.map((f) => basename(f)));
    for (const a of release.assets ?? []) {
      if (names.has(a.name)) await call("DELETE", `/repos/${repo}/releases/assets/${a.id}`);
    }
    if (release.name !== name) await call("PATCH", `/repos/${repo}/releases/${release.id}`, { name });
  }
  const uploadBase = String(release.upload_url).replace(/\{.*\}$/, "");
  const assetUrls = {};
  for (const f of files) {
    const n = basename(f);
    const asset = await call("POST", `${uploadBase}?name=${encodeURIComponent(n)}`, await readFile(f), {
      contentType: TYPES[extname(n).toLowerCase()] ?? "application/octet-stream",
    });
    assetUrls[n] = asset.browser_download_url;
  }
  return { htmlUrl: release.html_url, assetUrls };
}

/** 這個 tag 的發布頁是不是已經做完（四個檔都在）；404 → false，其他錯照丟 */
export async function releaseExists(tag, { call, repo }) {
  let release;
  try {
    release = await call("GET", `/repos/${repo}/releases/tags/${tag}`);
  } catch (err) {
    if (/HTTP 404/.test(err.message)) return false;
    throw err;
  }
  const names = new Set((release?.assets ?? []).map((a) => a.name));
  return ["main.mp4", "shorts.mp4", "cover.png", "youtube.txt"].every((n) => names.has(n));
}

export function renderVideoComment({ title, row, release }) {
  const u = release.assetUrls;
  return [
    `### 做好片了：${title}`,
    "",
    `![封面](${u["cover.png"]})`,
    "",
    `公告：[${row.title}](${bulletinUrl(row.bullentinId)})（${row.startDate}）`,
    "",
    `- 正片（橫的 16:9）：[main.mp4](${u["main.mp4"]})`,
    `- Shorts（直的 9:16）：[shorts.mp4](${u["shorts.mp4"]})`,
    `- 標題跟說明欄：[youtube.txt](${u["youtube.txt"]})`,
    `- 整包：${release.htmlUrl}`,
    "",
    "看完上傳到楓谷幫手頻道，標題說明欄在 youtube.txt。",
  ].join("\n");
}

export function renderSkipComment(row, reason) {
  return [
    `### 沒做片：${row.title}`,
    "",
    `公告：[${row.title}](${bulletinUrl(row.bullentinId)})（${row.startDate}）`,
    "",
    `原因：${reason}`,
    "",
    `不會再自動重試。要再試一次：\`gh workflow run announce-video.yml -f bulletin_id=${row.bullentinId}\``,
  ].join("\n");
}
