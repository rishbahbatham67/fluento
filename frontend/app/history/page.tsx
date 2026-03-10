'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { getHistory, HistoryItem } from '@/lib/api'

const ey = {
  fontSize: '0.72rem',
  letterSpacing: '0.16em',
  textTransform: 'uppercase' as const,
  color: 'hsl(var(--muted-foreground))',
}

function formatDate(iso: string): string {
  const d    = new Date(iso)
  const now  = new Date()
  const diff = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24))
  if (diff === 0) return `Today, ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
  if (diff === 1) return 'Yesterday'
  if (diff < 7)  return `${diff} days ago`
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return ''
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function SessionRow({ session }: { session: HistoryItem }) {
  const [open, setOpen] = useState(false)

  const metrics = [
    { label: 'Fluency',    score: session.fluency_score },
    { label: 'Grammar',    score: session.grammar_score },
    { label: 'Vocabulary', score: session.vocabulary_score },
    { label: 'Clarity',    score: session.clarity_score },
    { label: 'Pacing',     score: session.pacing_score },
  ].filter(m => m.score !== null)

  return (
    <div style={{ borderBottom: '1px solid hsl(var(--border))' }}>
      <button onClick={() => setOpen(v => !v)}
        style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.25rem 0', background: 'none', border: 'none', cursor: 'pointer', color: 'hsl(var(--foreground))' }}
      >
        <div style={{ flex: 1, minWidth: 0, paddingRight: '1rem' }}>
          <p style={{ fontSize: '1rem', lineHeight: 1.4, marginBottom: '0.3rem' }}>{session.topic}</p>
          <div style={{ display: 'flex', gap: '0.5rem', ...ey }}>
            <span>{formatDate(session.created_at)}</span>
            {session.duration_seconds && <><span>·</span><span>{formatDuration(session.duration_seconds)}</span></>}
            {session.topic_category && <><span>·</span><span>{session.topic_category}</span></>}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexShrink: 0 }}>
          {session.overall_score !== null && (
            <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', letterSpacing: '-0.01em' }}>
              {Math.round(session.overall_score)}
            </span>
          )}
          <motion.span style={{ fontSize: '0.85rem', color: 'hsl(var(--muted-foreground))' }}
            animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}
          >↓</motion.span>
        </div>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{ paddingBottom: '1.75rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {session.transcript_excerpt && (
                <blockquote style={{ fontSize: '0.95rem', lineHeight: 1.7, fontStyle: 'italic', borderLeft: '2px solid hsl(var(--border))', paddingLeft: '1rem', color: 'hsl(var(--foreground) / 0.65)', margin: 0 }}>
                  "{session.transcript_excerpt}"
                </blockquote>
              )}
              {metrics.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {metrics.map(m => (
                    <div key={m.label}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
                        <span style={{ ...ey }}>{m.label}</span>
                        <span style={{ fontSize: '0.85rem' }}>{Math.round(m.score!)}</span>
                      </div>
                      <div style={{ height: '1px', width: '100%', position: 'relative', background: 'hsl(var(--border))' }}>
                        <motion.div style={{ position: 'absolute', inset: 0, right: 'auto', background: 'hsl(var(--foreground))' }}
                          initial={{ width: 0 }} animate={{ width: `${m.score}%` }}
                          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default function HistoryPage() {
  const [sessions, setSessions] = useState<HistoryItem[]>([])
  const [total, setTotal]       = useState(0)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  const [filter, setFilter]     = useState('All')

  const TYPES = ['All', 'topic', 'vocabulary', 'reading']

  useEffect(() => {
    setLoading(true)
    getHistory({
      practice_type: filter === 'All' ? undefined : filter,
      limit: 50,
    })
      .then(res => { setSessions(res.items); setTotal(res.total) })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [filter])

  return (
    <div style={{ minHeight: '100vh', padding: '0 1.5rem', maxWidth: '40rem', margin: '0 auto', paddingBottom: '6rem' }}>

      <Link href="/"
        style={{ position: 'fixed', top: '1.25rem', left: '1.5rem', zIndex: 60, ...ey, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
        onMouseEnter={e => (e.currentTarget.style.color = 'hsl(var(--foreground))')}
        onMouseLeave={e => (e.currentTarget.style.color = 'hsl(var(--muted-foreground))')}
      >← Home</Link>

      <motion.div style={{ paddingTop: '5rem', marginBottom: '2.5rem' }}
        initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      >
        <p style={{ ...ey, marginBottom: '1rem' }}>Speech History</p>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(2rem, 6vw, 3.6rem)', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
          {total} {total === 1 ? 'session' : 'sessions'}.
        </h1>
      </motion.div>

      {/* Filter pills */}
      <motion.div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '2.5rem' }}
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}
      >
        {TYPES.map(t => (
          <button key={t} onClick={() => setFilter(t)}
            style={{
              padding: '0.45rem 0.9rem',
              fontSize: '0.75rem', letterSpacing: '0.1em', textTransform: 'uppercase',
              border: `1px solid ${filter === t ? 'hsl(var(--foreground))' : 'hsl(var(--border))'}`,
              background: filter === t ? 'hsl(var(--foreground))' : 'transparent',
              color: filter === t ? 'hsl(var(--background))' : 'hsl(var(--muted-foreground))',
              cursor: 'pointer', transition: 'all 0.2s',
            }}
          >
            {t === 'All' ? 'All' : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </motion.div>

      {/* List */}
      <motion.div style={{ borderTop: '1px solid hsl(var(--border))' }}
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
      >
        {loading && (
          <p style={{ padding: '3rem 0', textAlign: 'center', ...ey }}>Loading…</p>
        )}
        {error && (
          <p style={{ padding: '3rem 0', textAlign: 'center', fontSize: '0.95rem', color: 'hsl(var(--muted-foreground))' }}>
            Could not load history. Is the backend running?
          </p>
        )}
        {!loading && !error && sessions.length === 0 && (
          <p style={{ padding: '3rem 0', textAlign: 'center', fontSize: '0.95rem', color: 'hsl(var(--muted-foreground))' }}>
            No sessions yet. Complete a practice session to see your history here.
          </p>
        )}
        {!loading && sessions.map(s => (
          <SessionRow key={s.id} session={s} />
        ))}
      </motion.div>

    </div>
  )
}
