import { useState, useEffect, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'

export default function usePreferences() {
  const [mode, setMode]           = useState('stereo')
  const [formatOut, setFormatOut] = useState('wav')
  const [labels, setLabels]       = useState(['Reporter','Witness','Attorney 1','Attorney 2'])
  const [chanVols, setChanVols]   = useState([1,1,1,1])
  const [outDir, setOutDir]       = useState('')
  const [rate, setRate]           = useState('48000')
  const [normalize, setNormalize] = useState(false)
  const [trim, setTrim]           = useState(false)
  const [fade, setFade]           = useState(false)
  const [fadeDur, setFadeDur]     = useState(0.5)
  const [hpf, setHpf]             = useState(false)
  const [mp3Bitrate, setMp3Bitrate] = useState('192k')
  const [prefsReady, setPrefsReady] = useState(false)

  // Load prefs on mount
  useEffect(() => {
    invoke('prefs_get').then(p => {
      if (p.mode)      setMode(p.mode)
      if (p.format)    setFormatOut(p.format)
      if (p.rate)      setRate(p.rate)
      if (p.outDir !== undefined) setOutDir(p.outDir)
      if (p.labels?.length) setLabels(p.labels)
      if (p.chanVols?.length) setChanVols(p.chanVols)
      setNormalize(!!p.normalize); setTrim(!!p.trim)
      setFade(!!p.fade); setFadeDur(p.fadeDur || 0.5); setHpf(!!p.hpf)
      if (p.mp3Bitrate) setMp3Bitrate(p.mp3Bitrate)
      setPrefsReady(true)
    }).catch(() => setPrefsReady(true))
  }, [])

  // Persist prefs on change
  useEffect(() => {
    if (!prefsReady) return
    invoke('prefs_set', { patch: { mode, format: formatOut, rate, outDir, labels, chanVols, normalize, trim, fade, fadeDur, hpf, mp3Bitrate } })
  }, [mode, formatOut, rate, outDir, labels, chanVols, normalize, trim, fade, fadeDur, hpf, mp3Bitrate, prefsReady])

  const resizeForChannels = useCallback((n) => {
    setLabels(prev => {
      if (prev.length === n) return prev
      if (n > prev.length) return [...prev, ...Array.from({ length: n - prev.length }, (_, i) => `Channel ${prev.length + i + 1}`)]
      return prev.slice(0, n)
    })
    setChanVols(prev => {
      if (prev.length === n) return prev
      if (n > prev.length) return [...prev, ...Array(n - prev.length).fill(1.0)]
      return prev.slice(0, n)
    })
  }, [])

  return {
    mode, setMode,
    formatOut, setFormatOut,
    labels, setLabels,
    chanVols, setChanVols,
    outDir, setOutDir,
    rate, setRate,
    normalize, setNormalize,
    trim, setTrim,
    fade, setFade,
    fadeDur, setFadeDur,
    hpf, setHpf,
    mp3Bitrate, setMp3Bitrate,
    resizeForChannels,
    prefsReady,
  }
}
