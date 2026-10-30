// src/lib/boss/sound.ts
// 提醒音：用 Web Audio 現場產生（不放音檔），兩聲 880Hz、各 0.15 秒

let ctx: AudioContext | null = null;

/** 響兩聲；瀏覽器不支援或被擋就安靜跳過 */
export function playBeep(): void {
  try {
    const Ctor =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    ctx ??= new Ctor();
    if (ctx.state === "suspended") void ctx.resume();
    const start = ctx.currentTime + 0.02;
    for (const offset of [0, 0.3]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 880;
      const t0 = start + offset;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.25, t0 + 0.01);
      gain.gain.setValueAtTime(0.25, t0 + 0.13);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.15);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.16);
    }
  } catch {
    // 沒聲音就算了，通知還是會跳
  }
}

/** 在使用者點擊時呼叫一次，讓之後的提醒音不會被自動播放規則擋掉 */
export function unlockAudio(): void {
  try {
    const Ctor =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    ctx ??= new Ctor();
    if (ctx.state === "suspended") void ctx.resume();
  } catch {
    // 同上
  }
}
