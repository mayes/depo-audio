import { useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import { FORMATS_OUT, CH_COLORS } from '../../constants'
import Toggle from '../common/Toggle'
import Spinner from '../common/Spinner'
import { fmtSize, fmtTime } from '../../utils'

export default function MergeTab() {
  const [sources, setSources] = useState([])
  const [outDir, setOutDir] = useState('')
  const [outName, setOutName] = useState('')
  const [format, setFormat] = useState('wav')
  const [rate, setRate] = useState('48000')
  const [strategy, setStrategy] = useState('best_quality')
  const [syncing, setSyncing] = useState(false)
  const [merging, setMerging] = useState(false)
  const [syncResults, setSyncResults] = useState([])
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  const browseFiles = async () => {
    try {
      const selected = await open({
        multiple: true,
        filters: [{ name: 'Audio', extensions: ['wav','mp3','flac','opus','ogg','m4a','aac','wma','aif','aiff','sgmca','trm','ftr','bwf'] }],
      })
      if (selected) {
        const paths = Array.isArray(selected) ? selected : [selected]
        const newSources = paths.map(p => {
          const path = typeof p === 'string' ? p : p.path
          return { path, name: path.split('/').pop().split('\\').pop() }
        })
        setSources(prev => [...prev, ...newSources])
        setResult(null)
        setError('')
      }
    } catch {}
  }

  const removeSource = (idx) => {
    setSources(prev => prev.filter((_, i) => i !== idx))
    setSyncResults([])
    setResult(null)
  }

  const handleSync = async () => {
    if (sources.length < 2) return
    setSyncing(true)
    setError('')
    try {
      const results = []
      for (let i = 1; i < sources.length; i++) {
        const sync = await invoke('detect_sync_cmd', {
          sourceA: sources[0].path,
          sourceB: sources[i].path,
        })
        results.push(sync)
      }
      setSyncResults(results)
    } catch (e) {
      setError(String(e))
    }
    setSyncing(false)
  }

  const handleMerge = async () => {
    if (sources.length < 2 || merging) return
    setMerging(true)
    setError('')
    setResult(null)
    try {
      const res = await invoke('merge_audio_cmd', {
        job: {
          sources: sources.map(s => s.path),
          outDir,
          outName: outName || 'merged',
          format,
          rate: format === 'opus' ? '48000' : rate,
          strategy,
        }
      })
      setResult(res)
    } catch (e) {
      setError(String(e))
    }
    setMerging(false)
  }

  return (
    <>
      <div className="main-scroll">
        <div className="content">

          {/* ── Source Files ──────────────────────────────── */}
          <section className="panel">
            <div className="panel-head">
              <span className="panel-label">RECORDINGS TO MERGE</span>
              <button className="btn btn--sm" onClick={browseFiles}>Add Files</button>
            </div>

            {sources.length === 0 ? (
              <div className="merge-empty" onClick={browseFiles}>
                <p className="merge-empty-title">Add two or more recordings of the same event</p>
                <p className="merge-empty-sub">DepoAudio will sync them automatically and combine the clearest parts into one clean file.</p>
              </div>
            ) : (
              <div className="merge-sources">
                {sources.map((s, i) => (
                  <div key={i} className="merge-source-row">
                    <span className="merge-source-dot" style={{background: CH_COLORS[i % 4]}} />
                    <span className="merge-source-num">{i === 0 ? 'Reference' : `Source ${i + 1}`}</span>
                    <span className="merge-source-name" title={s.path}>{s.name}</span>
                    {syncResults[i - 1] && i > 0 && (
                      <span className={`merge-sync-badge${syncResults[i-1].isSameEvent ? ' merge-sync-badge--ok' : ' merge-sync-badge--warn'}`}>
                        {syncResults[i-1].isSameEvent
                          ? `${syncResults[i-1].offsetSeconds > 0 ? '+' : ''}${syncResults[i-1].offsetSeconds.toFixed(1)}s offset`
                          : 'May not match'}
                      </span>
                    )}
                    <button className="merge-source-remove" onClick={() => removeSource(i)}>
                      <svg width="9" height="9" viewBox="0 0 9 9"><path d="M1 1l7 7M8 1L1 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* ── Merge Options ────────────────────────────── */}
          {sources.length >= 2 && (
            <section className="panel panel--tight">
              <div className="panel-head"><span className="panel-label">MERGE OPTIONS</span></div>

              <div className="merge-strategy">
                <label className="merge-strategy-option">
                  <input type="radio" name="strategy" value="best_quality" checked={strategy === 'best_quality'}
                    onChange={() => setStrategy('best_quality')} />
                  <div>
                    <span className="merge-strategy-name">Best quality</span>
                    <span className="merge-strategy-desc">Picks the clearest source for each moment — fills gaps automatically</span>
                  </div>
                </label>
                <label className="merge-strategy-option">
                  <input type="radio" name="strategy" value="mix_all" checked={strategy === 'mix_all'}
                    onChange={() => setStrategy('mix_all')} />
                  <div>
                    <span className="merge-strategy-name">Mix all together</span>
                    <span className="merge-strategy-desc">Blends all sources equally — louder but keeps everything</span>
                  </div>
                </label>
              </div>

              <div className="opts-row" style={{paddingTop: 8}}>
                <div className="opt-block opt-block--grow">
                  <label className="opt-label">OUTPUT NAME</label>
                  <input className="opt-input" value={outName} placeholder="merged"
                    onChange={e => setOutName(e.target.value)} />
                </div>
                <div className="opt-block">
                  <label className="opt-label">FORMAT</label>
                  <div className="format-tabs">
                    {FORMATS_OUT.map(f => (
                      <button key={f.id} title={f.desc}
                        className={`fmt-tab${format===f.id?' fmt-tab--active':''}`}
                        onClick={() => setFormat(f.id)}>{f.label}</button>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* ── Sync & Result ────────────────────────────── */}
          {result && (
            <section className="panel merge-result">
              <div className="panel-head"><span className="panel-label">MERGED OUTPUT</span></div>
              <div className="merge-result-info">
                <span className="merge-result-name">{result.outputName}</span>
                <span className="merge-result-meta">
                  {fmtTime(result.duration)} · {fmtSize(result.outputSize)} · {result.sourcesUsed} sources
                </span>
                {result.syncOffsets.length > 1 && (
                  <span className="merge-result-offsets">
                    Sync offsets: {result.syncOffsets.slice(1).map(o => `${o > 0 ? '+' : ''}${o.toFixed(1)}s`).join(', ')}
                  </span>
                )}
              </div>
            </section>
          )}

          {error && <p className="merge-error">{error}</p>}

        </div>
      </div>

      <footer className="bottombar">
        <div className="bottombar-status">
          {syncing && <span className="status-pill status-pill--active"><span className="status-dot"/>Detecting sync…</span>}
          {merging && <span className="status-pill status-pill--active"><span className="status-dot"/>Merging…</span>}
          {result && !merging && <span className="status-pill status-pill--done">Merge complete</span>}
        </div>
        <div style={{display:'flex', gap: 8}}>
          {sources.length >= 2 && !merging && (
            <button className="btn btn--sm" onClick={handleSync} disabled={syncing}>
              {syncing ? <><Spinner />Syncing…</> : 'Check Sync'}
            </button>
          )}
          <button className={`btn btn--primary${merging || sources.length < 2 ? ' btn--disabled' : ''}`}
            onClick={handleMerge} disabled={merging || sources.length < 2}>
            {merging ? <><Spinner />Merging…</> : 'Merge'}
          </button>
        </div>
      </footer>
    </>
  )
}
