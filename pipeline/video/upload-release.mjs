/**
 * 把已經做好、看過的公告片 release（tag video-<id>）原封不動傳上楓谷幫手 YouTube（公開），可順便把舊片改私人。v2.49。
 * 用在：手動重做（announce-video.yml 帶 bulletin_id 只建 release、不上傳）之後，驗過聲音再上傳——不重新 render，傳的就是驗過的那份。
 * 用法：node pipeline/video/upload-release.mjs <release 資料夾（有 main.mp4、shorts.mp4、cover.png、youtube.txt）> [要改私人的舊片 id,...]
 * 環境變數：YT_CLIENT_ID／YT_CLIENT_SECRET／YT_REFRESH_TOKEN。workflow：announce-video.yml 的 upload_release 輸入。
 */
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { youtubeFromEnv, uploadPair, getAccessToken, hideVideo, watchUrl } from "./lib/youtube.mjs";

const [dir, hide = ""] = process.argv.slice(2);
if (!dir) throw new Error("用法：node pipeline/video/upload-release.mjs <資料夾> [舊片 id,...]");
const creds = youtubeFromEnv(process.env);
if (!creds) throw new Error("缺少 YT_CLIENT_ID／YT_CLIENT_SECRET／YT_REFRESH_TOKEN");
const abs = resolve(dir);
const files = ["main.mp4", "shorts.mp4", "cover.png"].map((n) => join(abs, n));
const ids = await uploadPair({ files, ytText: await readFile(join(abs, "youtube.txt"), "utf8"), creds });
console.log(`YouTube（公開）：正片 ${watchUrl(ids.main)}、Shorts ${watchUrl(ids.shorts)}`);
const old = hide.split(",").map((s) => s.trim()).filter(Boolean);
if (old.length) {
  const token = await getAccessToken(creds);
  for (const id of old) {
    await hideVideo({ videoId: id, token });
    console.log(`舊片改私人：${id}`);
  }
}
