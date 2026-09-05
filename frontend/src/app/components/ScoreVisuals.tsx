import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { hColor, scoreInt } from "../format";

/**
 * A score in a progress ring. The arc carries the health colour (a graphic, so 3:1
 * is the bar it has to clear); the number itself stays --foreground, because the
 * health colours only reach ~3.2-3.8:1 and this text runs as small as 12px.
 */
export function Ring({ score, size=48, label }: {score:number;size?:number;label?:string}) {
  const sw=4.5, r=(size-sw)/2, circ=2*Math.PI*r;
  const pct=Math.min(100, Math.max(0, score));
  const fill=(pct/100)*circ;
  const cx=size/2, cy=size/2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}
      role="img" aria-label={label ? `${label}: ${scoreInt(score)} out of 100` : `${scoreInt(score)} out of 100`}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--muted)" strokeWidth={sw}/>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={hColor(score)} strokeWidth={sw}
        strokeDasharray={`${fill} ${circ-fill}`} strokeLinecap="round" transform={`rotate(-90 ${cx} ${cy})`}/>
      <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central"
        style={{fontFamily:"var(--font-mono)", fontSize:size*0.3, fontWeight:600, fill:"var(--foreground)"}}>
        {scoreInt(score)}
      </text>
    </svg>
  );
}

/**
 * A sparkline that fills its container. The viewBox keeps the path maths in a fixed
 * coordinate space while the rendered width tracks the parent, so the line ends flush
 * with whatever sits beneath it instead of stopping short at a hardcoded width.
 */
export function Spark({ data, color, h=32 }: {data:{v:number}[];color:string;h?:number}) {
  if (data.length < 2) return null;
  const w = 240;
  const vals=data.map(d=>d.v), mx=Math.max(...vals), mn=Math.min(...vals), rng=mx-mn||1, p=2;
  const pts=vals.map((v,i)=>[p+(i/(vals.length-1))*(w-p*2), p+(1-(v-mn)/rng)*(h-p*2)]);
  const path=pts.map((pt,i)=>`${i===0?"M":"L"}${pt[0].toFixed(1)},${pt[1].toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none" aria-hidden="true" style={{display:"block"}}>
      {/* Stretching the viewBox would thin the stroke; this keeps it at 1.5px. */}
      <path d={path} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke"/>
    </svg>
  );
}

export function TrendIcon({ t, sz=15 }: {t:number;sz?:number}) {
  if (t > 0) return <TrendingUp size={sz} className="text-health-good" aria-hidden="true"/>;
  if (t < 0) return <TrendingDown size={sz} className="text-destructive" aria-hidden="true"/>;
  return <Minus size={sz} className="text-muted-foreground" aria-hidden="true"/>;
}
