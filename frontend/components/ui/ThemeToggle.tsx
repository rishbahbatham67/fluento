'use client'

import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  // Avoid hydration mismatch — only render after mount
  useEffect(() => setMounted(true), [])
  if (!mounted) return <div className="w-9 h-9" />

  const isDark = theme === 'dark'

  return (
    <motion.button
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      aria-label="Toggle theme"
      whileHover={{ scale: 1.08 }}
      whileTap={{ scale: 0.90 }}
      className="
        relative w-9 h-9 flex items-center justify-center
        rounded-full cursor-pointer
        border border-[hsl(var(--border))]
        bg-[hsl(var(--card))]
        text-[hsl(var(--muted-foreground))]
        hover:text-[hsl(var(--foreground))]
        transition-colors duration-200
      "
    >
      <AnimatePresence mode="wait" initial={false}>
        {isDark ? (
          <motion.svg
            key="moon"
            initial={{ rotate: -40, opacity: 0, scale: 0.7 }}
            animate={{ rotate: 0,   opacity: 1, scale: 1   }}
            exit={{    rotate: 40,  opacity: 0, scale: 0.7 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            width="15" height="15" viewBox="0 0 24 24"
            fill="none" stroke="currentColor"
            strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
          >
            <path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z" />
          </motion.svg>
        ) : (
          <motion.svg
            key="sun"
            initial={{ rotate: 40,  opacity: 0, scale: 0.7 }}
            animate={{ rotate: 0,   opacity: 1, scale: 1   }}
            exit={{    rotate: -40, opacity: 0, scale: 0.7 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            width="15" height="15" viewBox="0 0 24 24"
            fill="none" stroke="currentColor"
            strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="5" />
            <line x1="12" y1="1"  x2="12" y2="3"  />
            <line x1="12" y1="21" x2="12" y2="23" />
            <line x1="4.22"  y1="4.22"  x2="5.64"  y2="5.64"  />
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
            <line x1="1"  y1="12" x2="3"  y2="12" />
            <line x1="21" y1="12" x2="23" y2="12" />
            <line x1="4.22"  y1="19.78" x2="5.64"  y2="18.36" />
            <line x1="18.36" y1="5.64"  x2="19.78" y2="4.22"  />
          </motion.svg>
        )}
      </AnimatePresence>
    </motion.button>
  )
}
