import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseYoutubeTxt, shortsTitle, youtubeFromEnv, getAccessToken, uploadVideo, setThumbnail } from "./youtube.mjs";

test("parseYoutubeTxt：第一行是標題，空行後面是說明欄", () => {
  assert.deepEqual(parseYoutubeTxt("標題｜11/21 登場\n\nhttps://maplehelper.tw/x\n第二行\n\n#楓之谷經典版\n"), {
    title: "標題｜11/21 登場",
    description: "https://maplehelper.tw/x\n第二行\n\n#楓之谷經典版",
  });
});

test("shortsTitle：加 #Shorts，總長不超過 100 字", () => {
  assert.equal(shortsTitle("楓潮派對"), "楓潮派對 #Shorts");
  const t = shortsTitle("字".repeat(100));
  assert.equal([...t].length, 100);
  assert.ok(t.endsWith(" #Shorts"));
});

test("youtubeFromEnv：三個秘密缺一個就回 null（不上傳）", () => {
  assert.equal(youtubeFromEnv({ YT_CLIENT_ID: "a", YT_CLIENT_SECRET: "b" }), null);
  assert.ok(youtubeFromEnv({ YT_CLIENT_ID: "a", YT_CLIENT_SECRET: "b", YT_REFRESH_TOKEN: "c" }));
});

test("getAccessToken：用 refresh token 換，失敗帶 status", async () => {
  const seen = [];
  const ok = async (url, init) => {
    seen.push([url, String(init.body)]);
    return new Response(JSON.stringify({ access_token: "AT" }), { status: 200 });
  };
  assert.equal(await getAccessToken({ clientId: "a", clientSecret: "b", refreshToken: "c", fetcher: ok }), "AT");
  assert.match(seen[0][1], /grant_type=refresh_token/);
  const bad = async () => new Response('{"error":"invalid_grant"}', { status: 400 });
  await assert.rejects(getAccessToken({ clientId: "a", clientSecret: "b", refreshToken: "c", fetcher: bad }), (e) => e.status === 400);
});

test("uploadVideo：先開 resumable 再 PUT 檔案，預設私人、遊戲分類、非兒童", async () => {
  const dir = await mkdtemp(join(tmpdir(), "yt-"));
  const file = join(dir, "main.mp4");
  await writeFile(file, Buffer.from("video"));
  const calls = [];
  const fetcher = async (url, init) => {
    calls.push({ url, init });
    if (calls.length === 1) return new Response("", { status: 200, headers: { location: "https://upload.example/session" } });
    return new Response(JSON.stringify({ id: "VID123" }), { status: 200 });
  };
  const id = await uploadVideo({ file, title: "標題", description: "說明", tags: ["楓之谷經典版"], token: "AT", fetcher });
  assert.equal(id, "VID123");
  assert.match(calls[0].url, /uploadType=resumable/);
  const meta = JSON.parse(calls[0].init.body);
  assert.equal(meta.status.privacyStatus, "private");
  assert.equal(meta.status.selfDeclaredMadeForKids, false);
  assert.equal(meta.snippet.categoryId, "20");
  assert.equal(meta.snippet.title, "標題");
  assert.equal(calls[1].url, "https://upload.example/session");
  assert.equal(calls[1].init.method, "PUT");
  assert.equal(calls[0].init.headers.authorization, "Bearer AT");
});

test("uploadVideo：API 拒絕時丟錯並帶 status", async () => {
  const dir = await mkdtemp(join(tmpdir(), "yt-"));
  const file = join(dir, "main.mp4");
  await writeFile(file, Buffer.from("v"));
  const fetcher = async () => new Response('{"error":{"message":"quotaExceeded"}}', { status: 403 });
  await assert.rejects(uploadVideo({ file, title: "t", description: "d", token: "AT", fetcher }), (e) => e.status === 403 && /quotaExceeded/.test(e.message));
});

test("setThumbnail：上傳 png 到 thumbnails/set", async () => {
  const dir = await mkdtemp(join(tmpdir(), "yt-"));
  const png = join(dir, "cover.png");
  await writeFile(png, Buffer.from("png"));
  let seen;
  const fetcher = async (url, init) => {
    seen = { url, init };
    return new Response("{}", { status: 200 });
  };
  await setThumbnail({ videoId: "VID", file: png, token: "AT", fetcher });
  assert.match(seen.url, /thumbnails\/set\?videoId=VID/);
  assert.equal(seen.init.headers["content-type"], "image/png");
});
