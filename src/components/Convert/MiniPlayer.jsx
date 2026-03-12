import { fmtSize } from '../../utils'

export default function MiniPlayer({ out, color, multi, player }) {
  const isActive = player?.track?.path === out.path

  const handlePlay = () => {
    if (player) player.play({ path: out.path, name: out.name, size: out.size })
  }

  return (
    <div className="out-row">
      {multi && <span className="out-dot" style={{color}}>▮</span>}
      <span className="out-name" title={out.path}>{out.name}</span>
      <span className="out-size">{fmtSize(out.size)}</span>
      <div className="mini-player">
        <button className="play-btn" onClick={handlePlay} aria-label={isActive && player.playing ? 'Pause' : `Play ${out.name}`}>
          {isActive && player.playing
            ? <svg width="10" height="10" viewBox="0 0 10 10"><rect x="1" y="1" width="3" height="8" rx="1" fill="currentColor"/><rect x="6" y="1" width="3" height="8" rx="1" fill="currentColor"/></svg>
            : <svg width="10" height="10" viewBox="0 0 10 10"><path d="M2 1.5l7 3.5-7 3.5V1.5z" fill="currentColor"/></svg>}
        </button>
      </div>
    </div>
  )
}
