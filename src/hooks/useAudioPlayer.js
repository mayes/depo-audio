import { useState, useRef } from 'react'

export default function useAudioPlayer() {
  const audioRef = useRef(null)
  const [playing, setPlaying] = useState(false)
  const [current, setCurrent] = useState(0)
  const [duration, setDuration] = useState(0)

  const toggle = () => {
    const a = audioRef.current
    if (!a) return
    if (playing) {
      a.pause()
      setPlaying(false)
    } else {
      a.play().then(() => setPlaying(true)).catch(() => {})
    }
  }

  const seek = (e) => {
    if (!audioRef.current || !duration) return
    const r = e.currentTarget.getBoundingClientRect()
    audioRef.current.currentTime = ((e.clientX - r.left) / r.width) * duration
  }

  const handlers = {
    onLoadedMetadata: (e) => setDuration(e.target.duration),
    onTimeUpdate:     (e) => setCurrent(e.target.currentTime),
    onEnded:          ()  => { setPlaying(false); setCurrent(0) },
  }

  return { audioRef, playing, current, duration, toggle, seek, handlers }
}
