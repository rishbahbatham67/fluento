'use client'

import { motion } from 'framer-motion'

export interface FeedbackMetric { label: string; score: number }
export interface FeedbackData {
  transcript: string; overallScore: number; metrics: FeedbackMetric[]
  strengths: string[]; corrections: { original: string; suggestion: string; reason: string }[]; rewrite?: string
}

const ey = { fontSize:'0.72rem', letterSpacing:'0.16em', textTransform:'uppercase' as const, color:'hsl(var(--muted-foreground))' }
const hr  = { height:'1px', width:'100%', background:'hsl(var(--border))' }

function MetricBar({ label, score }: FeedbackMetric) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'0.4rem' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline' }}>
        <span style={{ ...ey }}>{label}</span>
        <span style={{ fontSize:'0.9rem' }}>{score}</span>
      </div>
      <div style={{ height:'1px', width:'100%', position:'relative', background:'hsl(var(--border))' }}>
        <motion.div style={{ position:'absolute', inset:0, right:'auto', background:'hsl(var(--foreground))' }}
          initial={{ width:'0%' }} animate={{ width:`${score}%` }}
          transition={{ duration:0.9, ease:[0.22,1,0.36,1], delay:0.1 }} />
      </div>
    </div>
  )
}

function ScoreRing({ score }: { score: number }) {
  const R=36, CIRC=2*Math.PI*R, dash=(score/100)*CIRC
  return (
    <div style={{ position:'relative', width:96, height:96, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
      <svg width="96" height="96" viewBox="0 0 96 96" style={{ position:'absolute', inset:0, transform:'rotate(-90deg)' }}>
        <circle cx="48" cy="48" r={R} fill="none" stroke="hsl(var(--border))" strokeWidth="2" />
        <motion.circle cx="48" cy="48" r={R} fill="none" stroke="hsl(var(--foreground))" strokeWidth="2"
          strokeLinecap="round" strokeDasharray={`${CIRC}`}
          initial={{ strokeDashoffset:CIRC }} animate={{ strokeDashoffset:CIRC-dash }}
          transition={{ duration:1.2, ease:[0.22,1,0.36,1] }} />
      </svg>
      <div style={{ position:'relative', textAlign:'center' }}>
        <motion.span style={{ fontFamily:'var(--font-display)', fontSize:'1.7rem', lineHeight:1, display:'block' }}
          initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:0.4 }}>
          {score}
        </motion.span>
        <span style={{ ...ey, display:'block', marginTop:'0.2rem' }}>/ 100</span>
      </div>
    </div>
  )
}

export function FeedbackCard({ feedback }: { feedback: FeedbackData }) {
  const cv = { hidden:{}, show:{ transition:{ staggerChildren:0.07, delayChildren:0.1 } } }
  const iv = { hidden:{ opacity:0, y:14 }, show:{ opacity:1, y:0, transition:{ duration:0.45, ease:[0.22,1,0.36,1] } } }
  return (
    <motion.div style={{ width:'100%', display:'flex', flexDirection:'column', gap:'2.5rem' }} variants={cv} initial="hidden" animate="show">

      <motion.section variants={iv}>
        <p style={{ ...ey, marginBottom:'0.75rem' }}>Your transcript</p>
        <blockquote style={{ fontSize:'0.95rem', lineHeight:1.7, fontStyle:'italic', borderLeft:'2px solid hsl(var(--border))', paddingLeft:'1rem', color:'hsl(var(--foreground) / 0.75)', margin:0 }}>
          "{feedback.transcript}"
        </blockquote>
      </motion.section>

      <div style={hr} />

      <motion.section variants={iv} style={{ display:'flex', alignItems:'center', gap:'2rem' }}>
        <ScoreRing score={feedback.overallScore} />
        <div>
          <p style={{ ...ey, marginBottom:'0.25rem' }}>Overall</p>
          <p style={{ fontFamily:'var(--font-display)', fontSize:'1.7rem', lineHeight:1.2, letterSpacing:'-0.01em', marginBottom:'0.4rem' }}>
            {feedback.overallScore>=85?'Excellent':feedback.overallScore>=70?'Good':feedback.overallScore>=50?'Fair':'Needs work'}
          </p>
          <p style={{ fontSize:'0.9rem', color:'hsl(var(--muted-foreground))' }}>
            {feedback.overallScore>=70?'Your speaking is clear and well-structured.':'Focus on pacing and sentence structure.'}
          </p>
        </div>
      </motion.section>

      <motion.section variants={iv} style={{ display:'flex', flexDirection:'column', gap:'1.25rem' }}>
        <p style={{ ...ey }}>Breakdown</p>
        {feedback.metrics.map(m=><MetricBar key={m.label} {...m} />)}
      </motion.section>

      <div style={hr} />

      {feedback.strengths.length>0 && (
        <motion.section variants={iv}>
          <p style={{ ...ey, marginBottom:'1rem' }}>Strengths</p>
          <ul style={{ listStyle:'none', padding:0, margin:0, display:'flex', flexDirection:'column', gap:'0.65rem' }}>
            {feedback.strengths.map((s,i)=>(
              <li key={i} style={{ display:'flex', alignItems:'flex-start', gap:'0.75rem', fontSize:'0.95rem', lineHeight:1.6 }}>
                <span style={{ color:'hsl(var(--muted-foreground))', marginTop:'0.2rem', fontSize:'0.75rem' }}>✓</span>{s}
              </li>
            ))}
          </ul>
        </motion.section>
      )}

      {feedback.corrections.length>0 && (
        <motion.section variants={iv}>
          <p style={{ ...ey, marginBottom:'1rem' }}>Corrections</p>
          <div style={{ display:'flex', flexDirection:'column', gap:'0.75rem' }}>
            {feedback.corrections.map((c,i)=>(
              <div key={i} style={{ padding:'1rem 1.25rem', background:'hsl(var(--card))', border:'0.5px solid hsl(var(--border))', borderRadius:4, display:'flex', flexDirection:'column', gap:'0.5rem' }}>
                <p style={{ fontSize:'0.9rem', textDecoration:'line-through', color:'hsl(var(--muted-foreground))' }}>{c.original}</p>
                <p style={{ fontSize:'0.9rem' }}>{c.suggestion}</p>
                <p style={{ fontSize:'0.8rem', color:'hsl(var(--muted-foreground))', letterSpacing:'0.02em' }}>{c.reason}</p>
              </div>
            ))}
          </div>
        </motion.section>
      )}

      {feedback.rewrite && (
        <motion.section variants={iv}>
          <p style={{ ...ey, marginBottom:'0.75rem' }}>Suggested rewrite</p>
          <blockquote style={{ fontSize:'0.95rem', lineHeight:1.7, fontStyle:'italic', borderLeft:'2px solid hsl(var(--foreground) / 0.4)', paddingLeft:'1rem', margin:0 }}>
            "{feedback.rewrite}"
          </blockquote>
        </motion.section>
      )}
    </motion.div>
  )
}
