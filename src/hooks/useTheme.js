import { useState, useEffect, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'

export default function useTheme() {
  const [theme, setTheme]         = useState('dark')
  const [themePref, setThemePref] = useState('system')

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = (pref) => {
      const resolved = pref === 'system' ? (mq.matches ? 'dark' : 'light') : pref
      setTheme(resolved)
      document.documentElement.setAttribute('data-theme', resolved)
      document.documentElement.style.background = resolved === 'light' ? '#f5f0e8' : '#0d1117'
      try { localStorage.setItem('depoaudio-theme', resolved) } catch {}
    }
    const saved = localStorage.getItem('depoaudio-theme') || 'dark'
    setThemePref(saved === 'light' ? 'light' : saved === 'system' ? 'system' : 'dark')
    apply(saved)
  }, [])

  const cycleTheme = useCallback(() => {
    const next = themePref === 'system' ? 'dark' : themePref === 'dark' ? 'light' : 'system'
    setThemePref(next)
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const resolved = next === 'system' ? (mq.matches ? 'dark' : 'light') : next
    setTheme(resolved)
    document.documentElement.setAttribute('data-theme', resolved)
    document.documentElement.style.background = resolved === 'light' ? '#f5f0e8' : '#0d1117'
    try { localStorage.setItem('depoaudio-theme', next) } catch {}
    invoke('prefs_set', { patch: { theme: next } }).catch(() => {})
  }, [themePref])

  const themeLabel = themePref === 'system' ? '⊙' : themePref === 'dark' ? '☾' : '☀'

  return { theme, themePref, themeLabel, cycleTheme }
}
