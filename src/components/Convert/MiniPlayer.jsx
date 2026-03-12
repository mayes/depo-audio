import { convertFileSrc } from '@tauri-apps/api/core'
import { fmtSize, fmtTime } from '../../utils'
import useAudioPlayer from '../../hooks/useAudioPlayer'

export default function MiniPlayer({ out, color, multi }) {
  const { audioRef, playing, current, duration, toggle, seek, handlers } = useAudioPlayer()
  const src = convertFileSrc(out.path)

  return (
    <div className="out-row">
      {multi && <span className="out-dot" style={{color}}>▮</span>}
      <span className="out-name" title={out.path}>{out.name}</span>
      <span className="out-size">{fmtSize(out.size)}</span>
      <audio ref={audioRef} src={src} preload="metadata" {...handlers} />
      <div className="mini-player">
        <button className="play-btn" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'}>
          {playing
            ? <svg width="10" height="10" viewBox="0 0 10 10"><rect x="1" y="1" width="3" height="8" rx="1" fill="currentColor"/><rect x="6" y="1" width="3" height="8" rx="1" fill="currentColor"/></svg>
            : <svg width="10" height="10" viewBox="0 0 10 10"><path d="M2 1.5l7 3.5-7 3.5V1.5z" fill="currentColor"/></svg>}
        </button>
        <div className="player-track" onClick={seek} role="slider" aria-label="Seek" aria-valuenow={Math.round(current)} aria-valuemin={0} aria-valuemax={Math.round(duration)} tabIndex={0}>
          <div className="player-fill" style={{width: duration ? `${(current/duration)*100}%` : '0%'}} />
        </div>
        {duration > 0 && <span className="player-time">{fmtTime(current)}/{fmtTime(duration)}</span>}
      </div>
    </div>
  )
}
