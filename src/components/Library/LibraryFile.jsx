import { convertFileSrc } from '@tauri-apps/api/core'
import { fmtSize, fmtTime, basename } from '../../utils'
import useAudioPlayer from '../../hooks/useAudioPlayer'

export default function LibraryFile({ file }) {
  const { audioRef, playing, current, duration, toggle, seek, handlers } = useAudioPlayer()
  const src = convertFileSrc(file.path)

  return (
    <div className="lib-file">
      <audio ref={audioRef} src={src} preload="metadata" {...handlers} />
      <span className={`lib-fmt-badge lib-fmt-badge--${file.format}`}>{file.format.toUpperCase()}</span>
      <span className="lib-file-name" title={file.path}>{basename(file.path)}</span>
      <span className="lib-file-size">{fmtSize(file.size)}</span>
      <button className="play-btn" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'}>
        {playing
          ? <svg width="10" height="10" viewBox="0 0 10 10"><rect x="1" y="1" width="3" height="8" rx="1" fill="currentColor"/><rect x="6" y="1" width="3" height="8" rx="1" fill="currentColor"/></svg>
          : <svg width="10" height="10" viewBox="0 0 10 10"><path d="M2 1.5l7 3.5-7 3.5V1.5z" fill="currentColor"/></svg>}
      </button>
      {duration > 0 && (
        <div className="player-track" style={{width:'80px'}} onClick={seek} role="slider" aria-label="Seek" aria-valuenow={Math.round(current)} aria-valuemin={0} aria-valuemax={Math.round(duration)} tabIndex={0}>
          <div className="player-fill" style={{width:`${(current/duration)*100}%`}}/>
        </div>
      )}
      {duration > 0 && <span className="player-time">{fmtTime(current)}</span>}
    </div>
  )
}
