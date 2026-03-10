'use client'

import { useSearchParams, useRouter } from 'next/navigation'
import { useState, Suspense } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'

const LEVELS = [
  {
    value:   'beginner',
    label:   'Beginner',
    desc:    'Simple vocabulary, short sentences, familiar everyday topics.',
    detail:  'Good for: Basic conversation, building confidence, A1–A2 learners.',
  },
  {
    value:   'intermediate',
    label:   'Intermediate',
    desc:    'Mixed vocabulary, structured arguments, current events.',
    detail:  'Good for: IELTS 5.5–6.5, B1–B2 learners, improving fluency.',
  },
  {
    value:   'advanced',
    label:   'Advanced',
    desc:    'Complex vocabulary, nuanced arguments, specialist topics.',
    detail:  'Good for: IELTS 7+, C1–C2 learners, professional communication.',
  },
]

const ey = {
  fontSize: '0.72rem',
  letterSpacing: '0.18em',
  textTransform: 'uppercase' as const,
  color: 'hsl(var(--muted-foreground))',
}

// Maps 0–100 slider value to level index
function sliderToLevel(val: number): number {
  if (val < 34) return 0
  if (val < 67) return 1
  return 2
}

function DifficultyInner() {
  const router      = useRouter()
  const params      = useSearchParams()
  const goals       = params.get('goals') ?? ''

  const [sliderVal, setSliderVal] = useState(50)
  const levelIndex  = sliderToLevel(sliderVal)
  const activeLevel = LEVELS[levelIndex]

  const handleContinue = () => {
    router.push(
      `/practice/topics?goals=${encodeURIComponent(goals)}&difficulty=${activeLevel.value}`
    )
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        padding: '0 1.5rem 6rem',
        maxWidth: '38rem',
        margin: '0 auto',
      }}
    >
      {/* Back */}
      <Link href="/practice/goals"
        style={{ position: 'fixed', top: '1.25rem', left: '1.5rem', zIndex: 60, ...ey, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
        onMouseEnter={e => (e.currentTarget.style.color = 'hsl(var(--foreground))')}
        onMouseLeave={e => (e.currentTarget.style.color = 'hsl(var(--muted-foreground))')}
      >← Goals</Link>

      {/* Header */}
      <motion.div
        style={{ paddingTop: 'clamp(5rem, 12vw, 8rem)', marginBottom: '4rem' }}
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
      >
        <p style={{ ...ey, marginBottom: '1.25rem' }}>Step 2 of 3</p>
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(2.2rem, 7vw, 4rem)',
            letterSpacing: '-0.02em',
            lineHeight: 1.05,
            marginBottom: '1rem',
          }}
        >
          How challenging
          <br />
          <em>should it be?</em>
        </h1>
        <p style={{ fontSize: '1rem', lineHeight: 1.7, color: 'hsl(var(--muted-foreground))' }}>
          We'll adjust vocabulary, topic complexity, and expected depth accordingly.
        </p>
      </motion.div>

      {/* Slider controller */}
      <motion.div
        style={{ marginBottom: '3.5rem' }}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.5 }}
      >
        {/* Labels row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
          <span style={{ ...ey }}>Easy</span>
          <span style={{ ...ey }}>Difficult</span>
        </div>

        {/* Slider track + thumb */}
        <div style={{ position: 'relative', marginBottom: '2.5rem' }}>
          {/* Custom track */}
          <div
            style={{
              position: 'relative',
              height: '2px',
              background: 'hsl(var(--border))',
              borderRadius: '999px',
            }}
          >
            {/* Filled portion */}
            <motion.div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                height: '100%',
                background: 'hsl(var(--foreground))',
                borderRadius: '999px',
              }}
              animate={{ width: `${sliderVal}%` }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            />
          </div>

          {/* Native input (invisible but functional) */}
          <input
            type="range"
            min={0}
            max={100}
            value={sliderVal}
            onChange={e => setSliderVal(Number(e.target.value))}
            style={{
              position: 'absolute',
              top: '-10px',
              left: 0,
              width: '100%',
              height: '22px',
              opacity: 0,
              cursor: 'pointer',
              margin: 0,
            }}
          />

          {/* Visual thumb */}
          <motion.div
            style={{
              position: 'absolute',
              top: '-8px',
              width: '18px',
              height: '18px',
              borderRadius: '50%',
              background: 'hsl(var(--foreground))',
              border: '3px solid hsl(var(--background))',
              boxShadow: '0 0 0 1px hsl(var(--foreground))',
              pointerEvents: 'none',
            }}
            animate={{ left: `calc(${sliderVal}% - 9px)` }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          />
        </div>

        {/* Level markers */}
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          {LEVELS.map((level, i) => (
            <button
              key={level.value}
              onClick={() => setSliderVal(i === 0 ? 16 : i === 1 ? 50 : 84)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
                ...ey,
                color: levelIndex === i ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))',
                transition: 'color 0.2s',
              }}
            >
              {level.label}
            </button>
          ))}
        </div>
      </motion.div>

      {/* Active level card */}
      <motion.div
        key={activeLevel.value}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        style={{
          padding: '1.75rem 2rem',
          border: '1px solid hsl(var(--foreground))',
          marginBottom: '3rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem', marginBottom: '0.75rem' }}>
          <h2
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '1.8rem',
              letterSpacing: '-0.02em',
            }}
          >
            {activeLevel.label}
          </h2>
        </div>
        <p style={{ fontSize: '0.95rem', lineHeight: 1.65, marginBottom: '0.75rem' }}>
          {activeLevel.desc}
        </p>
        <p style={{ fontSize: '0.82rem', color: 'hsl(var(--muted-foreground))', lineHeight: 1.6 }}>
          {activeLevel.detail}
        </p>
      </motion.div>

      {/* Goals summary */}
      {goals && (
        <p style={{ ...ey, marginBottom: '1.5rem' }}>
          Goal: <span style={{ color: 'hsl(var(--foreground))' }}>{goals.length > 60 ? goals.slice(0, 60) + '…' : goals}</span>
        </p>
      )}

      {/* Continue */}
      <motion.button
        onClick={handleContinue}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.96 }}
        style={{
          width: '100%',
          padding: '1rem 0',
          background: 'hsl(var(--foreground))',
          color: 'hsl(var(--background))',
          border: 'none',
          fontSize: '0.85rem',
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
          cursor: 'pointer',
        }}
      >
        Generate my topics →
      </motion.button>

    </div>
  )
}

export default function DifficultyPage() {
  return <Suspense><DifficultyInner /></Suspense>
}
