import { useState } from 'react'
import { FORMAT_ROWS } from '../../constants'

export default function FormatTable() {
  const [open, setOpen] = useState(false)
  return (
    <div className="fmttable-wrap">
      <button className="fmttable-toggle" onClick={() => setOpen(o => !o)}>
        <span className="panel-label">FORMAT SUPPORT</span>
        <span className="fmttable-chevron">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="fmttable">
          {FORMAT_ROWS.map((r, i) => (
            <div key={i} className="fmttable-row">
              <span className="fmttable-ext">{r.ext}</span>
              <span className="fmttable-vendor">{r.vendor}</span>
              <span className="fmttable-ch">{r.ch}</span>
              <span className={`fmttable-status fmttable-status--${r.status}`}>
                {r.status === 'supported' ? '● Supported' : r.status === 'experimental' ? '◐ Experimental' : '✕ Cannot convert'}
              </span>
            </div>
          ))}
          <div className="fmttable-note">
            ✕ Eclipse <code>.aes</code> files are AES-128 encrypted. In Eclipse: File → Export Audio → WAV, then drop that file here.
          </div>
        </div>
      )}
    </div>
  )
}
