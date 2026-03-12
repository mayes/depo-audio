import { useState } from 'react'

export default function UpdateBanner({ update, downloading, progress, onInstall, onSkip, onDismiss }) {
  const [showNotes, setShowNotes] = useState(false)

  if (!update) return null

  return (
    <div className="update-banner">
      <div className="update-banner-main">
        <span className="update-banner-icon">↑</span>
        <span className="update-banner-text">
          <strong>DepoAudio {update.version}</strong> is available
        </span>
        <div className="update-banner-actions">
          {update.body && (
            <button className="update-btn update-btn--ghost" onClick={() => setShowNotes(n => !n)}>
              {showNotes ? 'Hide Notes' : 'View Changes'}
            </button>
          )}
          {!downloading && (
            <>
              <button className="update-btn update-btn--ghost" onClick={onSkip}>Skip</button>
              <button className="update-btn update-btn--primary" onClick={onInstall}>Update Now</button>
            </>
          )}
          {downloading && (
            <span className="update-progress-text">{progress < 100 ? `Downloading… ${Math.round(progress)}%` : 'Installing…'}</span>
          )}
          <button className="update-btn update-btn--close" onClick={onDismiss} aria-label="Dismiss update banner">×</button>
        </div>
      </div>
      {downloading && (
        <div className="update-progress-bar">
          <div className="update-progress-fill" style={{ width: `${progress}%` }} />
        </div>
      )}
      {showNotes && update.body && (
        <div className="update-notes">
          <pre className="update-notes-text">{update.body}</pre>
        </div>
      )}
    </div>
  )
}
