import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { hColor, scoreInt } from "../format";

export function Ring({ score, size=48 }: {score:number;size?:number}) {
  const sw=4.5, r=(size-sw)/2, circ=2*Math.PI*r, fill=(score/100)*circ;
  const cx=size/2, cy=size/2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--muted)" strokeWidth={sw}/>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={hColor(score)} strokeWidth={sw}
        strokeDasharray={`${fill} ${circ-fill}`} strokeLinecap="round" transform={`rotate(-90 ${cx} ${cy})`}/>
      <text x={cx} y={cy+4} textAnchor="middle"
        style={{fontFamily:"var(--font-mono)", fontSize:size*0.27, fontWeight:600, fill:hColor(score)}}>
        {scoreInt(score)}
      </text>
    </svg>
  );
}

export function Spark({ data, color, w=80, h=32 }: {data:{v:number}[];color:string;w?:number;h?:number}) {
  if (data.length < 2) return null;
  const vals=data.map(d=>d.v), mx=Math.max(...vals), mn=Math.min(...vals), rng=mx-mn||1, p=2;
  const pts=vals.map((v,i)=>[p+(i/(vals.length-1))*(w-p*2), p+(1-(v-mn)/rng)*(h-p*2)]);
  const path=pts.map((pt,i)=>`${i===0?"M":"L"}${pt[0].toFixed(1)},${pt[1].toFixed(1)}`).join(" ");
  return <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} style={{overflow:"visible"}}><path d={path} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}

export function TrendIcon({ t, sz=15 }: {t:number;sz?:number}) {
  if (t > 0) return <TrendingUp size={sz} className="text-emerald-500"/>;
  if (t < 0) return <TrendingDown size={sz} className="text-red-500"/>;
  return <Minus size={sz} className="text-muted-foreground"/>;
}
