// 影片區封面（v2.32）：從成片抽 1.5 秒那格，存成 public/videos/<id>.webp（正片 640×360、短影音 360×640）
// 用法：node scripts/video-covers.mjs <正片.mp4> <正片id> [<短影音.mp4> <短影音id>]
// 要有 ffmpeg（含 libwebp）。加完記得在 src/lib/videos.ts 加那一集。
import { execFileSync } from "node:child_process";
import path from "node:path";

const args = process.argv.slice(2);
if (args.length < 2 || args.length % 2) throw new Error("用法：node scripts/video-covers.mjs <正片.mp4> <正片id> [<短影音.mp4> <短影音id>]");
for (let i = 0; i < args.length; i += 2) {
  const [file, id] = [args[i], args[i + 1]];
  const size = i === 0 ? "640:360" : "360:640";
  const out = path.join("public/videos", `${id}.webp`);
  execFileSync("ffmpeg", ["-y", "-v", "error", "-ss", "1.5", "-i", file, "-frames:v", "1", "-vf", `scale=${size}`, "-c:v", "libwebp", "-quality", "80", out]);
  console.log("存", out);
}
