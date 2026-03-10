'use client'

import type { Metadata } from 'next'
import { DM_Serif_Display, DM_Mono } from 'next/font/google'
import { ThemeProvider } from 'next-themes'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { UserProvider } from '@/lib/userContext'
import { FluentoIntro } from '@/components/ui/FluentoIntro'
import { useState, useEffect } from 'react'
import './globals.css'

const dmSerifDisplay = DM_Serif_Display({
  weight:   '400',
  subsets:  ['latin'],
  variable: '--font-display',
  display:  'swap',
})

const dmMono = DM_Mono({
  weight:  ['300', '400', '500'],
  subsets: ['latin'],
  variable: '--font-mono',
  display:  'swap',
})

// Metadata cannot be exported from a 'use client' file,
// so move it to a separate metadata file or keep this as a server wrapper.
// For now we keep the client component pattern since we need useState.

function RootLayoutInner({ children }: { children: React.ReactNode }) {
  const [introShown, setIntroShown] = useState(false)
  const [showContent, setShowContent] = useState(false)

  useEffect(() => {
    // Only show intro once per browser session
    //const seen = sessionStorage.getItem('fluento_intro_seen')
    const seen = false
    if (seen) {
      setIntroShown(true)
      setShowContent(true)
    } else {
      setIntroShown(false)
      setShowContent(false)
    }
  }, [])

  const handleIntroComplete = () => {
    sessionStorage.setItem('fluento_intro_seen', '1')
    setIntroShown(true)
    setShowContent(true)
  }

  return (
    <>
      {!introShown && <FluentoIntro onComplete={handleIntroComplete} />}

      <header style={{
        position:       'fixed',
        top:            0,
        left:           0,
        right:          0,
        zIndex:         50,
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'space-between',
        padding:        '1.25rem 2.5rem',
        opacity:        showContent ? 1 : 0,
        transition:     'opacity 0.4s ease',
      }}>
        <a href="/" style={{
          fontFamily:    'var(--font-display)',
          fontSize:      '1.05rem',
          color:         'hsl(var(--foreground))',
          textDecoration: 'none',
          letterSpacing: '-0.01em',
        }}>
          Fluento
        </a>
        <ThemeToggle />
      </header>

      <main style={{
        minHeight:  '100vh',
        paddingTop: '4rem',
        opacity:    showContent ? 1 : 0,
        transition: 'opacity 0.4s ease 0.1s',
      }}>
        {children}
      </main>
    </>
  )
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${dmSerifDisplay.variable} ${dmMono.variable}`}>
      <body suppressHydrationWarning>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
          <UserProvider>
            <RootLayoutInner>{children}</RootLayoutInner>
          </UserProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
