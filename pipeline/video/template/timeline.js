// 快報影片的時間軸。compose.mjs 會把 D（時間資料）塞在這段前面。
// 全部動畫掛在同一條 paused timeline，畫面只跟時間有關（HyperFrames 規則 3、4）。
const tl = gsap.timeline({ paused: true });
const END = D.dur - 3;

// 背景地圖：整支片慢慢橫移
tl.fromTo("#bg .bg-pan", { x: D.bgPan / 2, scale: 1.16 }, { x: -D.bgPan / 2, scale: 1.16, duration: D.dur, ease: "none" }, 0);

// 片頭：紅條、黃條滑進來，標題逐行清楚，副標接著出來
tl.fromTo("#open .bar .red", { xPercent: -100 }, { xPercent: 0, duration: 0.45, ease: "expo.out" }, 0);
tl.fromTo("#open .bar .yel", { xPercent: -140, opacity: 0 }, { xPercent: 0, opacity: 1, duration: 0.45, ease: "expo.out" }, 0.12);
gsap.utils.toArray("#open .headline .hl-line").forEach((el, i) => {
  tl.fromTo(el, { opacity: 0, filter: "blur(10px)", y: 24 }, { opacity: 1, filter: "blur(0px)", y: 0, duration: 0.3, ease: "power4.out" }, 0.28 + i * 0.16);
});
tl.fromTo("#open .sub", { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.35, ease: "power3.out" }, 0.7);
tl.to("#open .open-in", { opacity: 0, duration: 0.2, ease: "power2.in" }, 2.78);

// 角色：片頭跳上來，進段落時縮到旁邊，換成官方圖前退場
gsap.utils.toArray("#avs .av").forEach((el, i) => {
  tl.fromTo(el, { opacity: 0, y: 90 }, { opacity: 1, y: 0, duration: 0.55, ease: "back.out(1.4)" }, 0.4 + i * 0.14);
});
if (D.avShift) {
  tl.to("#avs .avs-in", { scale: D.avShift.scale, x: D.avShift.x, y: D.avShift.y, duration: 0.5, ease: "power2.inOut" }, 2.85);
}
if (D.avEnd > 3) {
  tl.to("#avs .avs-in", { opacity: 0, duration: 0.18, ease: "power2.in" }, D.avEnd - 0.2);
} else {
  tl.to("#avs .avs-in", { opacity: 0, duration: 0.18, ease: "power2.in" }, 2.78);
}

// 右上品牌、跑馬燈
tl.fromTo("#brand .brand-in", { opacity: 0 }, { opacity: 1, duration: 0.4, ease: "power2.out" }, 0.2);
tl.to("#brand .brand-in", { opacity: 0, duration: 0.2, ease: "power2.in" }, END - 0.2);
tl.fromTo("#ticker .tk-bar", { yPercent: 100 }, { yPercent: 0, duration: 0.45, ease: "expo.out" }, 0.05);
// 片頭停住（跟拍板稿一樣從左邊排起），進段落後才開始跑
tl.fromTo("#ticker .tk-track", { x: 0 }, { x: -D.tickerDist, duration: D.dur - 3, ease: "none" }, 3);

// 段落小條
tl.fromTo("#hdr .bar", { xPercent: -100 }, { xPercent: 0, duration: 0.4, ease: "expo.out" }, 3);
tl.to("#hdr .bar", { opacity: 0, duration: 0.2, ease: "power2.in" }, END - 0.2);

// 每句旁白一個段落
D.segs.forEach((s) => {
  const root = "#" + s.id;
  const last = s.start + s.dur;
  if (s.kind === "card") {
    tl.fromTo(root + " .big", { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.4, ease: "back.out(1.6)" }, s.start + 0.04);
    tl.fromTo(root + " .line", { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.35, ease: "power3.out" }, s.start + 0.24);
  } else if (s.kind === "image") {
    tl.fromTo(root + " .imgbox", { opacity: 0, scale: 0.94 }, { opacity: 1, scale: 1, duration: 0.35, ease: "power3.out" }, s.start);
    tl.fromTo(root + " .imgpan", { scale: 1 }, { scale: 1.08, duration: s.dur, ease: "none" }, s.start);
    if (D.layout === "shorts") {
      tl.fromTo(root + " .seg-title", { opacity: 0 }, { opacity: 1, duration: 0.3, ease: "power2.out" }, s.start);
    }
  } else {
    tl.fromTo(root + " .big", { opacity: 0, scale: 0.8 }, { opacity: 1, scale: 1, duration: 0.4, ease: "power4.out" }, s.start + 0.04);
  }
  tl.to(root + " .seg-in", { opacity: 0, duration: 0.14, ease: "power2.in" }, last - 0.15);
});

// 字幕：時間＝那句音檔的起訖
D.caps.forEach((c) => {
  const el = "#" + c.id + " .cap-in";
  tl.fromTo(el, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.12, ease: "power2.out" }, c.start);
  tl.to(el, { opacity: 0, duration: 0.08, ease: "power2.in" }, c.start + c.dur - 0.09);
});

// 片尾
tl.fromTo("#end .end-lead", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.35, ease: "power3.out" }, END + 0.1);
tl.fromTo("#end .end-url", { opacity: 0, scale: 0.7 }, { opacity: 1, scale: 1, duration: 0.45, ease: "back.out(1.6)" }, END + 0.3);
tl.fromTo("#end .end-logo", { opacity: 0, rotation: -20, scale: 0.6 }, { opacity: 1, rotation: 0, scale: 1, duration: 0.5, ease: "back.out(1.4)" }, END);

window.__timelines["main"] = tl;
tl.seek(0);
