'use client'

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'

export interface UserProfile {
  goals:      string    // e.g. "Job interviews, Business English"
  difficulty: string    // beginner | intermediate | advanced
  setupDone:  boolean
}

const DEFAULT: UserProfile = {
  goals:      '',
  difficulty: 'intermediate',
  setupDone:  false,
}

const UserContext = createContext<{
  profile:    UserProfile
  setProfile: (p: Partial<UserProfile>) => void
  clearProfile: () => void
}>({
  profile:      DEFAULT,
  setProfile:   () => {},
  clearProfile: () => {},
})

const STORAGE_KEY = 'fluento_profile'

export function UserProvider({ children }: { children: ReactNode }) {
  const [profile, setProfileState] = useState<UserProfile>(DEFAULT)
  const [mounted, setMounted]      = useState(false)

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) setProfileState(JSON.parse(stored))
    } catch {}
    setMounted(true)
  }, [])

  const setProfile = (partial: Partial<UserProfile>) => {
    setProfileState(prev => {
      const next = { ...prev, ...partial }
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch {}
      return next
    })
  }

  const clearProfile = () => {
    setProfileState(DEFAULT)
    try { localStorage.removeItem(STORAGE_KEY) } catch {}
  }

  if (!mounted) return null

  return (
    <UserContext.Provider value={{ profile, setProfile, clearProfile }}>
      {children}
    </UserContext.Provider>
  )
}

export const useUser = () => useContext(UserContext)
