import { useState, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import { basename } from './utils'

import useTheme from './hooks/useTheme'
import usePreferences from './hooks/usePreferences'
import useFileDrop from './hooks/useFileDrop'
import useConversion from './hooks/useConversion'
import useUpdater from './hooks/useUpdater'
import usePlayer from './hooks/usePlayer'

import { LogoSvg } from './components/common/Icons'
import UpdateBanner from './components/common/UpdateBanner'
import PlayerBar from './components/common/PlayerBar'
import QueuePanel from './components/common/QueuePanel'
import ConvertTab from './components/Convert/ConvertTab'
import LibraryTab from './components/Library/LibraryTab'

export default function App() {
  const [tab, setTab] = useState('convert')

  // Custom hooks
  const { themePref, themeLabel, cycleTheme } = useTheme()
  const prefs = usePreferences()
  const fileDrop = useFileDrop()
  const conversion = useConversion()
  const updater = useUpdater()
  const player = usePlayer()

  const openFiles = async () => {
    const selected = await openDialog({
      multiple: true,
      filters: [{ name: 'Audio', extensions: ['wav','mp3','flac','opus','ogg','m4a','aac','wma','aif','aiff','sgmca','trm','ftr','bwf'] }],
    })
    if (!selected) return
    const paths = Array.isArray(selected) ? selected : [selected]
    const files = paths.map(p => ({ path: p, name: p.split(/[\/]/).pop() }))
    player.playAll(files)
  }

  // Library state
  const [cases, setCases]     = useState([])
  const [libSearch, setLibSearch] = useState('')

  // Load library when switching to library tab
  useEffect(() => {
    if (tab === 'library') {
      invoke('library_get').then(setCases).catch(() => {})
    }
  }, [tab])

  const handleStartConversion = () => {
    conversion.startConversion({
      files: fileDrop.files, outDir: prefs.outDir, mode: prefs.mode,
      formatOut: prefs.formatOut, rate: prefs.rate,
      labels: prefs.labels, chanVols: prefs.chanVols,
      normalize: prefs.normalize, trim: prefs.trim,
      fade: prefs.fade, fadeDur: prefs.fadeDur, hpf: prefs.hpf,
      caseName: fileDrop.caseName, setCases,
    })
  }

  return (
    <div className="app">
      {/* ── Update Banner */}
      {updater.visible && (
        <UpdateBanner
          update={updater.update}
          downloading={updater.downloading}
          progress={updater.progress}
          onInstall={updater.installUpdate}
          onSkip={updater.skipVersion}
          onDismiss={updater.dismiss}
        />
      )}

      {/* ── Topbar */}
      <header className="topbar">
        <div className="topbar-brand">
          <LogoSvg />
          <div className="topbar-text">
            <span className="topbar-title">DepoAudio</span>
            <span className="topbar-tagline">Court Recording Converter</span>
          </div>
        </div>
        <nav className="topbar-tabs" role="tablist" aria-label="Main navigation">
          <button role="tab" aria-selected={tab==='convert'} className={`tab-btn${tab==='convert'?' tab-btn--active':''}`} onClick={() => setTab('convert')}>Convert</button>
          <button role="tab" aria-selected={tab==='library'} className={`tab-btn${tab==='library'?' tab-btn--active':''}`} onClick={() => setTab('library')}>
            Library {cases.filter(c=>!c.archived).length > 0 && <span className="tab-badge">{cases.filter(c=>!c.archived).length}</span>}
          </button>
        </nav>
        <div className="topbar-right">
          <button className="topbar-open-btn" title="Open audio files" onClick={openFiles} aria-label="Open audio files for playback">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M2 3h4l1.5 1.5H12a1 1 0 0 1 1 1V11a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" stroke="currentColor" strokeWidth="1.2"/>
            </svg>
          </button>
          <button className="theme-btn" title={`Theme: ${themePref}`} onClick={cycleTheme} aria-label={`Switch theme, currently ${themePref}`}>{themeLabel}</button>
        </div>
      </header>

      {tab === 'convert' && (
        <ConvertTab
          prefs={prefs}
          fileDrop={fileDrop}
          conversion={conversion}
          startConversion={handleStartConversion}
          player={player}
        />
      )}

      {tab === 'library' && (
        <LibraryTab
          cases={cases} setCases={setCases}
          search={libSearch} setSearch={setLibSearch}
          labels={prefs.labels}
          player={player}
          onReexport={(srcPath, srcCaseName) => {
            fileDrop.setFiles([{path:srcPath, name:basename(srcPath), fmt:null}])
            fileDrop.setCaseName(srcCaseName || '')
            setTab('convert')
          }}
        />
      )}

      {/* Global audio element */}
      <audio ref={player.audioRef} preload="metadata" {...player.handlers} />

      {/* Queue panel (slides up above player bar) */}
      <QueuePanel player={player} />

      {/* Persistent player bar */}
      <PlayerBar player={player} />
    </div>
  )
}
