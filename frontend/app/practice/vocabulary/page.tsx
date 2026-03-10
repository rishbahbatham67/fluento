'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { SpinnerSelector, SpinnerItem } from '@/components/spinner/SpinnerSelector'
import { FeedbackCard, FeedbackData } from '@/components/practice/FeedbackCard'
import { RecordButton, RecordState } from '@/components/practice/RecordButton'
import { AudioWaveform } from '@/components/practice/AudioWaveform'
import { uploadAudio, generateVocabulary, EvaluationResponse, VocabWord } from '@/lib/api'
import { useUser } from '@/lib/userContext'

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
    metrics:      ev.metrics,
    strengths:    ev.strengths,
    corrections:  ev.corrections,
    rewrite:      ev.rewrite ?? undefined,
  }
}

const ey = {
  fontSize: '0.72rem',
  letterSpacing: '0.18em',
  textTransform: 'uppercase' as const,
  color: 'hsl(var(--muted-foreground))',
}

type Phase = 'loading' | 'select' | 'ready' | 'recording' | 'processing' | 'feedback'

export default function VocabularyPracticePage() {
  const { profile } = useUser()

  const [words, setWords]               = useState<VocabWord[]>([])
  const [spinnerItems, setSpinnerItems] = useState<SpinnerItem[]>([])
  const [loadingWords, setLoadingWords] = useState(true)
  const [loadError, setLoadError]       = useState<string | null>(null)
  const [selected, setSelected]         = useState<VocabWord | null>(null)
  const [phase, setPhase]               = useState<Phase>('loading')
  const [recordState, setRecordState]   = useState<RecordState>('idle')
  const [feedback, setFeedback]         = useState<FeedbackData | null>(null)
  const [error, setError]               = useState<string | null>(null)

  const { seconds, fmt, reset } = useTimer(phase === 'recording')
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef   = useRef<Blob[]>([])
  const streamRef        = useRef<MediaStream | null>(null)

  const fetchWords = useCallback(async () => {
    setLoadingWords(true)
    setLoadError(null)
    setPhase('loading')
    setSelected(null)
    try {
      const data = await generateVocabulary(
        profile.goals      || 'general English communication',
        profile.difficulty || 'intermediate',
        12,
      )
      setWords(data.words)
      // Convert to SpinnerItem format
      const items: SpinnerItem[] = data.words.map((w, i) => ({
        label: w.word,
        value: `word-${i}`,
        meta:  w.type,
      }))
      setSpinnerItems(items)
      setPhase('select')
    } catch (e: unknown) {
      setLoadError(e instanceof Error ? e.message : 'Failed to load vocabulary')
      setPhase('loading')
    } finally {
      setLoadingWords(false)
    }
  }, [profile.goals, profile.difficulty])

  useEffect(() => { fetchWords() }, [fetchWords])

  const handleWordSelect = (item: SpinnerItem) => {
    const idx   = parseInt(item.value.replace('word-', ''))
    const vocab = words[idx] ?? null
    setSelected(vocab)
  }

  const handleStartPractice = () => {
    if (!selected) return
    setPhase('ready')
    setFeedback(null)
    setError(null)
  }

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
      console.error(err)
      setError('Microphone access denied. Please allow microphone access and try again.')
    }
  }

  const handleStop = () => {
    const recorder = mediaRecorderRef.current
    if (!recorder) return
    setRecordState('processing')
    setPhase('processing')
    recorder.onstop = async () => {
      streamRef.current?.getTracks().forEach(t => t.stop())
      const mimeType  = recorder.mimeType || 'audio/webm'
      const audioBlob = new Blob(audioChunksRef.current, { type: mimeType })
      try {
        const goalCategory = profile.goals
          ? `Vocabulary · ${profile.goals.slice(0, 40)}`
          : 'Vocabulary Practice'
        const result = await uploadAudio(
          audioBlob,
          `Vocabulary: ${selected!.word}`,
          goalCategory,
          'vocabulary',
          seconds,
        )
        setFeedback(toFeedbackData(result))
        setPhase('feedback')
        setRecordState('idle')
      } catch (err: unknown) {
        console.error(err)
        setError(err instanceof Error ? err.message : 'Something went wrong')
        setPhase('ready')
        setRecordState('idle')
      }
    }
    recorder.stop()
  }

  const handleNextWord = () => {
    setSelected(null)
    setPhase('select')
    setFeedback(null)
    setError(null)
    reset()
  }

  const handleRetry = () => {
    setPhase('ready')
    setFeedback(null)
    setError(null)
    reset()
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0 1.5rem 6rem' }}>

      <Link href="/"
        style={{ position: 'fixed', top: '1.25rem', left: '1.5rem', zIndex: 60, ...ey, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
        onMouseEnter={e => (e.currentTarget.style.color = 'hsl(var(--foreground))')}
        onMouseLeave={e => (e.currentTarget.style.color = 'hsl(var(--muted-foreground))')}
      >← Home</Link>

      <AnimatePresence mode="wait">

        {/* Loading */}
        {phase === 'loading' && (
          <motion.div key="loading"
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 'calc(100vh - 4rem)', width: '100%', maxWidth: '28rem', gap: '1.5rem' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          >
            {loadError ? (
              <>
                <p style={{ fontSize: '0.95rem', color: 'hsl(var(--muted-foreground))', textAlign: 'center', lineHeight: 1.7 }}>{loadError}</p>
                <motion.button onClick={fetchWords} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.96 }}
                  style={{ padding: '0.9rem 2.5rem', background: 'hsl(var(--foreground))', color: 'hsl(var(--background))', border: 'none', fontSize: '0.82rem', letterSpacing: '0.14em', textTransform: 'uppercase', cursor: 'pointer' }}
                >Try again</motion.button>
              </>
            ) : (
              <>
                <div style={{ textAlign: 'center' }}>
                  <p style={{ ...ey, marginBottom: '1rem' }}>Vocabulary Practice</p>
                  <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.8rem, 5vw, 3rem)', letterSpacing: '-0.02em', lineHeight: 1.1, marginBottom: '1rem' }}>
                    Building your<br />word list…
                  </h1>
                  <p style={{ fontSize: '0.9rem', color: 'hsl(var(--muted-foreground))' }}>
                    Generating vocabulary for: {profile.goals?.slice(0, 50) || 'general English'}
                  </p>
                </div>
                <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {[1,2,3,4,5].map(i => (
                    <motion.div key={i}
                      style={{ height: '64px', background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                      animate={{ opacity: [0.3, 0.7, 0.3] }}
                      transition={{ duration: 1.4, delay: i * 0.15, repeat: Infinity }}
                    />
                  ))}
                </div>
              </>
            )}
          </motion.div>
        )}

        {/* Select word via spinner */}
        {phase === 'select' && (
          <motion.div key="select"
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 'calc(100vh - 4rem)', width: '100%' }}
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          >
            <div style={{ textAlign: 'center', marginBottom: '3.5rem' }}>
              <p style={{ ...ey, marginBottom: '1rem' }}>Vocabulary Practice</p>
              <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(2rem, 6vw, 3.8rem)', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
                One word at<br />a time.
              </h1>
              {profile.goals && (
                <p style={{ marginTop: '0.75rem', fontSize: '0.85rem', color: 'hsl(var(--muted-foreground))' }}>
                  Tailored for: {profile.goals.length > 45 ? profile.goals.slice(0, 45) + '…' : profile.goals}
                </p>
              )}
            </div>

            <div style={{ width: '100%', maxWidth: '22rem' }}>
              <SpinnerSelector
                items={spinnerItems}
                onSelect={handleWordSelect}
                itemHeight={88}
                visibleCount={5}
              />
            </div>

            <AnimatePresence>
              {selected && (
                <motion.div key={selected.word}
                  style={{ marginTop: '3.5rem', width: '100%', maxWidth: '22rem' }}
                  initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                >
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem', marginBottom: '1rem' }}>
                    <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(2rem, 7vw, 3.2rem)', letterSpacing: '-0.02em', lineHeight: 1 }}>
                      {selected.word}
                    </h2>
                    <span style={{ ...ey }}>{selected.type}</span>
                  </div>

                  <div style={{ height: '1px', background: 'hsl(var(--border))', marginBottom: '1.5rem' }} />

                  <p style={{ fontSize: '1rem', lineHeight: 1.7, marginBottom: '1.25rem' }}>
                    {selected.definition}
                  </p>

                  <p style={{ fontSize: '0.9rem', lineHeight: 1.7, fontStyle: 'italic', color: 'hsl(var(--muted-foreground))', marginBottom: '2rem' }}>
                    "{selected.example}"
                  </p>

                  <div style={{ height: '1px', background: 'hsl(var(--border))', marginBottom: '2rem' }} />

                  <motion.button
                    onClick={handleStartPractice}
                    whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.96 }}
                    style={{ width: '100%', padding: '0.9rem 0', background: 'hsl(var(--foreground))', color: 'hsl(var(--background))', border: 'none', fontSize: '0.85rem', letterSpacing: '0.14em', textTransform: 'uppercase', cursor: 'pointer' }}
                  >
                    Use in a sentence →
                  </motion.button>
                </motion.div>
              )}
            </AnimatePresence>

            {!selected && (
              <motion.p style={{ marginTop: '2.5rem', ...ey }}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}
              >
                Spin to get your word
              </motion.p>
            )}

            <button onClick={fetchWords}
              style={{ marginTop: '2rem', ...ey, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
            >
              ↻ Generate new words
            </button>
          </motion.div>
        )}

        {/* Ready / Recording / Processing */}
        {(phase === 'ready' || phase === 'recording' || phase === 'processing') && selected && (
          <motion.div key="record"
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 'calc(100vh - 4rem)', width: '100%' }}
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          >
            <motion.div
              style={{ width: '100%', maxWidth: '28rem', padding: '2rem 2.5rem', border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))', marginBottom: '3rem', textAlign: 'center' }}
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.4 }}
            >
              <p style={{ ...ey, marginBottom: '1rem' }}>Use this word in a sentence</p>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(2.2rem, 6vw, 3.5rem)', letterSpacing: '-0.02em', lineHeight: 1, marginBottom: '0.5rem' }}>
                {selected.word}
              </h2>
              <p style={{ ...ey, marginBottom: '0.75rem' }}>{selected.type}</p>
              <p style={{ fontSize: '0.88rem', color: 'hsl(var(--muted-foreground))', lineHeight: 1.6 }}>
                {selected.definition}
              </p>
              {profile.goals && (
                <p style={{ marginTop: '0.75rem', fontSize: '0.78rem', color: 'hsl(var(--muted-foreground))', letterSpacing: '0.06em' }}>
                  Try to relate it to: {profile.goals.length > 35 ? profile.goals.slice(0, 35) + '…' : profile.goals}
                </p>
              )}
            </motion.div>

            <div style={{ marginBottom: '2.5rem', width: '100%', maxWidth: '20rem' }}>
              <AudioWaveform isActive={phase === 'recording'} barCount={32} height={52} />
            </div>

            <AnimatePresence>
              {phase === 'recording' && (
                <motion.p style={{ marginBottom: '1.5rem', fontSize: '1rem', fontVariantNumeric: 'tabular-nums', letterSpacing: '0.2em', color: 'hsl(var(--muted-foreground))' }}
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                >
                  {fmt}
                </motion.p>
              )}
            </AnimatePresence>

            <RecordButton state={recordState} onStart={handleStart} onStop={handleStop} />

            <motion.p key={phase} style={{ marginTop: '2rem', ...ey }}
              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
            >
              {phase === 'ready'      && 'Tap to record your sentence'}
              {phase === 'recording'  && 'Recording — tap to stop'}
              {phase === 'processing' && 'Analysing your vocabulary usage…'}
            </motion.p>

            {phase === 'processing' && (
              <motion.p style={{ marginTop: '1rem', fontSize: '0.82rem', color: 'hsl(var(--muted-foreground))' }}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              >
                This takes 10–20 seconds.
              </motion.p>
            )}

            {error && (
              <motion.div style={{ marginTop: '2rem', maxWidth: '22rem', padding: '1rem 1.25rem', border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))', textAlign: 'center' }}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              >
                <p style={{ fontSize: '0.88rem' }}>{error}</p>
              </motion.div>
            )}

            {phase === 'ready' && (
              <button onClick={handleNextWord}
                style={{ marginTop: '2rem', ...ey, background: 'none', border: 'none', cursor: 'pointer' }}
              >
                ← Pick a different word
              </button>
            )}
          </motion.div>
        )}

        {/* Feedback */}
        {phase === 'feedback' && feedback && selected && (
          <motion.div key="feedback"
            style={{ width: '100%', maxWidth: '36rem', paddingTop: '3.5rem', paddingBottom: '6rem' }}
            initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          >
            <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
              <p style={{ ...ey, marginBottom: '0.75rem' }}>Vocabulary Feedback</p>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.6rem, 4vw, 2.8rem)', letterSpacing: '-0.02em' }}>
                {selected.word}
              </h2>
            </div>

            <FeedbackCard feedback={feedback} />

            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '3.5rem' }}>
              <motion.button onClick={handleRetry} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.96 }}
                style={{ flex: 1, padding: '0.9rem 0', border: '1px solid hsl(var(--border))', background: 'transparent', color: 'hsl(var(--foreground))', fontSize: '0.78rem', letterSpacing: '0.14em', textTransform: 'uppercase', cursor: 'pointer' }}
              >
                Try again
              </motion.button>
              <motion.button onClick={handleNextWord} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.96 }}
                style={{ flex: 1, padding: '0.9rem 0', background: 'hsl(var(--foreground))', color: 'hsl(var(--background))', border: 'none', fontSize: '0.78rem', letterSpacing: '0.14em', textTransform: 'uppercase', cursor: 'pointer' }}
              >
                Next word →
              </motion.button>
            </div>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  )
}
