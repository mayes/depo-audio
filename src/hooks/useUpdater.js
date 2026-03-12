import { useState, useEffect } from 'react'
import { check } from '@tauri-apps/plugin-updater'

const SKIP_KEY = 'depoaudio:skippedVersion'

export default function useUpdater() {
  const [update, setUpdate]       = useState(null)   // { version, body, date }
  const [downloading, setDownloading] = useState(false)
  const [progress, setProgress]   = useState(0)       // 0–100
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        const available = await check()
        if (!available) return

        const skipped = localStorage.getItem(SKIP_KEY)
        if (skipped === available.version) return

        setUpdate({
          version: available.version,
          body:    available.body || '',
          date:    available.date || '',
          _raw:    available,
        })
      } catch {
        // silently ignore update check failures (offline, etc.)
      }
    }, 5000)

    return () => clearTimeout(timer)
  }, [])

  const skipVersion = () => {
    if (update) localStorage.setItem(SKIP_KEY, update.version)
    setDismissed(true)
  }

  const installUpdate = async () => {
    if (!update?._raw) return
    setDownloading(true)
    try {
      let total = 0
      await update._raw.downloadAndInstall((event) => {
        if (event.event === 'Started' && event.data?.contentLength) {
          total = event.data.contentLength
        } else if (event.event === 'Progress' && total > 0) {
          setProgress(prev => Math.min(100, prev + (event.data.chunkLength / total) * 100))
        } else if (event.event === 'Finished') {
          setProgress(100)
        }
      })
    } catch {
      setDownloading(false)
      setProgress(0)
    }
  }

  const dismiss = () => setDismissed(true)

  const visible = update && !dismissed

  return { update, visible, downloading, progress, skipVersion, installUpdate, dismiss }
}
