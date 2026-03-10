'use client'

import { motion } from 'framer-motion'

interface AudioWaveformProps {
  isActive:   boolean   // true while recording
  barCount?:  number    // default 28
  height?:    number    // max bar height in px, default 48
}

/* ─── Helpers ────────────────────────────────────────────────────────────── */
/** Pre-compute random heights so they don't re-randomise on every render */
const BASE_HEIGHTS = Array.from({ length: 40 }, () =>
  0.15 + Math.random() * 0.85
)

export function AudioWaveform({
  isActive,
  barCount = 28,
  height   = 48,
}: AudioWaveformProps) {
  return (
    <div
      className="flex items-center justify-center gap-[3px]"
      style={{ height: height + 8 }}
      aria-hidden="true"
    >
      {Array.from({ length: barCount }, (_, i) => {
        const baseH   = BASE_HEIGHTS[i % BASE_HEIGHTS.length]
        const minH    = height * 0.08
        const activeH = height * baseH

        return (
          <motion.span
            key={i}
            className="rounded-full"
            style={{
              width:            3,
              background:       'hsl(var(--foreground))',
              display:          'block',
              transformOrigin:  'center',
            }}
            animate={
              isActive
                ? {
                    height: [minH, activeH, minH * 1.5, activeH * 0.7, minH],
                    opacity: [0.4, 1, 0.7, 1, 0.4],
                  }
                : {
                    height:  minH,
                    opacity: 0.18,
                  }
            }
            transition={
              isActive
                ? {
                    duration:   0.55 + Math.random() * 0.45,
                    delay:      (i / barCount) * 0.25,
                    repeat:     Infinity,
                    repeatType: 'mirror',
                    ease:       'easeInOut',
                  }
                : {
                    duration: 0.4,
                    ease:     'easeOut',
                  }
            }
          />
        )
      })}
    </div>
  )
}
