'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

export function FluentoIntro({ onComplete }: { onComplete: () => void }) {
  const [phase, setPhase] = useState<'big' | 'shrink' | 'done'>('big')

  useEffect(() => {
    // Stay big for 1.1s, then shrink
    const t1 = setTimeout(() => setPhase('shrink'), 1100)
    // After shrink animation (0.7s), tell parent we're done
    const t2 = setTimeout(() => {
      setPhase('done')
      onComplete()
    }, 1900)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [onComplete])

  return (
    <AnimatePresence>
      {phase !== 'done' && (
        <motion.div
          key="intro"
          style={{
            position:        'fixed',
            inset:           0,
            zIndex:          9999,
            display:         'flex',
            alignItems:      'center',
            justifyContent:  'center',
            background:      'hsl(var(--background))',
            pointerEvents:   'none',
          }}
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5, ease: 'easeInOut' }}
        >
          <motion.h1
            style={{
              fontFamily:    'var(--font-display)',
              letterSpacing: '-0.04em',
              lineHeight:    1,
              color:         'hsl(var(--foreground))',
              margin:        0,
              transformOrigin: 'center center',
            }}
            initial={{ fontSize: 'clamp(5rem, 20vw, 14rem)', opacity: 0, y: 20 }}
            animate={
              phase === 'big'
                ? { fontSize: 'clamp(5rem, 20vw, 14rem)', opacity: 1, y: 0 }
                : { fontSize: 'clamp(1rem, 2vw, 1.1rem)', opacity: 1, y: 0 }
            }
            transition={
              phase === 'big'
                ? { duration: 0.7, ease: [0.22, 1, 0.36, 1] }
                : { duration: 0.65, ease: [0.76, 0, 0.24, 1] }
            }
          >
            Fluento
          </motion.h1>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
