'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'

interface TopicItem {
  label:    string
  category: string
  why?:     string
}

const ey = {
  fontSize: '0.72rem',
  letterSpacing: '0.18em',
  textTransform: 'uppercase' as const,
  color: 'hsl(var(--muted-foreground))',
}

const DIFFICULTY_LABELS: Record<string, string> = {
  beginner:     'Beginner',
  intermediate: 'Intermediate',
  advanced:     'Advanced',
}

function TopicsInner() {
  const router     = useRouter()
  const params     = useSearchParams()
  const goals      = params.get('goals')      ?? ''
  const difficulty = params.get('difficulty') ?? 'intermediate'

  const [topics, setTopics]   = useState<TopicItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  const fetchTopics = async () => {
    setLoading(true)
    setError(null)
    setTopics([])
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/topics/generate`,
        {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ goals, difficulty, count: 6 }),
        }
      )
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || `Server error ${res.status}`)
      }
      const data = await res.json()
      setTopics(data.topics)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchTopics() }, [])

  const handlePick = (topic: TopicItem) => {
    router.push(
      `/practice/session?topic=${encodeURIComponent(topic.label)}&category=${encodeURIComponent(topic.category)}&type=topic`
    )
  }

  return (
    <div style={{ minHeight: '100vh', padding: '0 1.5rem 6rem', maxWidth: '38rem', margin: '0 auto' }}>

      <Link
        href={`/practice/difficulty?goals=${encodeURIComponent(goals)}`}
        style={{ position: 'fixed', top: '1.25rem', left: '1.5rem', zIndex: 60, ...ey, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
        onMouseEnter={e => (e.currentTarget.style.color = 'hsl(var(--foreground))')}
        onMouseLeave={e => (e.currentTarget.style.color = 'hsl(var(--muted-foreground))')}
      >← Difficulty</Link>

      <motion.div
        style={{ paddingTop: 'clamp(5rem, 12vw, 8rem)', marginBottom: '3rem' }}
        initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
      >
        <p style={{ ...ey, marginBottom: '1.25rem' }}>Step 3 of 3</p>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(2.2rem, 7vw, 4rem)', letterSpacing: '-0.02em', lineHeight: 1.05, marginBottom: '1rem' }}>
          Your topics.
        </h1>
        <p style={{ fontSize: '0.9rem', color: 'hsl(var(--muted-foreground))', lineHeight: 1.6 }}>
          {DIFFICULTY_LABELS[difficulty]} · {goals.length > 60 ? goals.slice(0, 60) + '…' : goals}
        </p>
      </motion.div>

      <AnimatePresence mode="wait">

        {/* Loading skeleton */}
        {loading && (
          <motion.div key="loading"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}
          >
            {[1,2,3,4,5,6].map(i => (
              <motion.div key={i}
                style={{ height: '80px', background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                animate={{ opacity: [0.3, 0.7, 0.3] }}
                transition={{ duration: 1.4, delay: i * 0.1, repeat: Infinity, ease: 'easeInOut' }}
              />
            ))}
            <p style={{ ...ey, textAlign: 'center', marginTop: '1rem' }}>
              Generating topics for you…
            </p>
          </motion.div>
        )}

        {/* Error */}
        {!loading && error && (
          <motion.div key="error"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            style={{ textAlign: 'center', paddingTop: '2rem' }}
          >
            <p style={{ fontSize: '0.95rem', color: 'hsl(var(--muted-foreground))', marginBottom: '2rem', lineHeight: 1.7 }}>
              {error}
            </p>
            <motion.button onClick={fetchTopics}
              whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.96 }}
              style={{ padding: '0.9rem 2.5rem', background: 'hsl(var(--foreground))', color: 'hsl(var(--background))', border: 'none', fontSize: '0.82rem', letterSpacing: '0.14em', textTransform: 'uppercase', cursor: 'pointer' }}
            >
              Try again
            </motion.button>
          </motion.div>
        )}

        {/* Topics list */}
        {!loading && !error && topics.length > 0 && (
          <motion.div key="topics"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}
          >
            {topics.map((topic, i) => (
              <motion.button key={i}
                onClick={() => handlePick(topic)}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.07, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                whileHover={{ x: 5 }}
                style={{ textAlign: 'left', padding: '1.25rem 1.5rem', border: '1px solid hsl(var(--border))', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', transition: 'border-color 0.2s', gap: '1rem' }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = 'hsl(var(--foreground))')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'hsl(var(--border))')}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: '0.95rem', lineHeight: 1.4, marginBottom: '0.25rem' }}>{topic.label}</p>
                  <p style={{ ...ey }}>{topic.category}</p>
                  {topic.why && (
                    <p style={{ fontSize: '0.8rem', color: 'hsl(var(--muted-foreground))', marginTop: '0.4rem', lineHeight: 1.55 }}>
                      {topic.why}
                    </p>
                  )}
                </div>
                <span style={{ color: 'hsl(var(--muted-foreground))', flexShrink: 0, marginTop: '0.15rem' }}>→</span>
              </motion.button>
            ))}

            {/* Regenerate */}
            <motion.button onClick={fetchTopics}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
              style={{ marginTop: '0.5rem', padding: '0.8rem 0', ...ey, background: 'none', border: '1px solid hsl(var(--border))', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', width: '100%' }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = 'hsl(var(--foreground))')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'hsl(var(--border))')}
            >
              ↻ Generate different topics
            </motion.button>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  )
}

export default function TopicsPage() {
  return <Suspense><TopicsInner /></Suspense>
}
