'use client'

import { useEffect, useRef, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { RecordButton, RecordState } from '@/components/practice/RecordButton'
import { AudioWaveform } from '@/components/practice/AudioWaveform'
import { FeedbackCard, FeedbackData } from '@/components/practice/FeedbackCard'
import { uploadAudio, EvaluationResponse } from '@/lib/api'
import { PageBrand } from '@/components/ui/PageBrand'

function useTimer(running: boolean) {
  const [seconds, setSeconds] = useState(0)
  const ref = useRef<ReturnType<typeof setInterval> | null>(null)
  useEffect(() => {
    if (running) ref.current = setInterval(() => setSeconds(s => s + 1), 1000)
    else if (ref.current) clearInterval(ref.current)
    return () => { if (ref.current) clearInterval(ref.current) }
  }, [running])
  const reset = () => setSeconds(0)
  const fmt = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
  return { seconds, fmt, reset }
}

function toFeedbackData(ev: EvaluationResponse): FeedbackData {
  return {
    transcript:   ev.transcript,
    overallScore: ev.overallScore,
    metrics:      ev.metrics.map(m => ({ label: m.label, score: m.score })),
    strengths:    ev.strengths,
    corrections:  ev.corrections.map(c => ({ original: c.original, suggestion: c.suggestion, reason: c.reason })),
    rewrite:      ev.rewrite ?? undefined,
  }
}

const ey = {
  fontSize: '0.72rem',
  letterSpacing: '0.18em',
  textTransform: 'uppercase' as const,
  color: 'hsl(var(--muted-foreground))',
}

function SessionInner() {
  const params       = useSearchParams()
  const topic        = params.get('topic')    ?? 'Open Practice'
  const topicCat     = params.get('category') ?? undefined
  const practiceType = params.get('type')     ?? 'topic'
  const limitSecs    = parseInt(params.get('limit') ?? '0', 10)

  // ── ALL useState hooks must come before any useEffect ──────────────────
  const [recordState, setRecordState] = useState<RecordState>('idle')
  const [phase, setPhase]             = useState<'ready' | 'recording' | 'processing' | 'feedback'>('ready')
  const [feedback, setFeedback]       = useState<FeedbackData | null>(null)
  const [error, setError]             = useState<string | null>(null)
  const [countdown, setCountdown]     = useState(limitSecs)

  const { seconds, fmt, reset } = useTimer(phase === 'recording')

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef   = useRef<Blob[]>([])
  const streamRef        = useRef<MediaStream | null>(null)
  const countdownRef     = useRef<ReturnType<typeof setInterval> | null>(null)
  const handleStopRef    = useRef<() => void>(() => {})

  // ── Countdown timer ─────────────────────────────────────────────────────
  useEffect(() => {
    if (phase === 'recording' && limitSecs > 0) {
      setCountdown(limitSecs)
      countdownRef.current = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) {
            clearInterval(countdownRef.current!)
            handleStopRef.current()
            return 0
          }
          return prev - 1
        })
      }, 1000)
    }
    return () => {
	    <PageBrand label="Speaking Practice" />
      if (countdownRef.current) clearInterval(countdownRef.current)
    }
  }, [phase, limitSecs])

  const handleStart = async () => {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/ogg') ? 'audio/ogg' : ''
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      mediaRecorderRef.current = recorder
      audioChunksRef.current   = []
      recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data) }
      recorder.start(250)
      reset()
      setRecordState('recording')
      setPhase('recording')
    } catch (err) {
      console.error('Microphone error:', err)
      setError('Microphone access denied. Please allow microphone access and try again.')
    }
  }

  const handleStop = () => {
    const recorder = mediaRecorderRef.current
    if (!recorder || recorder.state === 'inactive') return
    if (countdownRef.current) clearInterval(countdownRef.current)
    setRecordState('processing')
    setPhase('processing')

    recorder.onstop = async () => {
      streamRef.current?.getTracks().forEach(t => t.stop())
      const mimeType  = recorder.mimeType || 'audio/webm'
      const audioBlob = new Blob(audioChunksRef.current, { type: mimeType })
      try {
        const result = await uploadAudio(audioBlob, topic, topicCat, practiceType, seconds)
        setFeedback(toFeedbackData(result))
        setPhase('feedback')
        setRecordState('idle')
      } catch (err: unknown) {
        console.error('Upload error:', err)
        setError(err instanceof Error ? err.message : 'Something went wrong')
        setPhase('ready')
        setRecordState('idle')
      }
    }
    recorder.stop()
  }

  // Keep handleStopRef in sync so countdown can call it
  handleStopRef.current = handleStop

  const handleReset = () => {
    setFeedback(null)
    setError(null)
    setPhase('ready')
    setRecordState('idle')
    setCountdown(limitSecs)
    reset()
  }

  const fmtCountdown = `${String(Math.floor(countdown / 60)).padStart(2, '0')}:${String(countdown % 60).padStart(2, '0')}`

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0 1.5rem 6rem' }}>

      <Link href="/practice/topic"
        style={{ position: 'fixed', top: '1.25rem', left: '1.5rem', zIndex: 60, ...ey, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
        onMouseEnter={e => (e.currentTarget.style.color = 'hsl(var(--foreground))')}
        onMouseLeave={e => (e.currentTarget.style.color = 'hsl(var(--muted-foreground))')}
      >← Back</Link>

      <AnimatePresence mode="wait">

        {phase !== 'feedback' && (
          <motion.div key="recorder"
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 'calc(100vh - 4rem)' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.4 }}
          >
            <motion.div style={{ textAlign: 'center', marginBottom: '4rem' }}
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            >
              <p style={{ ...ey, marginBottom: '0.75rem' }}>Speaking about</p>
              <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.8rem, 5vw, 3.2rem)', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
                {topic}
              </h1>
            </motion.div>

            <div style={{ marginBottom: '2.5rem', width: '100%', maxWidth: '20rem' }}>
              <AudioWaveform isActive={phase === 'recording'} barCount={32} height={52} />
            </div>

            <AnimatePresence>
              {phase === 'recording' && (
                <motion.p
                  style={{
                    marginBottom: '1.5rem',
                    fontSize: '1rem',
                    fontVariantNumeric: 'tabular-nums',
                    letterSpacing: '0.2em',
                    color: limitSecs > 0 && countdown <= 10
                      ? 'hsl(var(--foreground))'
                      : 'hsl(var(--muted-foreground))',
                    transition: 'color 0.3s',
                  }}
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                >
                  {limitSecs > 0 ? fmtCountdown : fmt}
                </motion.p>
              )}
            </AnimatePresence>

            <RecordButton state={recordState} onStart={handleStart} onStop={handleStop} />

            <motion.p key={phase} style={{ marginTop: '2rem', ...ey }}
              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
            >
              {phase === 'ready'      && (limitSecs > 0 ? `${fmtCountdown} limit · tap to begin` : 'Tap to begin speaking')}
              {phase === 'recording'  && (limitSecs > 0 ? 'Recording — stops automatically' : 'Recording — tap to stop')}
              {phase === 'processing' && 'Transcribing and analysing…'}
            </motion.p>

            <AnimatePresence>
              {phase === 'processing' && (
                <motion.p style={{ marginTop: '1rem', maxWidth: '18rem', textAlign: 'center', fontSize: '0.82rem', lineHeight: 1.6, color: 'hsl(var(--muted-foreground))' }}
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                >
                  This takes 10–20 seconds.
                </motion.p>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {phase === 'ready' && (
                <motion.p style={{ marginTop: '3rem', maxWidth: '18rem', textAlign: 'center', fontSize: '0.9rem', lineHeight: 1.65, color: 'hsl(var(--muted-foreground))' }}
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ delay: 0.5 }}
                >
                  Speak for at least 15 seconds for best results.
                </motion.p>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {error && (
                <motion.div
                  style={{ marginTop: '2rem', maxWidth: '22rem', padding: '1rem 1.25rem', border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))', textAlign: 'center' }}
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                >
                  <p style={{ fontSize: '0.88rem', lineHeight: 1.6 }}>{error}</p>
                  <button onClick={handleReset}
                    style={{ marginTop: '0.75rem', ...ey, background: 'none', border: 'none', cursor: 'pointer' }}
                  >
                    Try again
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}

        {phase === 'feedback' && feedback && (
          <motion.div key="feedback"
            style={{ width: '100%', maxWidth: '36rem', paddingTop: '3.5rem', paddingBottom: '6rem' }}
            initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          >
            <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
              <p style={{ ...ey, marginBottom: '0.75rem' }}>AI Feedback</p>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.6rem, 4vw, 2.8rem)', letterSpacing: '-0.02em' }}>
                {topic}
              </h2>
            </div>

            <FeedbackCard feedback={feedback} />

            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '3.5rem' }}>
              <motion.button onClick={handleReset} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.96 }}
                style={{ flex: 1, padding: '0.9rem 0', border: '1px solid hsl(var(--border))', background: 'transparent', color: 'hsl(var(--foreground))', fontSize: '0.78rem', letterSpacing: '0.14em', textTransform: 'uppercase', cursor: 'pointer' }}
              >
                Try again
              </motion.button>
              <Link href="/practice/topic" style={{ flex: 1 }}>
                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.96 }}
                  style={{ width: '100%', padding: '0.9rem 0', background: 'hsl(var(--foreground))', color: 'hsl(var(--background))', border: 'none', fontSize: '0.78rem', letterSpacing: '0.14em', textTransform: 'uppercase', cursor: 'pointer' }}
                >
                  New topic
                </motion.button>
              </Link>
            </div>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  )
}

export default function SessionPage() {
  return <Suspense><SessionInner /></Suspense>
}
