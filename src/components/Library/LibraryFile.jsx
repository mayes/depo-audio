import { fmtSize, basename } from '../../utils'

export default function LibraryFile({ file, player }) {
  const isActive = player?.track?.path === file.path

  const handlePlay = () => {
    if (player) player.play({ path: file.path, name: basename(file.path), format: file.format, size: file.size })
  }

  return (
    <div className="lib-file">
      <span className={`lib-fmt-badge lib-fmt-badge--${file.format}`}>{file.format.toUpperCase()}</span>
      <span className="lib-file-name" title={file.path}>{basename(file.path)}</span>
      <span className="lib-file-size">{fmtSize(file.size)}</span>
      <button className={`play-btn${isActive ? ' fi--active' : ''}`} onClick={handlePlay}
        aria-label={isActive && player.playing ? 'Pause' : `Play ${basename(file.path)}`}>
        {isActive && player.playing
          ? <svg width="10" height="10" viewBox="0 0 10 10"><rect x="1" y="1" width="3" height="8" rx="1" fill="currentColor"/><rect x="6" y="1" width="3" height="8" rx="1" fill="currentColor"/></svg>
          : <svg width="10" height="10" viewBox="0 0 10 10"><path d="M2 1.5l7 3.5-7 3.5V1.5z" fill="currentColor"/></svg>}
      </button>
    </div>
  )
}
