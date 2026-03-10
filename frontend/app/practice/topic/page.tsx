'use client'

import { useState, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { SpinnerSelector, SpinnerItem } from '@/components/spinner/SpinnerSelector'
import { generateHints, StructureHintsResponse } from '@/lib/api'
import { useUser } from '@/lib/userContext'

const TOPICS: SpinnerItem[] = [
  { label: 'Climate Change',          value: 'climate-change',    meta: 'Environment & Science' },
  { label: 'Artificial Intelligence', value: 'ai',                meta: 'Technology'            },
  { label: 'Remote Work',             value: 'remote-work',       meta: 'Professional Life'     },
  { label: 'Mental Health',           value: 'mental-health',     meta: 'Personal Wellbeing'    },
  { label: 'Urban Planning',          value: 'urban-planning',    meta: 'Society & Cities'      },
  { label: 'Deep Sea',                value: 'deep-sea',          meta: 'Ocean Exploration'     },
  { label: 'Space Tourism',           value: 'space-tourism',     meta: 'Future of Travel'      },
  { label: 'Food Security',           value: 'food-security',     meta: 'Global Issues'         },
  { label: 'Quantum Computing',       value: 'quantum-computing', meta: 'Technology'            },
  { label: 'Sleep Science',           value: 'sleep-science',     meta: 'Health & Biology'      },
  { label: 'Social Media',            value: 'social-media',      meta: 'Digital Culture'       },
  { label: 'Biodiversity',            value: 'biodiversity',      meta: 'Nature & Ecology'      },
]

const TIMER_OPTIONS = [
  { label: '30 sec', value: 30  },
  { label: '1 min',  value: 60  },
  { label: '2 min',  value: 120 },
  { label: '5 min',  value: 300 },
]

const ey = {
  fontSize: '0.72rem',
  letterSpacing: '0.18em',
  textTransform: 'uppercase' as const,
  color: 'hsl(var(--muted-foreground))',
}

export default function TopicPracticePage() {
  const router         = useRouter()
  const { profile }    = useUser()
  const [selected, setSelected]   = useState<SpinnerItem | null>(null)
  const [showPrep, setShowPrep]   = useState(false)
  const [timerOn, setTimerOn]     = useState(false)
  const [timerSecs, setTimerSecs] = useState(60)

  // AI hints state
  const [hints, setHints]           = useState<StructureHintsResponse | null>(null)
  const [hintsLoading, setHintsLoading] = useState(false)
  const [hintsError, setHintsError]     = useState<string | null>(null)
  const hintsFetchedFor = useRef<string | null>(null)

  const handleTogglePrep = async () => {
    if (!selected) return
    const nextOpen = !showPrep
    setShowPrep(nextOpen)

    // Fetch hints when opening — only fetch once per topic selection
    if (nextOpen && hintsFetchedFor.current !== selected.value) {
      setHintsLoading(true)
      setHintsError(null)
      setHints(null)
      try {
        const result = await generateHints(
          selected.label,
          profile.goals || 'general English communication',
          profile.difficulty || 'intermediate',
        )
        setHints(result)
        hintsFetchedFor.current = selected.value
      } catch (e: unknown) {
        setHintsError(e instanceof Error ? e.message : 'Failed to load hints')
      } finally {
        setHintsLoading(false)
      }
    }
  }

  const handleSelectTopic = (item: SpinnerItem) => {
    setSelected(item)
    setShowPrep(false)
    setHints(null)
    hintsFetchedFor.current = null
  }

  const handleStart = () => {
    if (!selected) return
    const params = new URLSearchParams({
      topic:    selected.label,
      category: selected.meta ?? '',
      type:     'topic',
    })
    if (timerOn && timerSecs > 0) params.set('limit', String(timerSecs))
    router.push(`/practice/session?${params.toString()}`)
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0 1.5rem 6rem' }}>

      <Link href="/"
        style={{ position: 'fixed', top: '1.25rem', left: '1.5rem', zIndex: 60, ...ey, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
        onMouseEnter={e => (e.currentTarget.style.color = 'hsl(var(--foreground))')}
        onMouseLeave={e => (e.currentTarget.style.color = 'hsl(var(--muted-foreground))')}
      >← Home</Link>

      <motion.div style={{ textAlign: 'center', marginTop: 'clamp(5rem, 10vw, 7rem)', marginBottom: '3.5rem' }}
        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      >
        <p style={{ ...ey, marginBottom: '1rem' }}>Topic Practice</p>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(2rem, 6vw, 3.8rem)', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
          What will you<br />speak about?
        </h1>
      </motion.div>

      <motion.div style={{ width: '100%', maxWidth: '22rem', marginBottom: '1rem' }}
        initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.2, duration: 0.5 }}
      >
        <SpinnerSelector items={TOPICS} onSelect={handleSelectTopic} itemHeight={88} visibleCount={5} />
      </motion.div>

      <AnimatePresence>
        {selected && (
          <motion.div style={{ width: '100%', maxWidth: '28rem', marginTop: '2rem' }}
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          >
            {/* Topic header */}
            <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
              <p style={{ ...ey, marginBottom: '0.75rem' }}>{selected.meta}</p>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.6rem, 5vw, 2.8rem)', letterSpacing: '-0.02em' }}>
                {selected.label}
              </h2>
            </div>

            {/* Hints toggle */}
            <button onClick={handleTogglePrep}
              style={{ width: '100%', padding: '0.75rem 0', marginBottom: '0.5rem', background: 'none', border: '1px solid hsl(var(--border))', cursor: 'pointer', ...ey, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
            >
              {hintsLoading
                ? 'Loading hints…'
                : showPrep
                ? '↑ Hide hints'
                : '↓ Show structure & vocabulary hints'}
            </button>

            {/* Hints panel */}
            <AnimatePresence>
              {showPrep && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.35 }}
                  style={{ overflow: 'hidden', marginBottom: '0.5rem' }}
                >
                  <div style={{ padding: '1.5rem', border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

                    {hintsLoading && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        {[1,2,3].map(i => (
                          <motion.div key={i}
                            style={{ height: '32px', background: 'hsl(var(--border))', borderRadius: 2 }}
                            animate={{ opacity: [0.3, 0.7, 0.3] }}
                            transition={{ duration: 1.2, delay: i * 0.1, repeat: Infinity }}
                          />
                        ))}
                      </div>
                    )}

                    {hintsError && (
                      <p style={{ fontSize: '0.88rem', color: 'hsl(var(--muted-foreground))' }}>
                        {hintsError}
                      </p>
                    )}

                    {hints && !hintsLoading && (
                      <>
                        {/* Structure */}
                        <div>
                          <p style={{ ...ey, marginBottom: '0.75rem' }}>Suggested structure</p>
                          <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                            {hints.structure.map((s) => (
                              <li key={s.step} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', fontSize: '0.92rem', lineHeight: 1.5 }}>
                                <span style={{ ...ey, flexShrink: 0, marginTop: '0.1rem' }}>{s.step}</span>
                                {s.hint}
                              </li>
                            ))}
                          </ol>
                        </div>

                        <div style={{ height: '1px', background: 'hsl(var(--border))' }} />

                        {/* Vocab */}
                        <div>
                          <p style={{ ...ey, marginBottom: '0.75rem' }}>Words to use</p>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                            {hints.vocab.map((word) => (
                              <span key={word} style={{ padding: '0.3rem 0.75rem', border: '1px solid hsl(var(--border))', fontSize: '0.82rem' }}>
                                {word}
                              </span>
                            ))}
                          </div>
                        </div>

                        <div style={{ height: '1px', background: 'hsl(var(--border))' }} />

                        {/* Personalized tip */}
                        <div>
                          <p style={{ ...ey, marginBottom: '0.5rem' }}>Tip for your goal</p>
                          <p style={{ fontSize: '0.88rem', lineHeight: 1.6, fontStyle: 'italic', color: 'hsl(var(--muted-foreground))' }}>
                            {hints.tip}
                          </p>
                        </div>
                      </>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Timer */}
            <div style={{ marginTop: '1.5rem', marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: timerOn ? '1rem' : 0 }}>
                <p style={{ ...ey }}>Speaking timer</p>
                <button onClick={() => setTimerOn(v => !v)}
                  style={{ padding: '0.3rem 0.9rem', fontSize: '0.72rem', letterSpacing: '0.12em', textTransform: 'uppercase', border: '1px solid hsl(var(--border))', background: timerOn ? 'hsl(var(--foreground))' : 'transparent', color: timerOn ? 'hsl(var(--background))' : 'hsl(var(--muted-foreground))', cursor: 'pointer', transition: 'all 0.2s' }}
                >
                  {timerOn ? 'On' : 'Off'}
                </button>
              </div>
              <AnimatePresence>
                {timerOn && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.25 }} style={{ overflow: 'hidden' }}>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      {TIMER_OPTIONS.map(opt => (
                        <button key={opt.value} onClick={() => setTimerSecs(opt.value)}
                          style={{ padding: '0.4rem 0.85rem', fontSize: '0.75rem', letterSpacing: '0.08em', border: `1px solid ${timerSecs === opt.value ? 'hsl(var(--foreground))' : 'hsl(var(--border))'}`, background: timerSecs === opt.value ? 'hsl(var(--foreground))' : 'transparent', color: timerSecs === opt.value ? 'hsl(var(--background))' : 'hsl(var(--muted-foreground))', cursor: 'pointer', transition: 'all 0.2s' }}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Start */}
            <motion.button onClick={handleStart} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.96 }}
              style={{ width: '100%', padding: '0.9rem 0', background: 'hsl(var(--foreground))', color: 'hsl(var(--background))', border: 'none', fontSize: '0.85rem', letterSpacing: '0.14em', textTransform: 'uppercase', cursor: 'pointer' }}
            >
              {timerOn ? `Start — ${TIMER_OPTIONS.find(t => t.value === timerSecs)?.label}` : 'Start Practice →'}
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      {!selected && (
        <motion.p style={{ marginTop: '2.5rem', ...ey }}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}
        >
          Spin to discover your topic
        </motion.p>
      )}
    </div>
  )
}
