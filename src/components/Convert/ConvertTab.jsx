import { MODES, FORMATS_OUT, CH_COLORS } from '../../constants'
import Toggle from '../common/Toggle'
import Spinner from '../common/Spinner'
import { ModeIcon, WaveformIcon } from '../common/Icons'
import FormatTable from './FormatTable'
import FileRow from './FileRow'

export default function ConvertTab({ prefs, fileDrop, conversion, startConversion }) {
  const {
    mode, setMode, formatOut, setFormatOut, labels, setLabels,
    chanVols, setChanVols, outDir, setOutDir, rate, setRate,
    normalize, setNormalize, trim, setTrim, fade, setFade,
    fadeDur, setFadeDur, hpf, setHpf,
  } = prefs
  const {
    files, dragOver, caseName, setCaseName,
    onDragOver, onDragLeave, onDrop, browseFiles, browseOutDir,
    removeFile, clearAll,
  } = fileDrop
  const { jobs, converting, doneCount, failCount } = conversion

  const anyProc = normalize || trim || fade || hpf

  return (
    <>
      <div className="main-scroll">
        <div className="content">

          {/* ── OUTPUT MODE ──────────────────────────────────────────────── */}
          <section className="panel" aria-label="Output mode">
            <div className="panel-head"><span className="panel-label">OUTPUT MODE</span></div>
            <div className="mode-grid" role="radiogroup" aria-label="Output mode selection">
              {MODES.map(m => (
                <button key={m.id} role="radio" aria-checked={mode===m.id} aria-label={m.label}
                  className={`mode-card${mode===m.id?' mode-card--active':''}`} onClick={() => setMode(m.id)}>
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

          {/* ── CHANNEL LABELS ──────────────────────────────────────────── */}
          <section className="panel panel--tight" aria-label="Channel labels">
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
                    aria-label={`Channel ${i+1} label`}
                    onChange={e => setLabels(p => p.map((v,j) => j===i ? e.target.value:v))} />
                </div>
              ))}
            </div>
          </section>

          {/* ── CHANNEL MIX ─────────────────────────────────────────────── */}
          <section className={`panel panel--tight${mode !== 'stereo' ? ' panel--muted' : ''}`} aria-label="Channel mix">
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
                    aria-label={`${labels[i]||`Channel ${i+1}`} volume`}
                    onChange={e => setChanVols(p => p.map((x,j) => j===i ? parseFloat(e.target.value):x))} />
                  <span className="chan-vol-val">{v===0?'mute':v.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </section>

          {/* ── PROCESSING ───────────────────────────────────────────────── */}
          <section className="panel panel--tight" aria-label="Audio processing">
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
                          aria-label="Fade duration in seconds"
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
            <div className="proc-chain" role="status" aria-label="Processing chain">
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
              <label className="opt-label" htmlFor="case-name">CASE NAME</label>
              <input id="case-name" className="opt-input" value={caseName} placeholder="Auto-detected from filename — override here"
                onChange={e => setCaseName(e.target.value)} />
            </div>
            <div className="opt-block opt-block--grow">
              <label className="opt-label" htmlFor="out-dir">OUTPUT FOLDER</label>
              <div className="opt-inline">
                <input id="out-dir" className="opt-input" value={outDir} placeholder="Default: same folder as source"
                  onChange={e => setOutDir(e.target.value)} />
                <button className="btn btn--sm" onClick={() => browseOutDir(setOutDir)}>Browse</button>
              </div>
            </div>
            <div className="opt-block">
              <label className="opt-label" htmlFor="sample-rate">SAMPLE RATE</label>
              <select id="sample-rate" className="opt-select" value={formatOut === 'opus' ? '48000' : rate}
                disabled={formatOut === 'opus'}
                title={formatOut === 'opus' ? 'Opus is always 48 kHz' : ''}
                onChange={e => setRate(e.target.value)}>
                <option value="22050">22,050 Hz</option>
                <option value="44100">44,100 Hz</option>
                <option value="48000">48,000 Hz</option>
              </select>
            </div>
            <div className="opt-block">
              <span className="opt-label">OUTPUT FORMAT</span>
              <div className="format-tabs" role="radiogroup" aria-label="Output format">
                {FORMATS_OUT.map(f => (
                  <button key={f.id} title={f.desc} role="radio" aria-checked={formatOut===f.id}
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
            onClick={browseFiles} role="button" tabIndex={0} aria-label="Drop audio files here or click to browse">
            <WaveformIcon />
            <p className="drop-title">Drop audio files here</p>
            <p className="drop-sub">or <span className="drop-link">click to browse</span> — SGMCA · TRM · BWF · WAV · MP3 · FLAC · Opus and more</p>
          </div>

          {files.length > 0 && (
            <div className="filelist-wrap">
              <div className="filelist-head">
                <span className="filelist-count">{files.length} file{files.length!==1?'s':''} queued</span>
                {!converting && <button className="ghost-btn" onClick={() => clearAll(converting)}>Clear all</button>}
              </div>
              <div className="filelist" role="list" aria-label="Queued files">
                {files.map(f => <FileRow key={f.path} file={f} job={jobs[f.path]} onRemove={() => removeFile(f.path, converting)} converting={converting} />)}
              </div>
            </div>
          )}

        </div>
      </div>

      <footer className="bottombar">
        <div className="bottombar-status" role="status" aria-live="polite">
          {converting && <span className="status-pill status-pill--active"><span className="status-dot"/>{doneCount > 0 ? `${doneCount} / ${files.length} done` : 'Converting…'}</span>}
          {!converting && doneCount > 0 && <span className="status-pill status-pill--done">✓ {doneCount} file{doneCount!==1?'s':''} converted{failCount>0?`, ${failCount} failed`:''}</span>}
        </div>
        <button className={`btn btn--primary${converting||!files.length?' btn--disabled':''}`}
          onClick={startConversion} disabled={converting||!files.length}
          aria-label={converting ? 'Converting files' : `Convert ${files.length} file${files.length!==1?'s':''}`}>
          {converting ? <><Spinner />Converting…</> : <>▶ Convert{files.length > 1 ? ` ${files.length} Files` : ''}</>}
        </button>
      </footer>
    </>
  )
}
