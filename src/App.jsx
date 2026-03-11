import { useState, useCallback, useEffect, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import { convertFileSrc } from '@tauri-apps/api/core'

// ── Constants ─────────────────────────────────────────────────────────────────

const MODES = [
  { id: 'stereo', label: 'Mix to Stereo',  desc: 'All channels blended to one stereo file' },
  { id: 'keep',   label: 'Keep Original',  desc: 'Convert container, preserve channel layout' },
  { id: 'split',  label: 'Split Channels', desc: 'One file per channel, named by role' },
]
const FORMATS_OUT = [
  { id: 'wav',  label: 'WAV',  desc: 'Lossless PCM — editing' },
  { id: 'mp3',  label: 'MP3',  desc: '192 kbps — scopists / email' },
  { id: 'flac', label: 'FLAC', desc: 'Lossless compressed — archival' },
  { id: 'opus', label: 'Opus', desc: '64 kbps VBR — voice optimized, smallest' },
]
const CH_COLORS = ['#c49a36','#4a8fdf','#3a9e6a','#c94e4e']
let jobCounter = 0

function fmtSize(b) {
  if (!b || b === 0) return '—'
  if (b < 1048576) return `${(b/1024).toFixed(1)} KB`
  if (b < 1073741824) return `${(b/1048576).toFixed(1)} MB`
  return `${(b/1073741824).toFixed(2)} GB`
}
function fmtTime(s) {
  if (!s || isNaN(s)) return '0:00'
  const m = Math.floor(s/60), sec = Math.floor(s%60)
  return `${m}:${sec.toString().padStart(2,'0')}`
}
function basename(p) { return (p||'').replace(/\\/g,'/').split('/').pop() }

// ── App shell ─────────────────────────────────────────────────────────────────

export default function App() {
  const [tab, setTab]             = useState('convert')
  const [theme, setTheme]         = useState('dark')
  const [themePref, setThemePref] = useState('system')
  const [prefsReady, setPrefsReady] = useState(false)

  // Converter state
  const [mode, setMode]           = useState('stereo')
  const [formatOut, setFormatOut] = useState('wav')
  const [labels, setLabels]       = useState(['Reporter','Witness','Attorney 1','Attorney 2'])
  const [chanVols, setChanVols]   = useState([1,1,1,1])
  const [outDir, setOutDir]       = useState('')
  const [rate, setRate]           = useState('48000')
  const [normalize, setNormalize] = useState(false)
  const [trim, setTrim]           = useState(false)
  const [fade, setFade]           = useState(false)
  const [fadeDur, setFadeDur]     = useState(0.5)
  const [hpf, setHpf]             = useState(false)
  const [files, setFiles]         = useState([])
  const [jobs, setJobs]           = useState({})
  const [converting, setConverting] = useState(false)
  const [dragOver, setDragOver]   = useState(false)
  const [caseName, setCaseName]   = useState('')

  // Library state
  const [cases, setCases]         = useState([])
  const [libSearch, setLibSearch] = useState('')

  const anyProc = normalize || trim || fade || hpf

  // Load prefs
  useEffect(() => {
    invoke('prefs_get').then(p => {
      if (p.mode)      setMode(p.mode)
      if (p.format)    setFormatOut(p.format)
      if (p.rate)      setRate(p.rate)
      if (p.outDir !== undefined) setOutDir(p.outDir)
      if (p.labels?.length) setLabels(p.labels)
      if (p.chanVols?.length) setChanVols(p.chanVols)
      setNormalize(!!p.normalize); setTrim(!!p.trim)
      setFade(!!p.fade); setFadeDur(p.fadeDur || 0.5); setHpf(!!p.hpf)
      setPrefsReady(true)
    }).catch(() => setPrefsReady(true))
  }, [])

  useEffect(() => {
    if (!prefsReady) return
    invoke('prefs_set', { patch: { mode, format: formatOut, rate, outDir, labels, chanVols, normalize, trim, fade, fadeDur, hpf } })
  }, [mode, formatOut, rate, outDir, labels, chanVols, normalize, trim, fade, fadeDur, hpf, prefsReady])

  // Theme
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = (pref) => {
      const resolved = pref === 'system' ? (mq.matches ? 'dark' : 'light') : pref
      setTheme(resolved)
      document.documentElement.setAttribute('data-theme', resolved)
      document.documentElement.style.background = resolved === 'light' ? '#f5f0e8' : '#0d1117'
      try { localStorage.setItem('depoaudio-theme', resolved) } catch {}
    }
    const saved = localStorage.getItem('depoaudio-theme') || 'dark'
    setThemePref(saved === 'light' ? 'light' : saved === 'system' ? 'system' : 'dark')
    apply(saved)
  }, [])

  function cycleTheme() {
    const next = themePref === 'system' ? 'dark' : themePref === 'dark' ? 'light' : 'system'
    setThemePref(next)
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const resolved = next === 'system' ? (mq.matches ? 'dark' : 'light') : next
    setTheme(resolved)
    document.documentElement.setAttribute('data-theme', resolved)
    document.documentElement.style.background = resolved === 'light' ? '#f5f0e8' : '#0d1117'
    try { localStorage.setItem('depoaudio-theme', next) } catch {}
    invoke('prefs_set', { patch: { theme: next } }).catch(() => {})
  }

  // Load library when switching to library tab
  useEffect(() => {
    if (tab === 'library') {
      invoke('library_get').then(setCases).catch(() => {})
    }
  }, [tab])

  // ── File handling ────────────────────────────────────────────────────────────
  // Use refs so the drag-drop listener never needs to be re-registered
  const filesRef    = useRef(files)
  const caseNameRef = useRef(caseName)
  useEffect(() => { filesRef.current = files }, [files])
  useEffect(() => { caseNameRef.current = caseName }, [caseName])

  const addFiles = useCallback(async (paths) => {
    const filtered = paths.filter(p => !p.toLowerCase().endsWith('.trs'))
    const next = []
    for (const p of filtered) {
      if (filesRef.current.some(f => f.path === p)) continue
      const fmt = await invoke('detect_format', { path: p }).catch(() => null)
      next.push({ path: p, name: basename(p), fmt })
      if (!caseNameRef.current && next.length === 1) {
        const detected = await invoke('infer_case_name_cmd', { filename: basename(p) }).catch(() => '')
        setCaseName(detected)
      }
    }
    if (next.length) setFiles(prev => [...prev, ...next])
  }, []) // stable — uses refs, no deps

  const removeFile = (path) => {
    if (converting) return
    setFiles(p => { const next = p.filter(f => f.path !== path); if (next.length === 0) setCaseName(''); return next })
    setJobs(p => { const n={...p}; delete n[path]; return n })
  }
  const clearAll = () => { if (!converting) { setFiles([]); setJobs({}); setCaseName('') } }

  // Tauri native drag-drop — registered once, stable because addFiles is stable
  useEffect(() => {
    let unlisten
    listen('tauri://drag-drop', (event) => {
      setDragOver(false)
      if (event.payload?.paths?.length) addFiles(event.payload.paths)
    }).then(u => { unlisten = u })
    return () => { if (unlisten) unlisten() }
  }, [addFiles])

  const onDragOver  = (e) => { e.preventDefault(); setDragOver(true) }
  const onDragLeave = () => setDragOver(false)
  const onDrop      = (e) => { e.preventDefault(); setDragOver(false) }

  const browseFiles = async () => {
    const selected = await openDialog({ multiple: true, filters: [
      { name: 'Audio', extensions: ['sgmca','trm','ftr','bwf','dm','wav','mp3','flac','wma','m4a','aac','ogg','opus','aif','aiff'] },
      { name: 'All Files', extensions: ['*'] }
    ]}).catch(() => null)
    if (selected) await addFiles(Array.isArray(selected) ? selected : [selected])
  }

  const browseOutDir = async () => {
    const dir = await openDialog({ directory: true }).catch(() => null)
    if (dir) setOutDir(dir)
  }

  // ── Conversion ───────────────────────────────────────────────────────────────
  const startConversion = async () => {
    if (converting || !files.length) return
    setConverting(true)
    setJobs(Object.fromEntries(files.map(f => [f.path, { status:'queued', outputs:[], error:null }])))

    const unlistenProg = await listen('convert:progress', ({ payload }) => {
      setJobs(prev => {
        const match = Object.entries(prev).find(([,j]) => j.id === payload.id)
        if (!match) return prev
        return { ...prev, [match[0]]: { ...match[1], seconds: payload.seconds } }
      })
    })
    const unlistenDone = await listen('convert:done', ({ payload }) => {
      setJobs(prev => {
        const match = Object.entries(prev).find(([,j]) => j.id === payload.id)
        if (!match) return prev
        return { ...prev, [match[0]]: { ...match[1], status:'done', outputs: payload.files } }
      })
    })
    const unlistenErr = await listen('convert:error', ({ payload }) => {
      setJobs(prev => {
        const match = Object.entries(prev).find(([,j]) => j.id === payload.id)
        if (!match) return prev
        return { ...prev, [match[0]]: { ...match[1], status:'error', error: payload.message } }
      })
    })

    for (const file of files) {
      const id = `job_${++jobCounter}`
      setJobs(prev => ({ ...prev, [file.path]: { ...prev[file.path], status:'converting', id } }))
      const resolved = outDir || file.path.replace(/\\/g,'/').split('/').slice(0,-1).join('/')
      await new Promise(resolve => {
        const poll = setInterval(() => {
          setJobs(prev => {
            const j = prev[file.path]
            if (j?.status === 'done' || j?.status === 'error') { clearInterval(poll); resolve() }
            return prev
          })
        }, 200)
        invoke('convert', { job: {
          id, srcPath: file.path, outDir: resolved, mode,
          format: formatOut, rate: formatOut === 'opus' ? '48000' : rate,
          labels, chanVols, normalize, trim, fade, fadeDur, hpf,
          caseName: caseName || null
        }}).catch(e => {
          setJobs(prev => ({ ...prev, [file.path]: { ...prev[file.path], status:'error', error: String(e) } }))
          clearInterval(poll); resolve()
        })
      })
    }

    await unlistenProg(); await unlistenDone(); await unlistenErr()
    setConverting(false)
    invoke('library_get').then(setCases).catch(() => {})
  }

  const doneCount = Object.values(jobs).filter(j => j.status === 'done').length
  const failCount = Object.values(jobs).filter(j => j.status === 'error').length
  const themeLabel = themePref === 'system' ? '⊙' : themePref === 'dark' ? '☾' : '☀'

  return (
    <div className="app">
      {/* ── Topbar */}
      <header className="topbar">
        <div className="topbar-brand">
          <LogoSvg />
          <div className="topbar-text">
            <span className="topbar-title">DepoAudio</span>
            <span className="topbar-tagline">Court Recording Converter</span>
          </div>
        </div>
        <div className="topbar-tabs">
          <button className={`tab-btn${tab==='convert'?' tab-btn--active':''}`} onClick={() => setTab('convert')}>Convert</button>
          <button className={`tab-btn${tab==='library'?' tab-btn--active':''}`} onClick={() => setTab('library')}>
            Library {cases.filter(c=>!c.archived).length > 0 && <span className="tab-badge">{cases.filter(c=>!c.archived).length}</span>}
          </button>
        </div>
        <div className="topbar-right">
          <button className="theme-btn" title={`Theme: ${themePref}`} onClick={cycleTheme}>{themeLabel}</button>
        </div>
      </header>

      {tab === 'convert' && (
        <>
          <div className="main-scroll">
            <div className="content">

              {/* ── OUTPUT MODE ──────────────────────────────────────────────── */}
              <section className="panel">
                <div className="panel-head"><span className="panel-label">OUTPUT MODE</span></div>
                <div className="mode-grid">
                  {MODES.map(m => (
                    <button key={m.id} className={`mode-card${mode===m.id?' mode-card--active':''}`} onClick={() => setMode(m.id)}>
                      <ModeIcon id={m.id} active={mode===m.id} />
                      <div className="mode-card-body">
                        <span className="mode-name">{m.label}</span>
                        <span className="mode-desc">{m.desc}</span>
                      </div>
                      {mode===m.id && <span className="mode-check">✓</span>}
                    </button>
                  ))}
                </div>
              </section>

              {/* ── CHANNEL LABELS — always visible ──────────────────────────── */}
              <section className="panel panel--tight">
                <div className="panel-head">
                  <span className="panel-label">CHANNEL LABELS</span>
                  <span className="panel-hint">
                    {mode === 'split'  && 'Used as output filenames when splitting channels'}
                    {mode === 'stereo' && 'Labels shown in mix sliders below'}
                    {mode === 'keep'   && 'Labels saved to library for reference'}
                  </span>
                </div>
                <div className="ch-grid">
                  {labels.map((l,i) => (
                    <div key={i} className="ch-item">
                      <span className="ch-dot" style={{background:CH_COLORS[i]}} />
                      <span className="ch-num">CH {i+1}</span>
                      <input className="ch-input" value={l} maxLength={24} placeholder={`Channel ${i+1}`}
                        onChange={e => setLabels(p => p.map((v,j) => j===i ? e.target.value:v))} />
                    </div>
                  ))}
                </div>
              </section>

              {/* ── CHANNEL MIX — always visible, active in stereo mode ───────── */}
              <section className={`panel panel--tight${mode !== 'stereo' ? ' panel--muted' : ''}`}>
                <div className="panel-head">
                  <span className="panel-label">CHANNEL MIX</span>
                  {mode !== 'stereo'
                    ? <span className="panel-hint panel-hint--inactive">Active in Mix to Stereo mode</span>
                    : <span className="panel-hint">Per-channel volume — 1.0 = unity, 0.0 = mute, 2.0 = boost</span>
                  }
                </div>
                <div className="chan-vols-grid">
                  {chanVols.map((v,i) => (
                    <div key={i} className={`chan-vol-item${mode !== 'stereo' ? ' chan-vol-item--dim' : ''}`}>
                      <span className="chan-vol-dot" style={{background:CH_COLORS[i]}} />
                      <span className="chan-vol-name">{labels[i]||`CH ${i+1}`}</span>
                      <input type="range" min="0" max="2" step="0.05" value={v} className="chan-vol-slider"
                        style={{'--fill':`${(v/2)*100}%`}}
                        disabled={mode !== 'stereo'}
                        onChange={e => setChanVols(p => p.map((x,j) => j===i ? parseFloat(e.target.value):x))} />
                      <span className="chan-vol-val">{v===0?'mute':v.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </section>

              {/* ── PROCESSING ───────────────────────────────────────────────── */}
              <section className="panel panel--tight">
                <div className="panel-head"><span className="panel-label">PROCESSING</span></div>
                <div className="proc-grid">
                  <label className="proc-item">
                    <div className="proc-item-info">
                      <span className="proc-name">High-Pass Filter</span>
                      <span className="proc-desc">80 Hz cutoff — removes HVAC hum, mic handling noise, low rumble</span>
                    </div>
                    <Toggle checked={hpf} onChange={setHpf} />
                  </label>
                  <label className="proc-item">
                    <div className="proc-item-info">
                      <span className="proc-name">Normalize</span>
                      <span className="proc-desc">Loudnorm — evens out quiet recordings, targets –16 LUFS / –1.5 TP</span>
                    </div>
                    <Toggle checked={normalize} onChange={setNormalize} />
                  </label>
                  <label className="proc-item">
                    <div className="proc-item-info">
                      <span className="proc-name">Trim Silence</span>
                      <span className="proc-desc">Remove leading and trailing silence below –50 dB / 0.3s minimum</span>
                    </div>
                    <Toggle checked={trim} onChange={setTrim} />
                  </label>
                  <label className="proc-item">
                    <div className="proc-item-info">
                      <span className="proc-name">Fade In / Out</span>
                      <span className="proc-desc">
                        Smooth start and end
                        {fade && (
                          <span className="fade-dur-wrap" onClick={e => e.preventDefault()}>
                            &nbsp;—&nbsp;
                            <input type="number" className="fade-dur-input" min="0.1" max="5" step="0.1" value={fadeDur}
                              onChange={e => setFadeDur(Math.max(0.1, parseFloat(e.target.value)||0.5))} />
                            <span className="fade-dur-unit">s</span>
                          </span>
                        )}
                      </span>
                    </div>
                    <Toggle checked={fade} onChange={setFade} />
                  </label>
                </div>

                {/* Live processing chain preview */}
                <div className="proc-chain">
                  <span className="proc-chain-label">CHAIN</span>
                  {anyProc ? (
                    <div className="proc-chain-steps">
                      {hpf       && <><span className="proc-chip proc-chip--on">HPF 80Hz</span><span className="proc-chain-arrow">→</span></>}
                      {normalize && <><span className="proc-chip proc-chip--on">Loudnorm −16 LUFS</span><span className="proc-chain-arrow">→</span></>}
                      {trim      && <><span className="proc-chip proc-chip--on">Trim silence</span><span className="proc-chain-arrow">→</span></>}
                      {fade      && <span className="proc-chip proc-chip--on">Fade {fadeDur}s</span>}
                    </div>
                  ) : (
                    <span className="proc-chain-empty">No processing — direct transcode only</span>
                  )}
                </div>
              </section>

              {/* ── OPTIONS ──────────────────────────────────────────────────── */}
              <div className="opts-row">
                <div className="opt-block opt-block--grow">
                  <label className="opt-label">CASE NAME</label>
                  <input className="opt-input" value={caseName} placeholder="Auto-detected from filename — override here"
                    onChange={e => setCaseName(e.target.value)} />
                </div>
                <div className="opt-block opt-block--grow">
                  <label className="opt-label">OUTPUT FOLDER</label>
                  <div className="opt-inline">
                    <input className="opt-input" value={outDir} placeholder="Default: same folder as source"
                      onChange={e => setOutDir(e.target.value)} />
                    <button className="btn btn--sm" onClick={browseOutDir}>Browse</button>
                  </div>
                </div>
                <div className="opt-block">
                  <label className="opt-label">SAMPLE RATE</label>
                  <select className="opt-select" value={formatOut === 'opus' ? '48000' : rate}
                    disabled={formatOut === 'opus'}
                    title={formatOut === 'opus' ? 'Opus is always 48 kHz' : ''}
                    onChange={e => setRate(e.target.value)}>
                    <option value="22050">22,050 Hz</option>
                    <option value="44100">44,100 Hz</option>
                    <option value="48000">48,000 Hz</option>
                  </select>
                </div>
                <div className="opt-block">
                  <label className="opt-label">OUTPUT FORMAT</label>
                  <div className="format-tabs">
                    {FORMATS_OUT.map(f => (
                      <button key={f.id} title={f.desc}
                        className={`fmt-tab${formatOut===f.id?' fmt-tab--active':''}`}
                        onClick={() => setFormatOut(f.id)}>{f.label}</button>
                    ))}
                  </div>
                </div>
              </div>

              <FormatTable />

              {/* Drop zone */}
              <div className={`dropzone${dragOver?' dropzone--over':''}`}
                onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
                onClick={browseFiles}>
                <WaveformIcon />
                <p className="drop-title">Drop audio files here</p>
                <p className="drop-sub">or <span className="drop-link">click to browse</span> — SGMCA · TRM · BWF · WAV · MP3 · FLAC · Opus and more</p>
              </div>

              {files.length > 0 && (
                <div className="filelist-wrap">
                  <div className="filelist-head">
                    <span className="filelist-count">{files.length} file{files.length!==1?'s':''} queued</span>
                    {!converting && <button className="ghost-btn" onClick={clearAll}>Clear all</button>}
                  </div>
                  <div className="filelist">
                    {files.map(f => <FileRow key={f.path} file={f} job={jobs[f.path]} onRemove={() => removeFile(f.path)} converting={converting} />)}
                  </div>
                </div>
              )}

            </div>
          </div>

          <footer className="bottombar">
            <div className="bottombar-status">
              {converting && <span className="status-pill status-pill--active"><span className="status-dot"/>{doneCount > 0 ? `${doneCount} / ${files.length} done` : 'Converting…'}</span>}
              {!converting && doneCount > 0 && <span className="status-pill status-pill--done">✓ {doneCount} file{doneCount!==1?'s':''} converted{failCount>0?`, ${failCount} failed`:''}</span>}
            </div>
            <button className={`btn btn--primary${converting||!files.length?' btn--disabled':''}`}
              onClick={startConversion} disabled={converting||!files.length}>
              {converting ? <><Spinner />Converting…</> : <>▶ Convert{files.length > 1 ? ` ${files.length} Files` : ''}</>}
            </button>
          </footer>
        </>
      )}

      {tab === 'library' && (
        <Library cases={cases} setCases={setCases} search={libSearch} setSearch={setLibSearch}
          labels={labels}
          onReexport={(srcPath, srcCaseName) => {
            setFiles([{path:srcPath,name:basename(srcPath),fmt:null}])
            setCaseName(srcCaseName || '')
            setTab('convert')
          }} />
      )}
    </div>
  )
}

// ── Format support table ──────────────────────────────────────────────────────

const FORMAT_ROWS = [
  { ext: '.sgmca',                  vendor: 'Stenograph · Case CATalyst',          ch: '4 ch',   status: 'supported' },
  { ext: '.trm  .ftr',              vendor: 'For The Record · FTR Gold',            ch: '4–16 ch',status: 'experimental' },
  { ext: '.bwf',                    vendor: 'CourtSmart · Various',                 ch: 'varies', status: 'supported' },
  { ext: '.dm',                     vendor: 'Stenovations · DigitalCAT',            ch: '—',      status: 'experimental' },
  { ext: '.aes',                    vendor: 'Eclipse CAT · AudioSync',              ch: '—',      status: 'unsupported' },
  { ext: '.wav  .mp3  .wma  .m4a  .ogg  .opus  .flac  +more', vendor: 'Eclipse · ProCAT · StenoCAT · Standard', ch: 'any', status: 'supported' },
]

function FormatTable() {
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

// ── FileRow ───────────────────────────────────────────────────────────────────

function FileRow({ file, job, onRemove, converting }) {
  const [expanded, setExpanded] = useState(false)
  const status = job?.status || 'waiting'
  const isExp = file.fmt?.status === 'experimental'
  const isRej = file.fmt?.status === 'unsupported'

  return (
    <div className={`fr fr--${status}${isRej?' fr--rejected':''}`}>
      <div className="fr-main">
        <div className={`fi ${status==='done'?'fi--done':status==='error'?'fi--error':status==='converting'?'fi--active':isRej?'fi--bad':''}`}>
          <svg width="18" height="22" viewBox="0 0 18 22" fill="none">
            <path d="M2 2h9l5 5v13a1 1 0 01-1 1H2a1 1 0 01-1-1V3a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.4"/>
            <path d="M11 2v5h5" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
            <line x1="4" y1="12" x2="14" y2="12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity=".55"/>
            <line x1="4" y1="15.5" x2="11" y2="15.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity=".35"/>
          </svg>
        </div>
        <div className="fr-info">
          <div className="fr-top">
            <span className="fr-name" title={file.path}>{file.name}</span>
            {file.fmt && <span className={`fr-tag${isExp?' fr-tag--exp':isRej?' fr-tag--bad':''}`}>{file.fmt.name.split('·')[0].trim()}</span>}
          </div>
          <span className="fr-path">{file.path}</span>
        </div>
        <div className="fr-right">
          <StatusChip status={status} />
          {!converting && <button className="fr-remove" onClick={onRemove}>
            <svg width="9" height="9" viewBox="0 0 9 9"><path d="M1 1l7 7M8 1L1 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </button>}
        </div>
      </div>
      {status === 'converting' && (
        <div className="fr-progress"><div className="progress-track"><div className="progress-fill"/></div></div>
      )}
      {status === 'done' && job.outputs?.length > 0 && (
        <div className="fr-outputs">
          {job.outputs.map((out, i) => <MiniPlayer key={i} out={out} color={CH_COLORS[i%4]} multi={job.outputs.length > 1} />)}
          {job.outputs.length > 1 && (
            <button className="show-folder-btn"
              onClick={() => invoke('show_in_folder', { path: job.outputs[0].path }).catch(() => {})}>
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                <path d="M1 2.5h3.5l1 1H10v6H1V2.5z" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinejoin="round"/>
              </svg>
              Show in Explorer / Finder
            </button>
          )}
        </div>
      )}
      {status === 'error' && (
        <div className="fr-error">
          <button className="err-toggle" onClick={() => setExpanded(e => !e)}>{expanded?'▲ hide':'▼ details'}</button>
          {expanded && <pre className="err-text">{job.error}</pre>}
        </div>
      )}
    </div>
  )
}

// ── MiniPlayer ────────────────────────────────────────────────────────────────

function MiniPlayer({ out, color, multi }) {
  const audioRef = useRef(null)
  const [playing, setPlaying] = useState(false)
  const [current, setCurrent] = useState(0)
  const [duration, setDuration] = useState(0)
  const src = convertFileSrc(out.path)

  const toggle = () => {
    const a = audioRef.current; if (!a) return
    if (playing) { a.pause(); setPlaying(false) } else { a.play().then(() => setPlaying(true)).catch(() => {}) }
  }

  return (
    <div className="out-row">
      {multi && <span className="out-dot" style={{color}}>▮</span>}
      <span className="out-name" title={out.path}>{out.name}</span>
      <span className="out-size">{fmtSize(out.size)}</span>
      <audio ref={audioRef} src={src} preload="metadata"
        onLoadedMetadata={e => setDuration(e.target.duration)}
        onTimeUpdate={e => setCurrent(e.target.currentTime)}
        onEnded={() => { setPlaying(false); setCurrent(0) }} />
      <div className="mini-player">
        <button className="play-btn" onClick={toggle}>
          {playing
            ? <svg width="10" height="10" viewBox="0 0 10 10"><rect x="1" y="1" width="3" height="8" rx="1" fill="currentColor"/><rect x="6" y="1" width="3" height="8" rx="1" fill="currentColor"/></svg>
            : <svg width="10" height="10" viewBox="0 0 10 10"><path d="M2 1.5l7 3.5-7 3.5V1.5z" fill="currentColor"/></svg>}
        </button>
        <div className="player-track" onClick={e => {
          if (!audioRef.current || !duration) return
          const r = e.currentTarget.getBoundingClientRect()
          audioRef.current.currentTime = ((e.clientX - r.left) / r.width) * duration
        }}>
          <div className="player-fill" style={{width: duration ? `${(current/duration)*100}%` : '0%'}} />
        </div>
        {duration > 0 && <span className="player-time">{fmtTime(current)}/{fmtTime(duration)}</span>}
      </div>
    </div>
  )
}

// ── Library view ──────────────────────────────────────────────────────────────

function Library({ cases, setCases, search, setSearch, labels, onReexport }) {
  const [showArchived, setShowArchived] = useState(false)
  const [expandedCases, setExpandedCases]   = useState({})
  const [editingCase, setEditingCase]       = useState(null)
  const [editName, setEditName]             = useState('')
  const [importModal, setImportModal]       = useState(false)

  const filtered = cases
    .filter(c => showArchived ? c.archived : !c.archived)
    .filter(c => {
      if (!search.trim()) return true
      const q = search.toLowerCase()
      return c.name.toLowerCase().includes(q) ||
        c.sessions.some(s => s.sourceName?.toLowerCase().includes(q) ||
          s.participants.some(p => p.label.toLowerCase().includes(q)))
    })

  const toggleCase = (id) => setExpandedCases(p => ({...p, [id]: !p[id]}))

  const deleteCase = async (id) => {
    if (!confirm('Delete this case and all its session records? (Files on disk are not deleted.)')) return
    await invoke('library_delete_case', { caseId: id })
    setCases(p => p.filter(c => c.id !== id))
  }
  const archiveCase = async (id, archived) => {
    await invoke('library_archive_case', { caseId: id, archived })
    setCases(p => p.map(c => c.id === id ? {...c, archived} : c))
  }
  const renameCase = async (id) => {
    if (!editName.trim()) return
    await invoke('library_rename_case', { caseId: id, name: editName.trim() })
    setCases(p => p.map(c => c.id === id ? {...c, name: editName.trim()} : c))
    setEditingCase(null)
  }
  const deleteSession = async (caseId, sessionId) => {
    await invoke('library_delete_session', { caseId, sessionId })
    setCases(p => p.map(c => c.id === caseId ? {...c, sessions: c.sessions.filter(s => s.id !== sessionId)} : c))
  }

  const handleImportDone = () => {
    setImportModal(false)
    invoke('library_get').then(setCases).catch(() => {})
  }

  return (
    <div className="lib-wrap">
      <div className="lib-toolbar">
        <div className="lib-search-wrap">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="lib-search-icon">
            <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.3"/>
            <line x1="9.5" y1="9.5" x2="13" y2="13" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
          </svg>
          <input className="lib-search" placeholder="Search cases, participants…" value={search} onChange={e => setSearch(e.target.value)} />
          {search && <button className="lib-search-clear" onClick={() => setSearch('')}>×</button>}
        </div>
        <button className={`ghost-btn${showArchived?' ghost-btn--active':''}`} onClick={() => setShowArchived(p => !p)}>
          {showArchived ? 'Hide archived' : 'Show archived'}
        </button>
        <button className="btn btn--sm lib-import-btn" onClick={() => setImportModal(true)}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{flexShrink:0}}>
            <path d="M6 1v7M3 5l3 3 3-3M1 10h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Import Audio
        </button>
      </div>

      {filtered.length === 0 && !importModal && (
        <div className="lib-empty">
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none" className="lib-empty-icon">
            <rect x="8" y="12" width="32" height="28" rx="3" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M8 20h32" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M18 12V8a2 2 0 012-2h8a2 2 0 012 2v4" stroke="currentColor" strokeWidth="1.5"/>
          </svg>
          <p className="lib-empty-title">{search ? 'No matches' : cases.length === 0 ? 'No cases yet' : 'No cases to show'}</p>
          <p className="lib-empty-sub">
            {search ? 'Try a different search' : 'Convert a recording or use Import Audio to add files directly'}
          </p>
        </div>
      )}

      <div className="lib-list">
        {filtered.map(c => (
          <div key={c.id} className={`lib-case${c.archived?' lib-case--archived':''}`}>
            <div className="lib-case-header" onClick={() => toggleCase(c.id)}>
              <div className="lib-case-chevron">{expandedCases[c.id] ? '▾' : '▸'}</div>
              <div className="lib-case-info">
                {editingCase === c.id ? (
                  <div className="lib-rename-row" onClick={e => e.stopPropagation()}>
                    <input className="lib-rename-input" value={editName} autoFocus
                      onChange={e => setEditName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') renameCase(c.id); if (e.key === 'Escape') setEditingCase(null) }} />
                    <button className="btn btn--sm" onClick={() => renameCase(c.id)}>Save</button>
                    <button className="ghost-btn" onClick={() => setEditingCase(null)}>Cancel</button>
                  </div>
                ) : (
                  <span className="lib-case-name">{c.name}</span>
                )}
                <span className="lib-case-meta">
                  {c.sessions.length} session{c.sessions.length!==1?'s':''} · {new Date(c.createdAt).toLocaleDateString()}
                  {c.archived && <span className="lib-archived-tag">archived</span>}
                </span>
              </div>
              <div className="lib-case-actions" onClick={e => e.stopPropagation()}>
                <button className="lib-action-btn" title="Rename" onClick={() => { setEditingCase(c.id); setEditName(c.name) }}>✎</button>
                <button className="lib-action-btn" title={c.archived?'Unarchive':'Archive'} onClick={() => archiveCase(c.id, !c.archived)}>{c.archived ? '↩' : '⊙'}</button>
                <button className="lib-action-btn lib-action-btn--del" title="Delete" onClick={() => deleteCase(c.id)}>✕</button>
              </div>
            </div>

            {expandedCases[c.id] && (
              <div className="lib-sessions">
                {c.sessions.map(s => (
                  <div key={s.id} className="lib-session">
                    <div className="lib-session-header">
                      <span className="lib-session-date">{s.date}</span>
                      <span className="lib-session-src" title={s.sourceFile}>{s.sourceName}</span>
                      <div className="lib-session-actions">
                        <button className="lib-action-btn" title="Re-export source" onClick={() => onReexport(s.sourceFile, c.name)}>⟳ Re-export</button>
                        <button className="lib-action-btn lib-action-btn--del" title="Remove session" onClick={() => deleteSession(c.id, s.id)}>✕</button>
                      </div>
                    </div>
                    <div className="lib-participants">
                      {s.participants.map((p, pi) => (
                        <div key={pi} className="lib-participant">
                          <span className="lib-participant-dot" style={{background: CH_COLORS[pi%4]}} />
                          <span className="lib-participant-label">{p.label}</span>
                          <div className="lib-participant-files">
                            {p.files.map((f, fi) => <LibraryFile key={fi} file={f} />)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {importModal && (
        <ImportModal
          defaultLabels={labels}
          existingCases={cases.filter(c => !c.archived).map(c => c.name)}
          onDone={handleImportDone}
          onClose={() => setImportModal(false)}
        />
      )}
    </div>
  )
}

// ── ImportModal ───────────────────────────────────────────────────────────────

function ImportModal({ defaultLabels, existingCases, onDone, onClose }) {
  const [selectedFiles, setSelectedFiles] = useState([])
  const [caseName, setCaseName]           = useState('')
  const [label, setLabel]                 = useState(defaultLabels[0] || 'Reporter')
  const [customLabel, setCustomLabel]     = useState('')
  const [saving, setSaving]               = useState(false)
  const [error, setError]                 = useState('')
  const [caseInputMode, setCaseInputMode] = useState('existing') // 'existing' | 'new'

  const labelValue = label === '__custom__' ? customLabel : label
  const allLabels  = [...defaultLabels, '__custom__']

  const browsePick = async () => {
    const selected = await openDialog({ multiple: true, filters: [
      { name: 'Audio', extensions: ['wav','mp3','flac','aac','ogg','opus','wma','m4a','aif','aiff'] },
      { name: 'All Files', extensions: ['*'] }
    ]}).catch(() => null)
    if (!selected) return
    const paths = Array.isArray(selected) ? selected : [selected]
    setSelectedFiles(paths)
    // Auto-fill case name from filename if not set
    if (!caseName && paths.length > 0) {
      const detected = await invoke('infer_case_name_cmd', { filename: basename(paths[0]) }).catch(() => '')
      if (detected) { setCaseName(detected); setCaseInputMode('new') }
    }
    setError('')
  }

  const handleSave = async () => {
    if (!selectedFiles.length) { setError('Select at least one file'); return }
    const cn = caseName.trim()
    if (!cn) { setError('Enter a case name'); return }
    const lbl = labelValue.trim()
    if (!lbl) { setError('Enter a speaker label'); return }
    setSaving(true); setError('')
    try {
      for (const path of selectedFiles) {
        await invoke('library_import_file', { path, caseName: cn, label: lbl })
      }
      onDone()
    } catch(e) {
      setError(String(e))
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal">
        <div className="modal-head">
          <span className="modal-title">Import Audio to Library</span>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <p className="modal-sub">Add already-converted or existing audio files directly to your library — no conversion needed.</p>

        {/* File picker */}
        <div className="modal-field">
          <label className="modal-label">FILES</label>
          <div className="modal-file-row">
            <button className="btn btn--sm" onClick={browsePick}>Browse files…</button>
            {selectedFiles.length > 0 && (
              <span className="modal-file-count">{selectedFiles.length} file{selectedFiles.length !== 1 ? 's' : ''} selected</span>
            )}
          </div>
          {selectedFiles.length > 0 && (
            <div className="modal-file-list">
              {selectedFiles.map((p, i) => (
                <div key={i} className="modal-file-item">
                  <span className="modal-file-name">{basename(p)}</span>
                  <button className="modal-file-remove" onClick={() => setSelectedFiles(f => f.filter((_,j) => j !== i))}>×</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Case */}
        <div className="modal-field">
          <label className="modal-label">CASE NAME</label>
          <div className="modal-case-row">
            {existingCases.length > 0 && (
              <div className="modal-case-tabs">
                <button className={`modal-case-tab${caseInputMode==='existing'?' active':''}`} onClick={() => setCaseInputMode('existing')}>Existing case</button>
                <button className={`modal-case-tab${caseInputMode==='new'?' active':''}`} onClick={() => setCaseInputMode('new')}>New case</button>
              </div>
            )}
            {(caseInputMode === 'existing' && existingCases.length > 0) ? (
              <select className="opt-select" value={caseName} onChange={e => setCaseName(e.target.value)}>
                <option value="">— select a case —</option>
                {existingCases.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            ) : (
              <input className="opt-input" value={caseName} placeholder="e.g. Smith v. Metro Transit"
                onChange={e => setCaseName(e.target.value)} />
            )}
          </div>
        </div>

        {/* Speaker label */}
        <div className="modal-field">
          <label className="modal-label">SPEAKER / PARTICIPANT</label>
          <div className="modal-label-row">
            <div className="modal-label-chips">
              {defaultLabels.map(l => (
                <button key={l} className={`modal-chip${label===l?' modal-chip--active':''}`}
                  onClick={() => { setLabel(l); setCustomLabel('') }}>{l}</button>
              ))}
              <button className={`modal-chip${label==='__custom__'?' modal-chip--active':''}`}
                onClick={() => setLabel('__custom__')}>Custom…</button>
            </div>
            {label === '__custom__' && (
              <input className="opt-input" style={{marginTop:8}} value={customLabel}
                placeholder="Enter speaker name or role…"
                onChange={e => setCustomLabel(e.target.value)} />
            )}
          </div>
          <p className="modal-field-note">All selected files will be filed under this label. Import multiple times for multiple speakers.</p>
        </div>

        {error && <p className="modal-error">{error}</p>}

        <div className="modal-actions">
          <button className="ghost-btn" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn btn--primary" onClick={handleSave} disabled={saving}>
            {saving ? <><Spinner />Saving…</> : `Import ${selectedFiles.length > 0 ? selectedFiles.length + ' file' + (selectedFiles.length !== 1 ? 's' : '') : ''}`}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── LibraryFile ───────────────────────────────────────────────────────────────

function LibraryFile({ file }) {
  const audioRef = useRef(null)
  const [playing, setPlaying] = useState(false)
  const [current, setCurrent] = useState(0)
  const [duration, setDuration] = useState(0)
  const src = convertFileSrc(file.path)

  const toggle = () => {
    const a = audioRef.current; if (!a) return
    if (playing) { a.pause(); setPlaying(false) } else { a.play().then(() => setPlaying(true)).catch(() => {}) }
  }

  return (
    <div className="lib-file">
      <audio ref={audioRef} src={src} preload="metadata"
        onLoadedMetadata={e => setDuration(e.target.duration)}
        onTimeUpdate={e => setCurrent(e.target.currentTime)}
        onEnded={() => { setPlaying(false); setCurrent(0) }} />
      <span className={`lib-fmt-badge lib-fmt-badge--${file.format}`}>{file.format.toUpperCase()}</span>
      <span className="lib-file-name" title={file.path}>{basename(file.path)}</span>
      <span className="lib-file-size">{fmtSize(file.size)}</span>
      <button className="play-btn" onClick={toggle}>
        {playing
          ? <svg width="10" height="10" viewBox="0 0 10 10"><rect x="1" y="1" width="3" height="8" rx="1" fill="currentColor"/><rect x="6" y="1" width="3" height="8" rx="1" fill="currentColor"/></svg>
          : <svg width="10" height="10" viewBox="0 0 10 10"><path d="M2 1.5l7 3.5-7 3.5V1.5z" fill="currentColor"/></svg>}
      </button>
      {duration > 0 && (
        <div className="player-track" style={{width:'80px'}} onClick={e => {
          const r = e.currentTarget.getBoundingClientRect()
          if (audioRef.current && duration) audioRef.current.currentTime = ((e.clientX-r.left)/r.width)*duration
        }}>
          <div className="player-fill" style={{width:`${(current/duration)*100}%`}}/>
        </div>
      )}
      {duration > 0 && <span className="player-time">{fmtTime(current)}</span>}
    </div>
  )
}

// ── Small components ──────────────────────────────────────────────────────────

function Toggle({ checked, onChange }) {
  return (
    <div className={`toggle${checked?' toggle--on':''}`} onClick={() => onChange(!checked)}>
      <div className="toggle-thumb"/>
    </div>
  )
}

function StatusChip({ status }) {
  const map = { waiting:['chip','Waiting'], queued:['chip','Queued'], converting:['chip chip--active','● Processing'], done:['chip chip--done','✓ Done'], error:['chip chip--error','✗ Failed'] }
  const [cls, label] = map[status] || map.waiting
  return <span className={cls}>{label}</span>
}

function ModeIcon({ id, active }) {
  const color = active ? 'var(--gold)' : 'var(--sub)'
  if (id === 'stereo') return (
    <div className="mode-card-icon" style={{background: active ? 'var(--gold-dim)' : '', borderColor: active ? 'var(--gold)' : ''}}>
      <svg width="22" height="16" viewBox="0 0 22 16" fill="none">
        <rect x="0" y="7" width="3" height="2" rx="1" fill={color} opacity=".4"/>
        <rect x="4.5" y="4" width="3" height="8" rx="1.5" fill={color} opacity=".65"/>
        <rect x="9.5" y="0" width="3" height="16" rx="1.5" fill={color}/>
        <rect x="14.5" y="4" width="3" height="8" rx="1.5" fill={color} opacity=".65"/>
        <rect x="19" y="7" width="3" height="2" rx="1" fill={color} opacity=".4"/>
      </svg>
    </div>
  )
  if (id === 'keep') return (
    <div className="mode-card-icon" style={{background: active ? 'var(--gold-dim)' : '', borderColor: active ? 'var(--gold)' : ''}}>
      <svg width="22" height="16" viewBox="0 0 22 16" fill="none">
        <rect x="0" y="3" width="3.5" height="10" rx="1.75" fill={color} opacity=".5"/>
        <rect x="4.5" y="0" width="3.5" height="16" rx="1.75" fill={color}/>
        <rect x="9.5" y="5" width="3" height="6" rx="1.5" fill={color} opacity=".7"/>
        <rect x="14.5" y="1" width="3.5" height="14" rx="1.75" fill={color} opacity=".85"/>
        <rect x="19" y="3" width="3.5" height="10" rx="1.75" fill={color} opacity=".5"/>
      </svg>
    </div>
  )
  const cs = active ? CH_COLORS : ['var(--sub)','var(--sub)','var(--sub)','var(--sub)']
  return (
    <div className="mode-card-icon" style={{background: active ? 'var(--gold-dim)' : '', borderColor: active ? 'var(--gold)' : ''}}>
      <svg width="22" height="16" viewBox="0 0 22 16" fill="none">
        <rect x="0" y="3" width="4" height="10" rx="2" fill={cs[0]} opacity={active?1:.5}/>
        <rect x="5.5" y="0" width="4" height="16" rx="2" fill={cs[1]} opacity={active?1:.9}/>
        <rect x="12.5" y="3" width="4" height="10" rx="2" fill={cs[2]} opacity={active?1:.7}/>
        <rect x="18.5" y="6" width="3.5" height="4" rx="1.75" fill={cs[3]} opacity={active?1:.4}/>
      </svg>
    </div>
  )
}

function WaveformIcon() {
  return (
    <svg width="52" height="32" viewBox="0 0 52 32" fill="none" className="drop-wave">
      {[[0,14,4,4],[5,10,4,12],[10,5,4,22],[15,1,4,30],[20,4,4,24],[25,8,4,16],[30,5,4,22],[35,10,4,12],[40,13,4,6],[45,15,4,2]].map(([x,y,w,h],i) => (
        <rect key={i} x={x} y={y} width={w} height={h} rx={w/2} fill="var(--gold)" opacity={[.2,.35,.5,.65,.8,1,.8,.65,.45,.25][i]}/>
      ))}
    </svg>
  )
}

function LogoSvg() {
  return (
    <svg width="32" height="32" viewBox="0 0 38 38" fill="none">
      <circle cx="19" cy="19" r="17.5" stroke="var(--gold)" strokeWidth="1.5" opacity=".3"/>
      <rect x="7" y="21" width="3.5" height="9" rx="1.75" fill="var(--gold)" opacity=".38"/>
      <rect x="12" y="14" width="3.5" height="16" rx="1.75" fill="var(--gold)" opacity=".65"/>
      <rect x="17" y="8" width="4" height="22" rx="2" fill="var(--gold)"/>
      <rect x="23" y="14" width="3.5" height="16" rx="1.75" fill="var(--gold)" opacity=".65"/>
      <rect x="28" y="21" width="3.5" height="9" rx="1.75" fill="var(--gold)" opacity=".38"/>
    </svg>
  )
}

function Spinner() {
  return <svg className="spinner" width="14" height="14" viewBox="0 0 14 14"><circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="2" fill="none" strokeDasharray="20 12" strokeLinecap="round"/></svg>
}
