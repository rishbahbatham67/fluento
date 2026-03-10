'use client'

import { motion } from 'framer-motion'

interface PageBrandProps {
  label: string
}

export function PageBrand({ label }: PageBrandProps) {
  return (
    <motion.div
      style={{
        position:      'fixed',
        bottom:        '1.5rem',
        right:         '1.5rem',
        zIndex:        40,
        display:       'flex',
        alignItems:    'baseline',
        gap:           '0.5rem',
        pointerEvents: 'none',
        userSelect:    'none',
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 1, duration: 0.6 }}
    >
      <span style={{
        fontFamily:    'var(--font-display)',
        fontSize:      '0.85rem',
        letterSpacing: '-0.01em',
        color:         'hsl(var(--foreground) / 0.18)',
      }}>
        Fluento
      </span>
      <span style={{
        fontSize:      '0.65rem',
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        color:         'hsl(var(--foreground) / 0.12)',
      }}>
        {label}
      </span>
    </motion.div>
  )
}
