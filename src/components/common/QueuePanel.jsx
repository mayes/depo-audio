import { basename } from '../../utils'

export default function QueuePanel({ player }) {
  const { queue, currentIndex, queueOpen, removeFromQueue, clearQueue, play } = player

  if (!queueOpen || queue.length === 0) return null

  return (
    <div className="queue-panel" role="region" aria-label="Playback queue">
      <div className="qp-head">
        <span className="qp-title" id="queue-title">Queue</span>
        <span className="qp-count" aria-live="polite">{queue.length} track{queue.length !== 1 ? 's' : ''}</span>
        <button className="qp-clear" onClick={clearQueue} aria-label="Clear queue">Clear</button>
      </div>
      <ul className="qp-list" role="list" aria-labelledby="queue-title">
        {queue.map((file, i) => {
          const active = i === currentIndex
          const ext = file.name?.split('.').pop()?.toLowerCase() || ''
          return (
            <li key={file.path + i} className={`qp-item${active ? ' qp-item--active' : ''}`}
              role="listitem" aria-current={active ? 'true' : undefined}>
              <button className="qp-item-play" onClick={() => play(file)}
                aria-label={`Play ${basename(file.name || file.path)}`}>
                {active
                  ? <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><rect x="1" y="1" width="3" height="8" rx="1" fill="currentColor"/><rect x="6" y="1" width="3" height="8" rx="1" fill="currentColor"/></svg>
                  : <span className="qp-num">{i + 1}</span>}
              </button>
              {ext && <span className={`qp-fmt qp-fmt--${ext}`}>{ext.toUpperCase()}</span>}
              <span className="qp-name" title={file.path}>{basename(file.name || file.path)}</span>
              <button className="qp-remove" onClick={() => removeFromQueue(i)}
                aria-label={`Remove ${basename(file.name || file.path)} from queue`}>
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                  <path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                </svg>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
