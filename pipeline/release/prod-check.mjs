/**
 * 正式機是不是已經是這一版。用法：node pipeline/release/prod-check.mjs https://maplestory-tool-three.vercel.app 120
 * 輸出 true／false（讀不到 meta.json 算 false）。
 */
import { released } from "./opening.mjs";

const [url, cap] = process.argv.slice(2);
const meta = await fetch(`${url}/data/meta.json`, { cache: "no-store" }).then(response => (response.ok ? response.json() : null)).catch(() => null);
console.log(released(meta, Number(cap)) ? "true" : "false");
