import { fmtTime, basename } from '../../utils'

export default function PlayerBar({ player }) {
  const { track, playing, current, duration, volume, repeat, shuffle, queueOpen,
          toggle, seek, setVolume, cycleRepeat, setShuffle, setQueueOpen,
          nextTrack, prevTrack } = player

  if (!track) return null

  const ext = track.name?.split('.').pop()?.toLowerCase() || ''
  const repeatLabel = repeat === 'off' ? 'Repeat off' : repeat === 'one' ? 'Repeat one' : 'Repeat all'
  const repeatIcon = repeat === 'one' ? '1' : ''

  return (
    <div className="player-bar" role="region" aria-label="Audio player">
      {/* Track info */}
      <div className="pb-track">
        <span className="pb-now-label" aria-live="polite">Now playing</span>
        {ext && <span className={`pb-fmt pb-fmt--${ext}`} aria-label={`Format: ${ext.toUpperCase()}`}>{ext.toUpperCase()}</span>}
        <span className="pb-name" title={track.path}>{basename(track.name || track.path)}</span>
      </div>

      {/* Transport controls */}
      <div className="pb-controls">
        <button className="pb-btn" onClick={prevTrack} aria-label="Previous track" title="Previous">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M3 2v10M12 2L5.5 7l6.5 5V2z" fill="currentColor"/>
          </svg>
        </button>
        <button className="pb-btn pb-btn--play" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'} title={playing ? 'Pause' : 'Play'}>
          {playing
            ? <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect x="3" y="2" width="4" height="12" rx="1" fill="currentColor"/><rect x="9" y="2" width="4" height="12" rx="1" fill="currentColor"/></svg>
            : <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M4 2l10 6-10 6V2z" fill="currentColor"/></svg>}
        </button>
        <button className="pb-btn" onClick={nextTrack} aria-label="Next track" title="Next">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M11 2v10M2 2l6.5 5L2 12V2z" fill="currentColor"/>
          </svg>
        </button>
      </div>

      {/* Seek bar */}
      <div className="pb-seek-wrap">
        <span className="pb-time" aria-hidden="true">{fmtTime(current)}</span>
        <div className="pb-seek" onClick={seek}
          role="slider" aria-label="Seek position"
          aria-valuenow={Math.round(current)} aria-valuemin={0} aria-valuemax={Math.round(duration)}
          aria-valuetext={`${fmtTime(current)} of ${fmtTime(duration)}`}
          tabIndex={0}>
          <div className="pb-seek-fill" style={{width: duration ? `${(current/duration)*100}%` : '0%'}} />
        </div>
        <span className="pb-time" aria-hidden="true">{fmtTime(duration)}</span>
      </div>

      {/* Right controls */}
      <div className="pb-right">
        <button className={`pb-btn pb-btn--sm${shuffle ? ' pb-btn--active' : ''}`}
          onClick={setShuffle} aria-label={`Shuffle ${shuffle ? 'on' : 'off'}`} aria-pressed={shuffle} title="Shuffle">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M1 10h2l3-3L3 4H1M8 4h2l3 3-3 3H8M4 7h6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <button className={`pb-btn pb-btn--sm${repeat !== 'off' ? ' pb-btn--active' : ''}`}
          onClick={cycleRepeat} aria-label={repeatLabel} title={repeatLabel}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M1 5a5 5 0 0 1 9.9-.5M13 9a5 5 0 0 1-9.9.5M10.5 2v3h-3M3.5 12V9h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          {repeatIcon && <span className="pb-repeat-badge">{repeatIcon}</span>}
        </button>

        {/* Volume */}
        <div className="pb-vol" role="group" aria-label="Volume control">
          <button className="pb-btn pb-btn--sm" onClick={() => setVolume(volume > 0 ? 0 : 0.8)}
            aria-label={volume === 0 ? 'Unmute' : 'Mute'} title={volume === 0 ? 'Unmute' : 'Mute'}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M2 5h2l3-3v10L4 9H2a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" fill="currentColor"/>
              {volume > 0 && <path d="M9 5a3 3 0 0 1 0 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>}
              {volume > 0.5 && <path d="M10.5 3a5.5 5.5 0 0 1 0 8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>}
            </svg>
          </button>
          <input type="range" className="pb-vol-slider" min="0" max="1" step="0.02"
            value={volume} onChange={e => setVolume(parseFloat(e.target.value))}
            aria-label="Volume" aria-valuenow={Math.round(volume * 100)} aria-valuetext={`${Math.round(volume * 100)}%`}
            style={{'--fill': `${volume * 100}%`}} />
        </div>

        <button className={`pb-btn pb-btn--sm${queueOpen ? ' pb-btn--active' : ''}`}
          onClick={setQueueOpen} aria-label={`${queueOpen ? 'Hide' : 'Show'} queue`}
          aria-expanded={queueOpen} title="Queue">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M2 3h10M2 6h7M2 9h7M11 8v4M9 10h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
          </svg>
        </button>
      </div>
    </div>
  )
}
