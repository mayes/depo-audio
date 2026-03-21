import { useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { CH_COLORS } from '../../constants'
import StatusChip from '../common/StatusChip'
import MiniPlayer from './MiniPlayer'

export default function FileRow({ file, job, onRemove, onRetry, converting, player }) {
  const [expanded, setExpanded] = useState(false)
  const status = job?.status || 'waiting'
  const isExp = file.fmt?.status === 'experimental'
  const isRej = file.fmt?.status === 'unsupported'
  const isGuide = file.fmt?.handler === 'guidance'

  return (
    <div className={`fr fr--${status}${isRej?' fr--rejected':''}${isGuide?' fr--guidance':''}`} role="listitem">
      <div className="fr-main">
        <div className={`fi ${status==='done'?'fi--done':status==='error'?'fi--error':status==='converting'?'fi--active':isRej?'fi--bad':''}`}>
          <svg width="18" height="22" viewBox="0 0 18 22" fill="none" aria-hidden="true">
            <path d="M2 2h9l5 5v13a1 1 0 01-1 1H2a1 1 0 01-1-1V3a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.4"/>
            <path d="M11 2v5h5" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
            <line x1="4" y1="12" x2="14" y2="12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity=".55"/>
            <line x1="4" y1="15.5" x2="11" y2="15.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity=".35"/>
          </svg>
        </div>
        <div className="fr-info">
          <div className="fr-top">
            <span className="fr-name" title={file.path}>{file.name}</span>
            {file.fmt && <span className={`fr-tag${isExp?' fr-tag--exp':isRej||isGuide?' fr-tag--bad':''}`}>{file.fmt.name.split('·')[0].trim()}</span>}
          </div>
          <span className="fr-path">{file.path}</span>
        </div>
        <div className="fr-right">
          <StatusChip status={status} />
          {!converting && <button className="fr-remove" onClick={onRemove} aria-label={`Remove ${file.name}`}>
            <svg width="9" height="9" viewBox="0 0 9 9" aria-hidden="true"><path d="M1 1l7 7M8 1L1 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </button>}
        </div>
      </div>
      {status === 'converting' && (() => {
        const pct = file.duration && job?.seconds ? Math.min(100, (job.seconds / file.duration) * 100) : null
        return (
          <div className="fr-progress" role="progressbar" aria-valuenow={pct != null ? Math.round(pct) : undefined} aria-label="Conversion progress">
            <div className="progress-track">
              {pct != null
                ? <div className="progress-fill progress-fill--real" style={{width: pct + '%'}} />
                : <div className="progress-fill" />}
            </div>
            {pct != null && <span className="progress-pct">{Math.round(pct)}%</span>}
          </div>
        )
      })()}
      {status === 'done' && job.outputs?.length > 0 && (
        <div className="fr-outputs">
          {job.outputs.map((out, i) => <MiniPlayer key={i} out={out} color={CH_COLORS[i%CH_COLORS.length]} multi={job.outputs.length > 1} player={player} />)}
          {job.outputs.length > 1 && (
            <button className="show-folder-btn"
              onClick={() => invoke('show_in_folder', { path: job.outputs[0].path }).catch(() => {})}>
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true">
                <path d="M1 2.5h3.5l1 1H10v6H1V2.5z" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinejoin="round"/>
              </svg>
              Show in Explorer / Finder
            </button>
          )}
        </div>
      )}
      {status === 'error' && (
        <div className="fr-error">
          {!converting && onRetry && <button className="retry-btn" onClick={() => onRetry(file)}>↻ Retry</button>}
          <button className="err-toggle" onClick={() => setExpanded(e => !e)} aria-expanded={expanded}>{expanded?'▲ hide':'▼ details'}</button>
          {expanded && <pre className="err-text">{job.error}</pre>}
        </div>
      )}
      {isGuide && file.fmt?.note && (
        <div className="fr-guidance">
          <span className="guidance-icon">ℹ</span>
          <span className="guidance-text">{file.fmt.note}</span>
        </div>
      )}
    </div>
  )
}
