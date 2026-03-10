'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { useUser } from '@/lib/userContext'

const SUGGESTED_GOALS = [
  'Job interviews',     'Public speaking',   'Daily conversation',
  'Business English',   'Academic English',  'IELTS / TOEFL',
  'Storytelling',       'Debate & argument', 'Presentations',
  'Small talk',         'Negotiation',       'Teaching others',
]

const LEVELS = [
  { value: 'beginner',     label: 'Beginner',     desc: 'Simple vocabulary · A1–A2 · Build confidence'       },
  { value: 'intermediate', label: 'Intermediate', desc: 'Mixed topics · B1–B2 · Improve fluency'              },
  { value: 'advanced',     label: 'Advanced',     desc: 'Complex arguments · C1–C2 · Professional level'      },
]

const ey = {
  fontSize: '0.72rem',
  letterSpacing: '0.18em',
  textTransform: 'uppercase' as const,
  color: 'hsl(var(--muted-foreground))',
}

export default function OnboardingPage() {
  const router         = useRouter()
  const { setProfile } = useUser()

  const [step, setStep]                   = useState<'goals' | 'difficulty'>('goals')
  const [inputValue, setInputValue]       = useState('')
  const [selectedBubbles, setSelectedBubbles] = useState<string[]>([])
  const [difficulty, setDifficulty]       = useState('intermediate')
  const [sliderVal, setSliderVal]         = useState(50)

  const toggleBubble = (goal: string) => {
    setSelectedBubbles(prev =>
      prev.includes(goal) ? prev.filter(g => g !== goal) : [...prev, goal]
    )
  }

  const buildGoals = () => {
    const parts: string[] = []
    if (inputValue.trim()) parts.push(inputValue.trim())
    parts.push(...selectedBubbles)
    return parts.join(', ')
  }

  const canContinue = inputValue.trim().length > 0 || selectedBubbles.length > 0

  const handleGoalsContinue = () => {
    if (!canContinue) return
    setStep('difficulty')
  }

  const handleDifficultyChange = (val: number) => {
    setSliderVal(val)
    if (val < 34)      setDifficulty('beginner')
    else if (val < 67) setDifficulty('intermediate')
    else               setDifficulty('advanced')
  }

  const handleFinish = () => {
    setProfile({
      goals:      buildGoals(),
      difficulty,
      setupDone:  true,
    })
    router.push('/')
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', padding: '0 1.5rem 6rem', maxWidth: '38rem', margin: '0 auto' }}>

      <AnimatePresence mode="wait">

        {/* ── Step 1: Goals ── */}
        {step === 'goals' && (
          <motion.div key="goals"
            initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          >
            <div style={{ paddingTop: 'clamp(5rem, 12vw, 8rem)', marginBottom: '3rem' }}>
              <p style={{ ...ey, marginBottom: '1.25rem' }}>Welcome to Fluento · Step 1 of 2</p>
              <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(2.2rem, 7vw, 4rem)', letterSpacing: '-0.02em', lineHeight: 1.05, marginBottom: '1rem' }}>
                What's your<br /><em>speaking goal?</em>
              </h1>
              <p style={{ fontSize: '1rem', lineHeight: 1.7, color: 'hsl(var(--muted-foreground))' }}>
                Every topic, word, and exercise will be tailored to what you're working towards.
              </p>
            </div>

            {/* Text input */}
            <div style={{ marginBottom: '2rem' }}>
              <textarea
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                placeholder="e.g. I want to prepare for software engineering interviews at big tech companies…"
                rows={3}
                style={{ width: '100%', padding: '1rem 1.25rem', fontSize: '0.95rem', lineHeight: 1.7, background: 'hsl(var(--card))', color: 'hsl(var(--foreground))', border: '1px solid hsl(var(--border))', borderRadius: 0, outline: 'none', resize: 'vertical', fontFamily: 'var(--font-mono)', transition: 'border-color 0.2s', boxSizing: 'border-box' }}
                onFocus={e => (e.currentTarget.style.borderColor = 'hsl(var(--foreground))')}
                onBlur={e => (e.currentTarget.style.borderColor = 'hsl(var(--border))')}
              />
              <p style={{ ...ey, marginTop: '0.5rem' }}>
                Or pick from below — select as many as you like
              </p>
            </div>

            {/* Bubbles */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', marginBottom: '3rem' }}>
              {SUGGESTED_GOALS.map((goal, i) => {
                const isSelected = selectedBubbles.includes(goal)
                return (
                  <motion.button key={goal}
                    onClick={() => toggleBubble(goal)}
                    initial={{ opacity: 0, scale: 0.92 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.1 + i * 0.03 }}
                    whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
                    style={{ padding: '0.5rem 1.1rem', borderRadius: '999px', border: `1px solid ${isSelected ? 'hsl(var(--foreground))' : 'hsl(var(--border))'}`, background: isSelected ? 'hsl(var(--foreground))' : 'transparent', color: isSelected ? 'hsl(var(--background))' : 'hsl(var(--foreground))', fontSize: '0.85rem', cursor: 'pointer', transition: 'all 0.18s ease' }}
                  >
                    {goal}
                  </motion.button>
                )
              })}
            </div>

            <AnimatePresence>
              {selectedBubbles.length > 0 && (
                <motion.p style={{ ...ey, marginBottom: '1.5rem' }}
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                >
                  {selectedBubbles.length} goal{selectedBubbles.length > 1 ? 's' : ''} selected
                </motion.p>
              )}
            </AnimatePresence>

            <motion.button
              onClick={handleGoalsContinue}
              disabled={!canContinue}
              animate={{ opacity: canContinue ? 1 : 0.35 }}
              whileHover={canContinue ? { scale: 1.02 } : {}}
              whileTap={canContinue ? { scale: 0.96 } : {}}
              style={{ width: '100%', padding: '1rem 0', background: 'hsl(var(--foreground))', color: 'hsl(var(--background))', border: 'none', fontSize: '0.85rem', letterSpacing: '0.16em', textTransform: 'uppercase', cursor: canContinue ? 'pointer' : 'not-allowed' }}
            >
              Continue →
            </motion.button>
          </motion.div>
        )}

        {/* ── Step 2: Difficulty ── */}
        {step === 'difficulty' && (
          <motion.div key="difficulty"
            initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          >
            <div style={{ paddingTop: 'clamp(5rem, 12vw, 8rem)', marginBottom: '4rem' }}>
              <p style={{ ...ey, marginBottom: '1.25rem' }}>Step 2 of 2</p>
              <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(2.2rem, 7vw, 4rem)', letterSpacing: '-0.02em', lineHeight: 1.05, marginBottom: '1rem' }}>
                How challenging<br /><em>should it be?</em>
              </h1>
              <p style={{ fontSize: '1rem', lineHeight: 1.7, color: 'hsl(var(--muted-foreground))' }}>
                We'll adjust vocabulary complexity and topic depth accordingly.
              </p>
            </div>

            {/* Slider */}
            <div style={{ marginBottom: '3.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
                <span style={{ ...ey }}>Easy</span>
                <span style={{ ...ey }}>Difficult</span>
              </div>

              <div style={{ position: 'relative', marginBottom: '2.5rem' }}>
                <div style={{ position: 'relative', height: '2px', background: 'hsl(var(--border))', borderRadius: '999px' }}>
                  <motion.div
                    style={{ position: 'absolute', top: 0, left: 0, height: '100%', background: 'hsl(var(--foreground))', borderRadius: '999px' }}
                    animate={{ width: `${sliderVal}%` }}
                    transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                  />
                </div>
                <input type="range" min={0} max={100} value={sliderVal}
                  onChange={e => handleDifficultyChange(Number(e.target.value))}
                  style={{ position: 'absolute', top: '-10px', left: 0, width: '100%', height: '22px', opacity: 0, cursor: 'pointer', margin: 0 }}
                />
                <motion.div
                  style={{ position: 'absolute', top: '-8px', width: '18px', height: '18px', borderRadius: '50%', background: 'hsl(var(--foreground))', border: '3px solid hsl(var(--background))', boxShadow: '0 0 0 1px hsl(var(--foreground))', pointerEvents: 'none' }}
                  animate={{ left: `calc(${sliderVal}% - 9px)` }}
                  transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                {LEVELS.map((level, i) => (
                  <button key={level.value}
                    onClick={() => handleDifficultyChange(i === 0 ? 16 : i === 1 ? 50 : 84)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, ...ey, color: difficulty === level.value ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))', transition: 'color 0.2s' }}
                  >
                    {level.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Active level card */}
            {LEVELS.filter(l => l.value === difficulty).map(level => (
              <motion.div key={level.value}
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                style={{ padding: '1.75rem 2rem', border: '1px solid hsl(var(--foreground))', marginBottom: '3rem' }}
              >
                <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.8rem', letterSpacing: '-0.02em', marginBottom: '0.75rem' }}>
                  {level.label}
                </h2>
                <p style={{ fontSize: '0.92rem', color: 'hsl(var(--muted-foreground))', lineHeight: 1.6 }}>
                  {level.desc}
                </p>
              </motion.div>
            ))}

            {/* Goals summary */}
            <p style={{ ...ey, marginBottom: '1.5rem' }}>
              Goal: <span style={{ color: 'hsl(var(--foreground))' }}>
                {buildGoals().length > 60 ? buildGoals().slice(0, 60) + '…' : buildGoals()}
              </span>
            </p>

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button onClick={() => setStep('goals')}
                style={{ flex: 1, padding: '1rem 0', background: 'transparent', color: 'hsl(var(--foreground))', border: '1px solid hsl(var(--border))', fontSize: '0.82rem', letterSpacing: '0.14em', textTransform: 'uppercase', cursor: 'pointer' }}
              >
                ← Back
              </button>
              <motion.button onClick={handleFinish}
                whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.96 }}
                style={{ flex: 2, padding: '1rem 0', background: 'hsl(var(--foreground))', color: 'hsl(var(--background))', border: 'none', fontSize: '0.85rem', letterSpacing: '0.16em', textTransform: 'uppercase', cursor: 'pointer' }}
              >
                Start practising →
              </motion.button>
            </div>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  )
}
