'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { generateParagraph, ParagraphResponse } from '@/lib/api'
import { useUser } from '@/lib/userContext'

type Phase = 'loading' | 'ready' | 'countdown' | 'reading' | 'finished' | 'error'
type WordStatus = 'unread' | 'correct' | 'skipped' | 'current'
interface WordState { word: string; status: WordStatus }
interface ReadingResult {
  wordsCorrect: number; wordsSkipped: number; totalWords: number
  accuracy: number; wpm: number; targetWpm: number; timeTaken: number; skippedWords: string[]
}

const ey = { fontSize: '0.72rem', letterSpacing: '0.18em', textTransform: 'uppercase' as const, color: 'hsl(var(--muted-foreground))' }

function normalizeWord(w: string): string {
  return w.toLowerCase().replace(/[^a-z0-9]/g, '')
}

const LOOKAHEAD = 8

function buildWordStates(paragraphWords: string[], spokenWords: string[]): { states: WordState[]; userIdx: number } {
  const states: WordState[] = paragraphWords.map(w => ({ word: w, status: 'unread' as WordStatus }))
  let paraIdx = 0, spokenIdx = 0
  while (spokenIdx < spokenWords.length && paraIdx < paragraphWords.length) {
    const sNorm = normalizeWord(spokenWords[spokenIdx])
    if (!sNorm) { spokenIdx++; continue }
    let found = -1
    for (let look = 0; look <= LOOKAHEAD && paraIdx + look < paragraphWords.length; look++) {
      const pNorm = normalizeWord(paragraphWords[paraIdx + look])
      if (pNorm === sNorm) { found = paraIdx + look; break }
      if (sNorm.length >= 4 && pNorm.length >= 4 && look === 0 && sNorm.slice(0, 4) === pNorm.slice(0, 4)) { found = paraIdx + look; break }
    }
    if (found === -1) { spokenIdx++; continue }
    for (let i = paraIdx; i < found; i++) states[i].status = 'skipped'
    states[found].status = 'correct'
    paraIdx = found + 1
    spokenIdx++
  }
  if (paraIdx < states.length && states[paraIdx].status === 'unread') states[paraIdx].status = 'current'
  return { states, userIdx: paraIdx }
}

