// 簡單規則：一把一把來，每把最多賭 k 張 15%（中了剩下全 70%），剩 R 單位以下不賭直接 7 張 70%
// 另一種 H：中了 15% 之後「再賭 15% 直到沒中」才轉 70%
const C=[0,1,2,3,4,5,6,7].map(n=>{const f=[1];for(let i=1;i<=n;i++)f[i]=f[i-1]*i;return f;});
const bin=(n,k)=>{let r=1;for(let i=0;i<k;i++)r=r*(n-i)/(i+1);return r;};
// 回傳最後攻擊的分佈 Map
function weapon70(s,a){const d=new Map();for(let k=0;k<=s;k++)d.set(a+2*k,(d.get(a+2*k)||0)+bin(s,k)*0.7**k*0.3**(s-k));return d;}
function run(b,k,R,greedy15){ // b 單位，回傳期望 max（只有一把有效時就是那把）
  if(b<2) return 0;
  if(b<=R || b<9) { // 不夠走一輪就全 70
    const s=Math.min(7,b-2); let ev=0; for(const [a,p] of weapon70(s,0)) ev+=a*p; return ev; }
  // 換武器，賭 15%
  let ev=0, reach=1, left=b-2, used=0;
  for(let t=1;t<=k&&left>=1;t++){
    // 第 t 張 15% 中
    const sl=7-t; const hp=reach*0.15;
    let after;
    if(greedy15){ // 中了繼續 15% 直到沒中，再 70%
      after=0; let r2=1, atk=5, s=sl; while(true){ if(s===0){after+=r2*atk;break;} // 再衝 15
        // 下一張 15%：中→ atk+5 繼續；沒中→剩 s-1 全 70
        let e70=0; for(const [a,p] of weapon70(s-1,atk)) e70+=a*p; after+=r2*0.85*e70; r2*=0.15; atk+=5; s-=1; }
    } else { after=0; for(const [a,p] of weapon70(sl,5)) after+=a*p; }
    ev+=hp*after; reach*=0.85; left-=1;
  }
  // 全沒中：換新武器重來（舊的放著是 0）
  return ev+reach*run(left,k,R,greedy15);
}
for(const g of [false,true]) for(const k of [1,2,3,4]) for(const R of [9]) console.log(g?"中了續賭15":"中了轉70", "k="+k, run(21,k,R,g).toFixed(3));
