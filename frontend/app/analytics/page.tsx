'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'

const STREAK_DAYS = 14
const ACTIVITY: (0 | 1)[][] = [
  [0,1,1,0,1,1,1],[1,1,0,1,1,0,1],[1,0,1,1,1,1,0],[0,1,1,1,0,1,1],
  [1,1,1,0,1,1,1],[1,0,1,1,1,0,1],[1,1,1,1,0,1,1],[0,1,1,1,1,1,1],
  [1,1,0,1,1,1,1],[1,1,1,1,1,0,1],[1,1,1,1,0,1,1],[1,1,1,1,1,1,1],
]
const SCORE_TREND = [61,64,68,65,71,74,72,78,76,80,82,79,83,85]
const METRIC_AVGS = [
  { label: 'Fluency', avg: 82 }, { label: 'Grammar', avg: 88 },
  { label: 'Vocabulary', avg: 74 }, { label: 'Clarity', avg: 79 }, { label: 'Pacing', avg: 76 },
]
const RECENT = [
  { topic: 'Climate Change',          score: 85, date: 'Today',      duration: '1:42' },
  { topic: 'Artificial Intelligence', score: 79, date: 'Yesterday',  duration: '2:05' },
  { topic: 'Remote Work',             score: 82, date: '2 days ago', duration: '1:28' },
  { topic: 'Mental Health',           score: 71, date: '3 days ago', duration: '1:55' },
  { topic: 'Space Tourism',           score: 77, date: '4 days ago', duration: '2:12' },
]

const ey = { fontSize: '0.72rem', letterSpacing: '0.16em', textTransform: 'uppercase' as const, color: 'hsl(var(--muted-foreground))' }
const container = { hidden: {}, show: { transition: { staggerChildren: 0.08, delayChildren: 0.15 } } }
const item = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22,1,0.36,1] } } }

function Sparkline({ values }: { values: number[] }) {
  const W=300, H=64, pad=4
  const min=Math.min(...values), max=Math.max(...values)
  const xStep=(W-pad*2)/(values.length-1)
  const yScale=(v: number)=>H-pad-((v-min)/(max-min))*(H-pad*2)
  const pts=values.map((v,i)=>`${pad+i*xStep},${yScale(v)}`).join(' ')
  const area=`M${pad},${H} `+values.map((v,i)=>`${pad+i*xStep},${yScale(v)}`).join(' L')+` L${W-pad},${H} Z`
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow:'visible', maxWidth:300 }}>
      <path d={area} fill="hsl(var(--foreground) / 0.05)" />
      <motion.polyline points={pts} fill="none" stroke="hsl(var(--foreground))" strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round"
        initial={{ pathLength:0, opacity:0 }} animate={{ pathLength:1, opacity:1 }}
        transition={{ duration:1.4, ease:[0.22,1,0.36,1], delay:0.2 }} />
      <circle cx={pad+(values.length-1)*xStep} cy={yScale(values[values.length-1])} r="3" fill="hsl(var(--foreground))" />
    </svg>
  )
}

