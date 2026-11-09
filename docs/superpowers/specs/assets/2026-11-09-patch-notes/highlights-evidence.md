# 改版重點依據（v1.94 草稿，等使用者審）

每條重點的數字都從 `public/data/patches/<版本>.json` 數出來；下面每條附可重跑的 node 指令（在 repo 根目錄跑）。
`P` 代表 `require('./public/data/patches/<版本>.json')`。

## 2.0.0（萬聖節祭典、冰原雪域任務）

1. `4310522` 萬聖節「雪原的面具祭典」｜75 個活動任務，萬聖節硬幣可換道具
   - 依據：2.0.0 added.quests 裡 cat === 活動 且 n 以「[萬聖節]」開頭，共 75 筆（活動類共 83 筆，另 8 筆是菇菇通行證、楓葉商會，不算）。
     `node -e "const P=require('./public/data/patches/2.0.0.json');console.log(P.added.quests.filter(x=>x.cat==='活動'&&x.n.startsWith('[萬聖節]')).length)"` → 75
   - 依據：萬聖節硬幣（4310522）在 items.json 的說明是「可向行商人交換各種道具」；2.0.0 changed 裡 kind === 商店 且 after 含「萬聖節硬幣」共 4 筆（棒冰棒、烤鰻魚、礦泉水、紅豆刨冰，地點「雪原的面具祭典現場」）。
     `node -e "const P=require('./public/data/patches/2.0.0.json');console.log(P.changed.filter(c=>c.kind==='商店'&&c.after.includes('萬聖節硬幣')).map(c=>c.n))"`
   - 地圖名：2.0.0 added.maps 有「雪原的面具祭典現場」。
2. `4000049` 天空之城、冰原雪域新任務｜85 個任務，10～90 等都有（依起始 NPC 地圖：天空之城 49、冰原雪域 25、維多利亞島四村賢者 9、艾利傑的庭園 2）
   - 依據：2.0.0 added.quests 裡 cat === 冰原雪域，共 85 筆；有 minLv 的最小 10、最大 90。
     `node -e "const P=require('./public/data/patches/2.0.0.json');const q=P.added.quests.filter(x=>x.cat==='冰原雪域');const l=q.map(x=>x.minLv).filter(Boolean);console.log(q.length,Math.min(...l),Math.max(...l))"` → 85 10 90
   - 圖示：雪吉拉之角（4000049）在 2.0.0 changed（掉落多了變形雪吉拉），且是冰原雪域任務 3052「收集毛皮衣材料」用到的道具。
3. `2046414` 楓葉武器卷軸｜五個職業共 21 張，分 100%、70%、15%
   - 依據：2.0.0 added.items 裡 n 含「楓葉」且 s === 卷軸，共 21 筆；職業前綴為劍士 3、弓箭手 3、法師 3、盜賊 6（拳套、短劍）、海盜 6（指虎、火槍），每組都是 100%／70%／15%。
     `node -e "const P=require('./public/data/patches/2.0.0.json');console.log(P.added.items.filter(i=>i.n.includes('楓葉')&&i.s==='卷軸').map(i=>i.n))"`
4. `2450247` 經驗值加倍券｜1.5 倍、2 倍共 7 種，每張 30 分鐘
   - 依據：2.0.0 added.items 裡 n 以「經驗值」開頭，共 7 筆（1.5 倍 3 種、2 倍 4 種，名稱都含「30分鐘」，等級限制 30／49／50／70 等以下）。
     `node -e "const P=require('./public/data/patches/2.0.0.json');console.log(P.added.items.filter(i=>i.n.startsWith('經驗值')).map(i=>i.n))"`

## 1.15.0（冒險家的戒指、菇菇通行證）

