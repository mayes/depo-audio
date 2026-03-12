import { useState, useRef, useCallback, useEffect } from 'react'
import { convertFileSrc } from '@tauri-apps/api/core'

const VOL_KEY = 'depoaudio:volume'
const REPEAT_KEY = 'depoaudio:repeat'

export default function usePlayer() {
  const audioRef = useRef(null)
  const [queue, setQueue] = useState([])
  const [currentIndex, setCurrentIndex] = useState(-1)
  const [playing, setPlaying] = useState(false)
  const [current, setCurrent] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolumeState] = useState(() => {
    const v = localStorage.getItem(VOL_KEY)
    return v !== null ? parseFloat(v) : 0.8
  })
  const [repeat, setRepeatState] = useState(() => localStorage.getItem(REPEAT_KEY) || 'off')
  const [shuffle, setShuffle] = useState(false)
  const [queueOpen, setQueueOpen] = useState(false)

  const track = currentIndex >= 0 && currentIndex < queue.length ? queue[currentIndex] : null

  // Sync volume to audio element and persist
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume
    localStorage.setItem(VOL_KEY, String(volume))
  }, [volume])

  useEffect(() => {
    localStorage.setItem(REPEAT_KEY, repeat)
  }, [repeat])

  // Load new track when currentIndex or queue changes
  useEffect(() => {
    const a = audioRef.current
    if (!a || !track) return
    const src = convertFileSrc(track.path)
    if (a.src !== src) {
      a.src = src
      a.load()
    }
  }, [track])

  const play = useCallback((file) => {
    const idx = queue.findIndex(f => f.path === file.path)
    if (idx >= 0) {
      setCurrentIndex(idx)
    } else {
      setQueue(prev => [...prev, file])
      setCurrentIndex(prev => prev < 0 ? 0 : queue.length)
    }
    // Playback starts via onCanPlay
    setPlaying(true)
  }, [queue])

  const playAll = useCallback((files) => {
    if (!files.length) return
    setQueue(files)
    setCurrentIndex(0)
    setPlaying(true)
  }, [])

  const addToQueue = useCallback((files) => {
    setQueue(prev => {
      const paths = new Set(prev.map(f => f.path))
      const newFiles = files.filter(f => !paths.has(f.path))
      return [...prev, ...newFiles]
    })
  }, [])

  const removeFromQueue = useCallback((index) => {
    setQueue(prev => {
      const next = prev.filter((_, i) => i !== index)
      return next
    })
    setCurrentIndex(prev => {
      if (index < prev) return prev - 1
      if (index === prev) {
        // Current track removed — stay at same index (next track slides in)
        return prev
      }
      return prev
    })
  }, [])

  const clearQueue = useCallback(() => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = '' }
    setQueue([])
    setCurrentIndex(-1)
    setPlaying(false)
    setCurrent(0)
    setDuration(0)
  }, [])

  const toggle = useCallback(() => {
    const a = audioRef.current
    if (!a || !track) return
    if (playing) {
      a.pause()
      setPlaying(false)
    } else {
      a.play().then(() => setPlaying(true)).catch(() => {})
    }
  }, [playing, track])

  const seek = useCallback((e) => {
    if (!audioRef.current || !duration) return
    const r = e.currentTarget.getBoundingClientRect()
    audioRef.current.currentTime = ((e.clientX - r.left) / r.width) * duration
  }, [duration])

  const setVolume = useCallback((v) => {
    setVolumeState(Math.max(0, Math.min(1, v)))
  }, [])

  const cycleRepeat = useCallback(() => {
    setRepeatState(prev => prev === 'off' ? 'all' : prev === 'all' ? 'one' : 'off')
  }, [])

  const nextTrack = useCallback(() => {
    if (queue.length === 0) return
    if (shuffle) {
      const idx = Math.floor(Math.random() * queue.length)
      setCurrentIndex(idx)
    } else {
      setCurrentIndex(prev => {
        const next = prev + 1
        if (next >= queue.length) {
          if (repeat === 'all') return 0
          setPlaying(false)
          return prev
        }
        return next
      })
    }
    setPlaying(true)
  }, [queue.length, shuffle, repeat])

  const prevTrack = useCallback(() => {
    if (queue.length === 0) return
    const a = audioRef.current
    // If more than 3s in, restart current track
    if (a && a.currentTime > 3) {
      a.currentTime = 0
      return
    }
    setCurrentIndex(prev => {
      if (prev <= 0) return repeat === 'all' ? queue.length - 1 : 0
      return prev - 1
    })
    setPlaying(true)
  }, [queue.length, repeat])

  // Audio element event handlers
  const onCanPlay = useCallback(() => {
    if (playing && audioRef.current) {
      audioRef.current.play().catch(() => {})
    }
  }, [playing])

  const onLoadedMetadata = useCallback((e) => {
    setDuration(e.target.duration)
    setCurrent(0)
  }, [])

  const onTimeUpdate = useCallback((e) => {
    setCurrent(e.target.currentTime)
  }, [])

  const onEnded = useCallback(() => {
    if (repeat === 'one') {
      const a = audioRef.current
      if (a) { a.currentTime = 0; a.play().catch(() => {}) }
      return
    }
    nextTrack()
  }, [repeat, nextTrack])

  const handlers = { onCanPlay, onLoadedMetadata, onTimeUpdate, onEnded }

  return {
    audioRef, queue, currentIndex, track, playing, current, duration,
    volume, repeat, shuffle, queueOpen,
    play, playAll, addToQueue, removeFromQueue, clearQueue,
    toggle, seek, setVolume, cycleRepeat,
    setShuffle: () => setShuffle(p => !p),
    setQueueOpen: () => setQueueOpen(p => !p),
    nextTrack, prevTrack, handlers,
  }
}