export default function AnalyticsPage() {
  return (
    <div style={{ minHeight:'100vh', padding:'0 1.5rem', maxWidth:'40rem', margin:'0 auto', paddingBottom:'6rem' }}>

      <Link href="/"
        style={{ position:'fixed', top:'1.25rem', left:'1.5rem', zIndex:60, ...ey, textDecoration:'none', display:'flex', alignItems:'center', gap:'0.4rem' }}
        onMouseEnter={e=>(e.currentTarget.style.color='hsl(var(--foreground))')}
        onMouseLeave={e=>(e.currentTarget.style.color='hsl(var(--muted-foreground))')}
      >← Home</Link>

      <motion.div style={{ paddingTop:'5rem', marginBottom:'3.5rem' }}
        initial={{ opacity:0, y:16 }} animate={{ opacity:1, y:0 }}
        transition={{ duration:0.6, ease:[0.22,1,0.36,1] }}
      >
        <p style={{ ...ey, marginBottom:'1rem' }}>Analytics</p>
        <h1 style={{ fontFamily:'var(--font-display)', fontSize:'clamp(2rem, 6vw, 3.6rem)', letterSpacing:'-0.02em', lineHeight:1.1 }}>
          Your progress.
        </h1>
      </motion.div>

      <motion.div style={{ display:'flex', flexDirection:'column', gap:'3rem' }} variants={container} initial="hidden" animate="show">

        {/* Stats */}
        <motion.div variants={item} style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', borderTop:'1px solid hsl(var(--border))' }}>
          {[{label:'Day streak',value:`${STREAK_DAYS}🔥`},{label:'Sessions',value:'47'},{label:'Avg. score',value:'81'}].map((s,i)=>(
            <div key={i} style={{ padding:'1.5rem 1.5rem 1.5rem 0', borderBottom:'1px solid hsl(var(--border))', borderRight:i<2?'1px solid hsl(var(--border))':'none' }}>
              <p style={{ fontFamily:'var(--font-display)', fontSize:'clamp(1.8rem, 4vw, 2.5rem)', lineHeight:1, marginBottom:'0.4rem' }}>{s.value}</p>
              <p style={{ ...ey }}>{s.label}</p>
            </div>
          ))}
        </motion.div>

        {/* Activity grid */}
        <motion.section variants={item}>
          <p style={{ ...ey, marginBottom:'1.25rem' }}>Activity — last 12 weeks</p>
          <div style={{ display:'flex', gap:'5px' }}>
            {ACTIVITY.map((week,wi)=>(
              <div key={wi} style={{ display:'flex', flexDirection:'column', gap:'5px' }}>
                {week.map((day,di)=>(
                  <div key={di} style={{ width:11, height:11, borderRadius:3, background:day?'hsl(var(--foreground))':'hsl(var(--border))' }} />
                ))}
              </div>
            ))}
          </div>
          <p style={{ marginTop:'0.75rem', fontSize:'0.85rem', color:'hsl(var(--muted-foreground))' }}>{STREAK_DAYS} day streak · keep going</p>
        </motion.section>

        <div style={{ height:'1px', background:'hsl(var(--border))' }} />

        {/* Score trend */}
        <motion.section variants={item}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:'1.25rem' }}>
            <p style={{ ...ey }}>Score trend</p>
            <p style={{ fontSize:'0.82rem', color:'hsl(var(--muted-foreground))' }}>last 14 sessions</p>
          </div>
          <Sparkline values={SCORE_TREND} />
          <div style={{ display:'flex', justifyContent:'space-between', marginTop:'0.5rem' }}>
            <span style={{ fontSize:'0.82rem', color:'hsl(var(--muted-foreground))' }}>{SCORE_TREND[0]}</span>
            <span style={{ fontSize:'0.82rem', color:'hsl(var(--muted-foreground))' }}>{SCORE_TREND[SCORE_TREND.length-1]}</span>
          </div>
        </motion.section>

        <div style={{ height:'1px', background:'hsl(var(--border))' }} />

        {/* Metric averages */}
        <motion.section variants={item} style={{ display:'flex', flexDirection:'column', gap:'1.25rem' }}>
          <p style={{ ...ey }}>Average scores</p>
          {METRIC_AVGS.map(m=>(
            <div key={m.label} style={{ display:'flex', flexDirection:'column', gap:'0.4rem' }}>
              <div style={{ display:'flex', justifyContent:'space-between' }}>
                <span style={{ ...ey }}>{m.label}</span>
                <span style={{ fontSize:'0.9rem' }}>{m.avg}</span>
              </div>
              <div style={{ height:'1px', width:'100%', position:'relative', background:'hsl(var(--border))' }}>
                <motion.div style={{ position:'absolute', inset:0, right:'auto', background:'hsl(var(--foreground))' }}
                  initial={{ width:0 }} whileInView={{ width:`${m.avg}%` }} viewport={{ once:true }}
                  transition={{ duration:1, ease:[0.22,1,0.36,1] }} />
              </div>
            </div>
          ))}
        </motion.section>

        <div style={{ height:'1px', background:'hsl(var(--border))' }} />

        {/* Recent sessions */}
        <motion.section variants={item}>
          <p style={{ ...ey, marginBottom:'1.25rem' }}>Recent sessions</p>
          {RECENT.map((s,i)=>(
            <div key={i} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'1.1rem 0', borderBottom:i<RECENT.length-1?'1px solid hsl(var(--border))':'none' }}>
              <div>
                <p style={{ fontSize:'1rem', marginBottom:'0.2rem' }}>{s.topic}</p>
                <p style={{ fontSize:'0.82rem', color:'hsl(var(--muted-foreground))' }}>{s.date} · {s.duration}</p>
              </div>
              <span style={{ fontFamily:'var(--font-display)', fontSize:'1.4rem', letterSpacing:'-0.01em' }}>{s.score}</span>
            </div>
          ))}
        </motion.section>

      </motion.div>
    </div>
  )
}
