'use client'

import { motion, AnimatePresence } from 'framer-motion'

export type RecordState = 'idle' | 'recording' | 'processing'

interface RecordButtonProps {
  state:    RecordState
  onStart:  () => void
  onStop:   () => void
  disabled?: boolean
}

/* ─── Mic SVG icon ───────────────────────────────────────────────────────── */
function MicIcon({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor"
      strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <line x1="12" y1="19" x2="12" y2="22" />
      <line x1="9"  y1="22" x2="15" y2="22" />
    </svg>
  )
}

/* ─── Stop square icon ───────────────────────────────────────────────────── */
function StopIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24"
      fill="currentColor">
      <rect x="4" y="4" width="16" height="16" rx="2" />
    </svg>
  )
}

/* ─── Spinner icon ───────────────────────────────────────────────────────── */
function SpinnerIcon({ size = 22 }: { size?: number }) {
  return (
    <motion.svg
      width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round"
      animate={{ rotate: 360 }}
      transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
    >
      <path d="M12 2a10 10 0 0 1 10 10" />
    </motion.svg>
  )
}

/* ─── Component ──────────────────────────────────────────────────────────── */
export function RecordButton({ state, onStart, onStop, disabled }: RecordButtonProps) {
  const isRecording  = state === 'recording'
  const isProcessing = state === 'processing'
  const isIdle       = state === 'idle'

  const handleClick = () => {
    if (disabled || isProcessing) return
    if (isRecording) onStop()
    else onStart()
  }

  return (
    <div className="relative flex items-center justify-center">

      {/* ── Pulse rings — only while recording ── */}
      <AnimatePresence>
        {isRecording && (
          <>
            {[0, 1, 2].map((i) => (
              <motion.span
                key={i}
                className="absolute rounded-full border border-[hsl(var(--foreground)/0.15)]"
                style={{ width: 90 + i * 36, height: 90 + i * 36 }}
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: [0, 0.5, 0], scale: [0.85, 1.15, 1.35] }}
                exit={{ opacity: 0 }}
                transition={{
                  duration: 2.2,
                  delay: i * 0.5,
                  repeat: Infinity,
                  ease: 'easeOut',
                }}
              />
            ))}
          </>
        )}
      </AnimatePresence>

      {/* ── Main button ── */}
      <motion.button
        onClick={handleClick}
        disabled={disabled || isProcessing}
        whileHover={!disabled && !isProcessing ? { scale: 1.05 } : {}}
        whileTap={!disabled && !isProcessing ? { scale: 0.93 } : {}}
        className="
          relative z-10
          w-[88px] h-[88px] rounded-full
          flex items-center justify-center
          cursor-pointer select-none
          transition-colors duration-300
          disabled:opacity-40 disabled:cursor-not-allowed
        "
        style={{
          background: isRecording
            ? 'hsl(var(--foreground))'
            : 'transparent',
          color: isRecording
            ? 'hsl(var(--background))'
            : 'hsl(var(--foreground))',
          border: `1.5px solid hsl(var(--foreground) / ${isRecording ? '1' : '0.3'})`,
        }}
        animate={{
          borderColor: isRecording
            ? 'hsl(var(--foreground))'
            : 'hsl(var(--foreground) / 0.3)',
        }}
        transition={{ duration: 0.25 }}
      >
        <AnimatePresence mode="wait" initial={false}>
          {isIdle && (
            <motion.span key="mic"
              initial={{ scale: 0.7, opacity: 0 }}
              animate={{ scale: 1,   opacity: 1 }}
              exit={{    scale: 0.7, opacity: 0 }}
              transition={{ duration: 0.18 }}
            >
              <MicIcon size={28} />
            </motion.span>
          )}
          {isRecording && (
            <motion.span key="stop"
              initial={{ scale: 0.7, opacity: 0 }}
              animate={{ scale: 1,   opacity: 1 }}
              exit={{    scale: 0.7, opacity: 0 }}
              transition={{ duration: 0.18 }}
            >
              <StopIcon size={22} />
            </motion.span>
          )}
          {isProcessing && (
            <motion.span key="spin"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{    opacity: 0 }}
            >
              <SpinnerIcon size={22} />
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>

    </div>
  )
}
