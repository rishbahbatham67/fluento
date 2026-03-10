'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'

const SUGGESTED_GOALS = [
  'Job interviews',
  'Public speaking',
  'Daily conversation',
  'Business English',
  'Academic writing',
  'IELTS / TOEFL',
  'Storytelling',
  'Debate & argument',
  'Presentations',
  'Small talk',
  'Negotiation',
  'Teaching others',
]

const ey = {
  fontSize: '0.72rem',
  letterSpacing: '0.18em',
  textTransform: 'uppercase' as const,
  color: 'hsl(var(--muted-foreground))',
}

export default function GoalsPage() {
  const router = useRouter()
  const [inputValue, setInputValue]       = useState('')
  const [selectedBubbles, setSelectedBubbles] = useState<string[]>([])

  const toggleBubble = (goal: string) => {
    setSelectedBubbles(prev =>
      prev.includes(goal) ? prev.filter(g => g !== goal) : [...prev, goal]
    )
  }

  // Combine typed input + selected bubbles into one goals string
  const buildGoalsString = (): string => {
    const parts: string[] = []
    if (inputValue.trim()) parts.push(inputValue.trim())
    if (selectedBubbles.length > 0) parts.push(...selectedBubbles)
    return parts.join(', ')
  }

  const canContinue = inputValue.trim().length > 0 || selectedBubbles.length > 0

  const handleContinue = () => {
    if (!canContinue) return
    const goals = buildGoalsString()
    router.push(`/practice/difficulty?goals=${encodeURIComponent(goals)}`)
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
      <Link href="/"
        style={{ position: 'fixed', top: '1.25rem', left: '1.5rem', zIndex: 60, ...ey, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
        onMouseEnter={e => (e.currentTarget.style.color = 'hsl(var(--foreground))')}
        onMouseLeave={e => (e.currentTarget.style.color = 'hsl(var(--muted-foreground))')}
      >← Home</Link>

      {/* Header */}
      <motion.div
        style={{ paddingTop: 'clamp(5rem, 12vw, 8rem)', marginBottom: '3rem' }}
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
      >
        <p style={{ ...ey, marginBottom: '1.25rem' }}>Step 1 of 3</p>
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(2.2rem, 7vw, 4rem)',
            letterSpacing: '-0.02em',
            lineHeight: 1.05,
            marginBottom: '1rem',
          }}
        >
          What's your
          <br />
          <em>speaking goal?</em>
        </h1>
        <p style={{ fontSize: '1rem', lineHeight: 1.7, color: 'hsl(var(--muted-foreground))' }}>
          We'll generate topics tailored to exactly what you're working towards.
        </p>
      </motion.div>

      {/* Text input */}
      <motion.div
        style={{ marginBottom: '2.5rem' }}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      >
        <textarea
          value={inputValue}
          onChange={e => setInputValue(e.target.value)}
          placeholder="e.g. I want to prepare for software engineering interviews at big tech companies…"
          rows={3}
          style={{
            width: '100%',
            padding: '1rem 1.25rem',
            fontSize: '0.95rem',
            lineHeight: 1.7,
            background: 'hsl(var(--card))',
            color: 'hsl(var(--foreground))',
            border: '1px solid hsl(var(--border))',
            borderRadius: 0,
            outline: 'none',
            resize: 'vertical',
            fontFamily: 'var(--font-mono)',
            transition: 'border-color 0.2s',
          }}
          onFocus={e => (e.currentTarget.style.borderColor = 'hsl(var(--foreground))')}
          onBlur={e => (e.currentTarget.style.borderColor = 'hsl(var(--border))')}
        />
        <p style={{ ...ey, marginTop: '0.5rem' }}>
          Or choose from suggestions below — you can select multiple
        </p>
      </motion.div>

      {/* Bubble suggestions */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.25, duration: 0.5 }}
        style={{ marginBottom: '3rem' }}
      >
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.6rem',
          }}
        >
          {SUGGESTED_GOALS.map((goal, i) => {
            const isSelected = selectedBubbles.includes(goal)
            return (
              <motion.button
                key={goal}
                onClick={() => toggleBubble(goal)}
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.3 + i * 0.03, duration: 0.3 }}
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.96 }}
                style={{
                  padding: '0.5rem 1.1rem',
                  borderRadius: '999px',
                  border: `1px solid ${isSelected ? 'hsl(var(--foreground))' : 'hsl(var(--border))'}`,
                  background: isSelected ? 'hsl(var(--foreground))' : 'transparent',
                  color: isSelected ? 'hsl(var(--background))' : 'hsl(var(--foreground))',
                  fontSize: '0.85rem',
                  letterSpacing: '0.02em',
                  cursor: 'pointer',
                  transition: 'all 0.18s ease',
                }}
              >
                {goal}
              </motion.button>
            )
          })}
        </div>
      </motion.div>

      {/* Selected summary */}
      <AnimatePresence>
        {selectedBubbles.length > 0 && (
          <motion.p
            style={{ ...ey, marginBottom: '1.5rem' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          >
            {selectedBubbles.length} goal{selectedBubbles.length > 1 ? 's' : ''} selected
          </motion.p>
        )}
      </AnimatePresence>

      {/* Continue button */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: canContinue ? 1 : 0.35, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <motion.button
          onClick={handleContinue}
          disabled={!canContinue}
          whileHover={canContinue ? { scale: 1.02 } : {}}
          whileTap={canContinue ? { scale: 0.96 } : {}}
          style={{
            width: '100%',
            padding: '1rem 0',
            background: 'hsl(var(--foreground))',
            color: 'hsl(var(--background))',
            border: 'none',
            fontSize: '0.85rem',
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            cursor: canContinue ? 'pointer' : 'not-allowed',
          }}
        >
          Continue →
        </motion.button>
      </motion.div>

    </div>
  )
}
