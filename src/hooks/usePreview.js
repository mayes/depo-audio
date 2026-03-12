import { useState, useCallback, useRef, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { convertFileSrc } from '@tauri-apps/api/core'

function cacheKey(params) {
  return JSON.stringify([
    params.srcPath, params.previewType, params.channel ?? null,
    params.chanVols, params.startSec, params.duration,
    params.normalize, params.trim, params.fade, params.fadeDur, params.hpf,
    params.mode,
  ])
}

export default function usePreview() {
  const [cache, setCache]           = useState({})   // { [key]: { status, path } }
  const [activeKey, setActiveKey]   = useState(null)
  const audioRef                    = useRef(null)

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
      audioRef.current.src = ''
    }
    setActiveKey(null)
  }, [])

  const generateAndPlay = useCallback(async (params) => {
    const key = cacheKey(params)

    // If this key is already playing, toggle stop
    if (activeKey === key) { stop(); return }

    // Stop any other preview
    stop()

    // If cached and ready, play immediately
    const cached = cache[key]
    if (cached?.status === 'ready' && cached.path) {
      setActiveKey(key)
      if (audioRef.current) {
        audioRef.current.src = convertFileSrc(cached.path)
        audioRef.current.play().catch(() => {})
      }
      return
    }

    // Set loading state
    setCache(prev => ({ ...prev, [key]: { status: 'loading', path: null } }))

    try {
      const path = await invoke('generate_preview', {
        req: {
          srcPath:     params.srcPath,
          previewType: params.previewType,
          channel:     params.channel ?? null,
          chanVols:    params.chanVols ?? [1, 1, 1, 1],
          startSec:    params.startSec ?? 30,
          duration:    params.duration ?? 15,
          normalize:   params.normalize ?? false,
          trim:        params.trim ?? false,
          fade:        params.fade ?? false,
          fadeDur:     params.fadeDur ?? 0.5,
          hpf:         params.hpf ?? false,
          mode:        params.mode ?? 'stereo',
        }
      })

      setCache(prev => ({ ...prev, [key]: { status: 'ready', path } }))
      setActiveKey(key)
      if (audioRef.current) {
        audioRef.current.src = convertFileSrc(path)
        audioRef.current.play().catch(() => {})
      }
    } catch (err) {
      setCache(prev => ({ ...prev, [key]: { status: 'error', path: null } }))
      console.error('Preview failed:', err)
    }
  }, [activeKey, cache, stop])

  const clearCache = useCallback(() => {
    stop()
    setCache({})
  }, [stop])

  const cleanup = useCallback(() => {
    stop()
    setCache({})
    invoke('cleanup_previews').catch(() => {})
  }, [stop])

  // Handle audio ended
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const onEnded = () => setActiveKey(null)
    audio.addEventListener('ended', onEnded)
    return () => audio.removeEventListener('ended', onEnded)
  }, [])

  return { generateAndPlay, stop, clearCache, cleanup, cache, activeKey, audioRef, cacheKey }
}

export { cacheKey }