export default function ReadingPracticePage() {
  const { profile } = useUser()
  const [phase, setPhase]                 = useState<Phase>('loading')
  const [paragraphData, setParagraphData] = useState<ParagraphResponse | null>(null)
  const [errorMsg, setErrorMsg]           = useState<string | null>(null)
  const [countdown, setCountdown]         = useState(3)
  const [fetchKey, setFetchKey]           = useState(0)
  const [wordStates, setWordStates]       = useState<WordState[]>([])
  const [userIdx, setUserIdx]             = useState(0)
  const [idealIdx, setIdealIdx]           = useState(0)
  const [elapsedSecs, setElapsedSecs]     = useState(0)
  const [result, setResult]               = useState<ReadingResult | null>(null)

  const paragraphDataRef  = useRef<ParagraphResponse | null>(null)
  const elapsedRef        = useRef(0)
  const wordStatesRef     = useRef<WordState[]>([])
  const recognitionRef    = useRef<SpeechRecognition | null>(null)
  const isListeningRef    = useRef(false)
  const restartTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const elapsedTimerRef   = useRef<ReturnType<typeof setInterval> | null>(null)
  const idealTimerRef     = useRef<ReturnType<typeof setInterval> | null>(null)
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const activeWordRef     = useRef<HTMLSpanElement | null>(null)
  const finalWordsRef     = useRef<string[]>([])
  const highWaterRef      = useRef(0)

  useEffect(() => { paragraphDataRef.current = paragraphData }, [paragraphData])
  useEffect(() => { elapsedRef.current = elapsedSecs }, [elapsedSecs])
  useEffect(() => { wordStatesRef.current = wordStates }, [wordStates])

  useEffect(() => {
    if (phase !== 'reading') return
    activeWordRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [userIdx, phase])

  const clearAllTimers = () => {
    if (elapsedTimerRef.current)   clearInterval(elapsedTimerRef.current)
    if (idealTimerRef.current)     clearInterval(idealTimerRef.current)
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current)
  }

  const stopRecognition = () => {
    isListeningRef.current = false
    if (restartTimerRef.current) clearTimeout(restartTimerRef.current)
    if (recognitionRef.current) { try { recognitionRef.current.stop() } catch {} recognitionRef.current = null }
  }

  const processTranscript = useCallback((spokenText: string) => {
    const data = paragraphDataRef.current
    if (!data) return
    const paraWords   = data.paragraph.trim().split(/\s+/)
    const spokenWords = spokenText.trim().split(/\s+/).filter(Boolean)
    if (spokenWords.length === 0) return

    const { states, userIdx: newIdx } = buildWordStates(paraWords, spokenWords)

    // One-way ratchet — never go back
    const safeIdx = Math.max(newIdx, highWaterRef.current)

    // Update high water mark only on solid matches
    if (newIdx > highWaterRef.current) highWaterRef.current = newIdx

    for (let i = 0; i < safeIdx && i < states.length; i++) {
      if (states[i].status === 'unread') states[i].status = 'skipped'
    }
    if (safeIdx < states.length) states[safeIdx].status = 'current'

    setWordStates(states)
    setUserIdx(safeIdx)

    if (safeIdx >= paraWords.length) {
      clearAllTimers(); stopRecognition(); setPhase('finished')
      const correct = states.filter(w => w.status === 'correct').length
      const skipped = states.filter(w => w.status === 'skipped').length
      const elapsed = elapsedRef.current || 1
      setResult({
        wordsCorrect: correct, wordsSkipped: skipped, totalWords: paraWords.length,
        accuracy: Math.round((correct / paraWords.length) * 100),
        wpm: Math.round((correct / elapsed) * 60),
        targetWpm: data.target_wpm, timeTaken: elapsed,
        skippedWords: states.filter(w => w.status === 'skipped').map(w => w.word.replace(/[^a-zA-Z]/g, '')).filter(Boolean).slice(0, 8),
      })
    }
  }, [])

  const startRecognition = useCallback(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) { setErrorMsg('Speech recognition not supported. Please use Chrome.'); setPhase('error'); return }

    isListeningRef.current = true

    const makeRec = (): SpeechRecognition => {
      const r = new SR() as SpeechRecognition
      r.continuous = true
      r.interimResults = true
      r.lang = 'en-US'
      r.maxAlternatives = 1

      r.onresult = (event: SpeechRecognitionEvent) => {
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            finalWordsRef.current.push(...event.results[i][0].transcript.trim().split(/\s+/).filter(Boolean))
          }
        }
        // Build: finals + current interim for responsive cursor
        let interim = ''
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (!event.results[i].isFinal) interim += ' ' + event.results[i][0].transcript
        }
        const combined = [...finalWordsRef.current, ...interim.trim().split(/\s+/).filter(Boolean)].join(' ')
        processTranscript(combined)
      }

      r.onerror = (e: SpeechRecognitionErrorEvent) => {
        if (e.error === 'no-speech' || e.error === 'aborted') return
        console.warn('SR error:', e.error)
      }

      r.onend = () => {
        if (!isListeningRef.current) return
        // Lock position with finals before interim clears
        processTranscript(finalWordsRef.current.join(' '))
        if (restartTimerRef.current) clearTimeout(restartTimerRef.current)
        restartTimerRef.current = setTimeout(() => {
          if (!isListeningRef.current) return
          try { const nr = makeRec(); recognitionRef.current = nr; nr.start() } catch (e) { console.warn(e) }
        }, 100)
      }
      return r
    }

    const rec = makeRec()
    recognitionRef.current = rec
    try { rec.start() } catch (e) { console.warn(e) }
  }, [processTranscript])

  useEffect(() => () => { stopRecognition(); clearAllTimers() }, [])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setPhase('loading'); setErrorMsg(null)
      setUserIdx(0); setIdealIdx(0); setElapsedSecs(0); setWordStates([]); setResult(null)
      finalWordsRef.current = []; highWaterRef.current = 0
      try {
        const data = await generateParagraph(profile.goals || 'general English communication', profile.difficulty || 'intermediate')
        if (cancelled) return
        setParagraphData(data)
        const words = data.paragraph.trim().split(/\s+/)
        setWordStates(words.map((w, i) => ({ word: w, status: (i === 0 ? 'current' : 'unread') as WordStatus })))
        setPhase('ready')
      } catch (e: unknown) {
        if (!cancelled) { setErrorMsg(e instanceof Error ? e.message : 'Failed to load paragraph'); setPhase('error') }
      }
    }
    load()
    return () => { cancelled = true }
  }, [fetchKey, profile.goals, profile.difficulty])

  const handleStart = () => {
    setCountdown(3); setPhase('countdown')
    let count = 3
    countdownTimerRef.current = setInterval(() => {
      count--; setCountdown(count)
      if (count <= 0) { clearInterval(countdownTimerRef.current!); startReading() }
    }, 1000)
  }

  const startReading = () => {
    const data = paragraphDataRef.current
    if (!data) return
    setPhase('reading'); setUserIdx(0); setIdealIdx(0); setElapsedSecs(0)
    finalWordsRef.current = []; highWaterRef.current = 0
    const words = data.paragraph.trim().split(/\s+/)
    setWordStates(words.map((w, i) => ({ word: w, status: (i === 0 ? 'current' : 'unread') as WordStatus })))
    elapsedTimerRef.current = setInterval(() => setElapsedSecs(s => s + 1), 1000)
    const msPerWord = (60 / data.target_wpm) * 1000
    idealTimerRef.current = setInterval(() => {
      setIdealIdx(prev => { const next = prev + 1; if (next >= words.length) clearInterval(idealTimerRef.current!); return next })
    }, msPerWord)
    startRecognition()
  }

  const handleFinishEarly = () => {
    if (!paragraphData) return
    clearAllTimers(); stopRecognition(); setPhase('finished')
    const states = wordStatesRef.current
    const correct = states.filter(w => w.status === 'correct').length
    const skipped = states.filter(w => w.status === 'skipped').length
    const elapsed = elapsedRef.current || 1
    const total   = paragraphData.paragraph.trim().split(/\s+/).length
    setResult({
      wordsCorrect: correct, wordsSkipped: skipped, totalWords: total,
      accuracy: Math.round((correct / total) * 100),
      wpm: Math.round((correct / elapsed) * 60),
      targetWpm: paragraphData.target_wpm, timeTaken: elapsed,
      skippedWords: states.filter(w => w.status === 'skipped').map(w => w.word.replace(/[^a-zA-Z]/g, '')).filter(Boolean).slice(0, 8),
    })
  }

  const handleNewParagraph = () => setFetchKey(k => k + 1)

  const handleTryAgain = () => {
    if (!paragraphData) return
    stopRecognition(); clearAllTimers()
    finalWordsRef.current = []; highWaterRef.current = 0
    setPhase('ready'); setUserIdx(0); setIdealIdx(0); setElapsedSecs(0); setResult(null)
    const words = paragraphData.paragraph.trim().split(/\s+/)
    setWordStates(words.map((w, i) => ({ word: w, status: (i === 0 ? 'current' : 'unread') as WordStatus })))
  }

  const renderParagraph = (interactive: boolean) => {
    if (!paragraphData) return null
    const words = paragraphData.paragraph.trim().split(/\s+/)
    return (
      <div style={{ maxHeight: interactive ? '260px' : 'none', overflowY: interactive ? 'auto' : 'visible', padding: '1.5rem 0', scrollbarWidth: 'none' }}>
        <p style={{ fontSize: 'clamp(1.1rem, 2.5vw, 1.3rem)', lineHeight: 2.2, letterSpacing: '0.01em' }}>
          {words.map((word, i) => {
            const status    = wordStates[i]?.status ?? 'unread'
            const isCurrent = status === 'current'
            const isIdeal   = interactive && i === idealIdx && !isCurrent && status !== 'correct' && status !== 'skipped'
            let bg = 'transparent', color = 'hsl(var(--foreground))', weight = 400, decoration = 'none'
            if (status === 'correct')      { color = 'hsl(var(--muted-foreground))' }
            else if (status === 'skipped') { color = '#e05252'; weight = 500; decoration = 'underline' }
            else if (isCurrent)            { bg = 'hsl(var(--foreground))'; color = 'hsl(var(--background))'; weight = 700 }
            if (isIdeal)                   { color = 'hsl(var(--foreground) / 0.4)'; decoration = 'underline' }
            return (
              <span key={i}
                ref={isCurrent && interactive ? (el) => { activeWordRef.current = el } : undefined}
                style={{ background: bg, color, fontWeight: weight, textDecoration: decoration, padding: isCurrent ? '0.15em 0.3em' : '0.15em 0.05em', borderRadius: 3, transition: 'background 0.1s, color 0.1s', marginRight: '0.2em', display: 'inline-block', scrollMargin: '80px' }}
              >{word}</span>
            )
          })}
        </p>
      </div>
    )
  }

  const fmtTime = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
  const totalWords = paragraphData?.paragraph.trim().split(/\s+/).length ?? 0

  return (
    <div style={{ minHeight: '100vh', padding: '0 1.5rem 6rem' }}>
      <Link href="/" style={{ position: 'fixed', top: '1.25rem', left: '1.5rem', zIndex: 60, ...ey, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.4rem' }} onMouseEnter={e => (e.currentTarget.style.color = 'hsl(var(--foreground))')} onMouseLeave={e => (e.currentTarget.style.color = 'hsl(var(--muted-foreground))')}>← Home</Link>

      <AnimatePresence mode="wait">

        {phase === 'loading' && (
          <motion.div key="loading" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', gap: '1.5rem' }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <p style={{ ...ey }}>Reading Practice</p>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(2rem, 5vw, 3rem)', letterSpacing: '-0.02em', textAlign: 'center' }}>Preparing your<br />paragraph…</h1>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', width: '100%', maxWidth: '36rem' }}>
              {[120, 200, 160].map((w, i) => (
                <motion.div key={i} style={{ height: '18px', width: `${w * 0.5}px`, background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} animate={{ opacity: [0.3, 0.7, 0.3] }} transition={{ duration: 1.4, delay: i * 0.2, repeat: Infinity }} />
              ))}
            </div>
          </motion.div>
        )}

        {phase === 'error' && (
          <motion.div key="error" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', gap: '1.5rem', textAlign: 'center' }} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <p style={{ fontSize: '0.95rem', color: 'hsl(var(--muted-foreground))', maxWidth: '24rem', lineHeight: 1.7 }}>{errorMsg}</p>
            <motion.button onClick={handleNewParagraph} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.96 }} style={{ padding: '0.9rem 2.5rem', background: 'hsl(var(--foreground))', color: 'hsl(var(--background))', border: 'none', fontSize: '0.82rem', letterSpacing: '0.14em', textTransform: 'uppercase', cursor: 'pointer' }}>Try again</motion.button>
          </motion.div>
        )}

        {phase === 'ready' && paragraphData && (
          <motion.div key="ready" style={{ maxWidth: '44rem', margin: '0 auto', paddingTop: 'clamp(5rem, 10vw, 7rem)' }} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}>
            <div style={{ marginBottom: '2.5rem' }}>
              <p style={{ ...ey, marginBottom: '0.75rem' }}>Reading Practice</p>
              <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.8rem, 4vw, 2.8rem)', letterSpacing: '-0.02em', lineHeight: 1.1, marginBottom: '0.5rem' }}>{paragraphData.topic}</h1>
              <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
                <span style={{ ...ey }}>{paragraphData.word_count} words</span>
                <span style={{ ...ey }}>Target: {paragraphData.target_wpm} WPM</span>
                <span style={{ ...ey }}>{profile.difficulty}</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.5rem', padding: '0.75rem 1rem', border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))' }}>
              {[{ bg: 'hsl(var(--foreground))', label: 'Your word' }, { bg: 'hsl(var(--foreground) / 0.15)', label: 'Ideal pace' }, { bg: 'transparent', label: 'Skipped (red)' }].map(item => (
                <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span style={{ display: 'inline-block', width: '14px', height: '14px', background: item.bg, border: '1px solid hsl(var(--border))', borderRadius: 2 }} />
                  <span style={{ fontSize: '0.75rem', color: 'hsl(var(--muted-foreground))' }}>{item.label}</span>
                </div>
              ))}
            </div>
            <div style={{ padding: '1.75rem 2rem', border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))', marginBottom: '2.5rem' }}>
              <p style={{ fontSize: '1rem', lineHeight: 1.9, color: 'hsl(var(--muted-foreground))' }}>{paragraphData.paragraph}</p>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem' }}>
              <motion.button onClick={handleStart} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.96 }} style={{ flex: 2, padding: '1rem 0', background: 'hsl(var(--foreground))', color: 'hsl(var(--background))', border: 'none', fontSize: '0.85rem', letterSpacing: '0.14em', textTransform: 'uppercase', cursor: 'pointer' }}>Start reading →</motion.button>
              <button disabled style={{ flex: 1, padding: '1rem 0', background: 'transparent', color: 'hsl(var(--muted-foreground))', border: '1px solid hsl(var(--border))', fontSize: '0.72rem', letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'not-allowed', opacity: 0.45, lineHeight: 1.5 }}>Play with friend<br /><span style={{ fontSize: '0.6rem' }}>coming soon</span></button>
            </div>
            <button onClick={handleNewParagraph} style={{ ...ey, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>↻ Generate different paragraph</button>
          </motion.div>
        )}

        {phase === 'countdown' && (
          <motion.div key="countdown" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <AnimatePresence mode="wait">
              <motion.span key={countdown} style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(8rem, 20vw, 14rem)', lineHeight: 1, letterSpacing: '-0.04em' }} initial={{ scale: 1.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.6, opacity: 0 }} transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}>{countdown}</motion.span>
            </AnimatePresence>
            <p style={{ ...ey, marginTop: '2rem' }}>Get ready to speak</p>
          </motion.div>
        )}

        {phase === 'reading' && paragraphData && (
          <motion.div key="reading" style={{ maxWidth: '44rem', margin: '0 auto', paddingTop: 'clamp(5rem, 10vw, 7rem)' }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
                <span style={{ ...ey }}>{userIdx}/{totalWords}</span>
                <span style={{ ...ey, color: userIdx >= idealIdx ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))' }}>{userIdx >= idealIdx ? '✓ on pace' : 'behind pace'}</span>
                {wordStates.filter(w => w.status === 'skipped').length > 0 && (
                  <span style={{ fontSize: '0.72rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#e05252' }}>{wordStates.filter(w => w.status === 'skipped').length} skipped</span>
                )}
              </div>
              <span style={{ fontSize: '1rem', fontVariantNumeric: 'tabular-nums', letterSpacing: '0.15em', color: 'hsl(var(--muted-foreground))' }}>{fmtTime(elapsedSecs)}</span>
            </div>
            <div style={{ height: '3px', background: 'hsl(var(--border))', marginBottom: '1.5rem', position: 'relative', borderRadius: '999px' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, height: '100%', background: 'hsl(var(--foreground) / 0.2)', borderRadius: '999px', transition: 'width 0.5s linear', width: `${(idealIdx / totalWords) * 100}%` }} />
              <motion.div style={{ position: 'absolute', top: 0, left: 0, height: '100%', background: 'hsl(var(--foreground))', borderRadius: '999px' }} animate={{ width: `${(userIdx / totalWords) * 100}%` }} transition={{ duration: 0.15 }} />
            </div>
            <div style={{ border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))', padding: '0.5rem 2rem', marginBottom: '1.5rem' }}>{renderParagraph(true)}</div>
            <p style={{ ...ey, textAlign: 'center', marginBottom: '1.5rem' }}>Skip a word? Just say the next one — skipped words turn red</p>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <motion.button onClick={handleFinishEarly} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.96 }} style={{ padding: '0.75rem 2rem', border: '1px solid hsl(var(--border))', background: 'transparent', color: 'hsl(var(--muted-foreground))', fontSize: '0.78rem', letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer' }}>Finish early</motion.button>
            </div>
          </motion.div>
        )}

        {phase === 'finished' && result && paragraphData && (
          <motion.div key="results" style={{ maxWidth: '36rem', margin: '0 auto', paddingTop: 'clamp(5rem, 10vw, 7rem)', paddingBottom: '6rem' }} initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}>
            <div style={{ marginBottom: '3rem' }}>
              <p style={{ ...ey, marginBottom: '0.75rem' }}>Reading Complete</p>
              <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(2rem, 6vw, 3.6rem)', letterSpacing: '-0.02em', lineHeight: 1.1 }}>{paragraphData.topic}</h1>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem', marginBottom: '2.5rem' }}>
              {[
                { label: 'Accuracy', value: `${result.accuracy}%`, sub: `${result.wordsCorrect} of ${result.totalWords} words` },
                { label: 'Speed', value: `${result.wpm} WPM`, sub: `Target: ${result.targetWpm} WPM` },
                { label: 'Skipped', value: String(result.wordsSkipped), sub: result.wordsSkipped === 0 ? 'Perfect!' : 'words skipped' },
                { label: 'Time', value: fmtTime(result.timeTaken), sub: result.wpm >= result.targetWpm ? 'On pace' : 'Keep going' },
              ].map(stat => (
                <div key={stat.label} style={{ padding: '1.5rem', border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))' }}>
                  <p style={{ ...ey, marginBottom: '0.5rem' }}>{stat.label}</p>
                  <p style={{ fontFamily: 'var(--font-display)', fontSize: '1.9rem', letterSpacing: '-0.02em', lineHeight: 1, marginBottom: '0.3rem' }}>{stat.value}</p>
                  <p style={{ fontSize: '0.78rem', color: 'hsl(var(--muted-foreground))' }}>{stat.sub}</p>
                </div>
              ))}
            </div>
            {result.skippedWords.length > 0 && (
              <div style={{ marginBottom: '2rem' }}>
                <p style={{ ...ey, marginBottom: '0.75rem' }}>Words you skipped</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  {result.skippedWords.map(w => <span key={w} style={{ padding: '0.3rem 0.75rem', border: '1px solid #e05252', color: '#e05252', fontSize: '0.85rem' }}>{w}</span>)}
                </div>
              </div>
            )}
            <div style={{ marginBottom: '2rem' }}>
              <p style={{ ...ey, marginBottom: '0.75rem' }}>Your reading</p>
              <div style={{ padding: '1.5rem', border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))' }}>{renderParagraph(false)}</div>
            </div>
            <div style={{ padding: '1.25rem 1.5rem', border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))', marginBottom: '2.5rem' }}>
              <p style={{ ...ey, marginBottom: '0.5rem' }}>Feedback</p>
              <p style={{ fontSize: '0.92rem', lineHeight: 1.7 }}>
                {result.accuracy >= 90 && result.wpm >= result.targetWpm ? `Excellent. ${result.accuracy}% accuracy at ${result.wpm} WPM — above your ${result.targetWpm} WPM target.`
                  : result.wordsSkipped > 3 ? `You skipped ${result.wordsSkipped} words. Focus on: ${result.skippedWords.slice(0, 3).join(', ')}.`
                  : result.wpm < result.targetWpm * 0.8 ? `${result.wpm} WPM against a ${result.targetWpm} WPM target. Reduce pauses.`
                  : `${result.accuracy}% accuracy at ${result.wpm} WPM. ${result.wordsSkipped > 0 ? `Work on the ${result.wordsSkipped} skipped word${result.wordsSkipped > 1 ? 's' : ''}.` : 'Clean reading!'}`}
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <motion.button onClick={handleNewParagraph} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.96 }} style={{ flex: 1, padding: '0.9rem 0', border: '1px solid hsl(var(--border))', background: 'transparent', color: 'hsl(var(--foreground))', fontSize: '0.78rem', letterSpacing: '0.14em', textTransform: 'uppercase', cursor: 'pointer' }}>New paragraph</motion.button>
              <motion.button onClick={handleTryAgain} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.96 }} style={{ flex: 1, padding: '0.9rem 0', background: 'hsl(var(--foreground))', color: 'hsl(var(--background))', border: 'none', fontSize: '0.78rem', letterSpacing: '0.14em', textTransform: 'uppercase', cursor: 'pointer' }}>Try again →</motion.button>
            </div>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  )
}