1. `1113372` 冒險家的戒指任務｜56 個任務、30 等起，最後從 3 款戒指挑 1 個（任務 69099 文字：三款中選擇一個）
   - 依據：1.15.0 added.quests 裡 n 含「冒險家的戒指」共 56 筆，minLv 全部是 30。
     `node -e "const P=require('./public/data/patches/1.15.0.json');const q=P.added.quests.filter(x=>x.n.includes('冒險家的戒指'));console.log(q.length,[...new Set(q.map(x=>x.minLv))])"` → 56 [30]
   - 依據：冒險家的戒指-生命／靈魂／調和（1113372～1113374）在 items.json 的 qr 都是 ["69099"]（任務「[冒險家的戒指]冒險家的戒指」的獎勵）。
     `node -e "const it=require('./public/data/items.json');console.log([1113372,1113373,1113374].map(id=>it.find(x=>x.id===id).qr))"`
2. `1302378` 楓之谷薰衣草裝備｜15 把 30 等武器，另有帽子、披風、臉飾
   - 依據：1.15.0 added.items 裡 n 以「楓之谷薰衣草」開頭且 c === 裝備，共 18 筆：s 是帽子、披風、臉飾各 1，其餘 15 筆是武器，items.json 的 eq.reqLevel 都是 30（武器選擇箱是消耗類，不算）。
     `node -e "const P=require('./public/data/patches/1.15.0.json');const it=require('./public/data/items.json');const w=P.added.items.filter(i=>i.n.startsWith('楓之谷薰衣草')&&i.c==='裝備'&&!['帽子','披風','臉飾'].includes(i.s));console.log(w.length,[...new Set(w.map(i=>it.find(x=>x.id===i.id).eq.reqLevel))])"` → 15 [30]
3. `3801913` 菇菇通行證活動｜新的活動任務，還有「菇菇通行證的祝福」第 1、2 階段
   - 依據：1.15.0 added.quests 裡 n 含「菇菇通行證」共 4 筆（其中「菇菇通行證參與確認用」是系統用，所以小字不寫數字）；added.items 有 菇菇通行證（3801913）、菇菇通行證的祝福第1階段（2024329）、第2階段（2024366）。
     `node -e "const P=require('./public/data/patches/1.15.0.json');console.log(P.added.quests.filter(x=>x.n.includes('菇菇通行證')).map(x=>x.n),P.added.items.filter(i=>i.n.includes('菇菇通行證')).map(i=>i.n))"`
4. `2000000` 楓之谷通行證遠端商店｜賣 25 種藥水、食物、卷軸、箭矢、飛鏢
   - 依據：1.15.0 changed 裡 kind === 商店、after 含「楓之谷通行證遠端商店」且 before 沒有，共 25 筆（含紅色藥水、回家卷軸、弓箭手村卷軸、箭矢、弩箭矢等）。
     `node -e "const P=require('./public/data/patches/1.15.0.json');const s=P.changed.filter(c=>c.kind==='商店'&&c.after.includes('楓之谷通行證遠端商店')&&!c.before.includes('楓之谷通行證遠端商店'));console.log(s.length,s.map(c=>c.n))"` → 25

## 沒寫重點檔的版本

- 1.14.7、1.15.1：差異是 0。
- 1.14.6：38 隻怪全是冰原雪域、天空之城的怪（雪吉拉、艾利傑……），301 筆掉落改動有 282 筆只是多了這批怪；8 件新道具跟 9 件消失道具同名，是換編號。看起來是資料先收進來，不是這版遊戲改動，寫成重點會誤導。
- 1.14.5：只有 10 筆改動（6 個橡皮擦說明改字、菇菇五目石多蘑菇王掉、詛咒針少殭屍猴王掉、賽伊蘭的盾牌巴洛古不掉、轉蛋券說明），湊不出 4 條玩家有感的。
- 1.14.2：10 件新道具是 6 個橡皮擦＋4 件時裝換編號（同名舊編號在 gone 裡），其餘是說明改字，沒有 4 條。
- 1.13.6：3 隻肥肥怪、13 筆改動（鋼玉鎧甲多幾隻怪掉、維多利亞港多一筆藥水店價），981 件消失道具多半是資料整理；湊不出 4 條可信的重點。
