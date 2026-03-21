import { useState, useCallback, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'

let jobCounter = 0

export default function useConversion() {
  const [jobs, setJobs]             = useState({})
  const [converting, setConverting] = useState(false)
  const cancelledRef                = useRef(false)
  const unlistenersRef              = useRef([])

  const cancelConversion = useCallback(() => {
    cancelledRef.current = true
  }, [])

  const startConversion = useCallback(async ({ files, outDir, mode, formatOut, rate, labels, chanVols, normalize, trim, fade, fadeDur, hpf, mp3Bitrate, caseName, setCases }) => {
    if (converting || !files.length) return
    cancelledRef.current = false
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

    unlistenersRef.current = [unlistenProg, unlistenDone, unlistenErr]

    for (const file of files) {
      // Check if cancelled before starting next file
      if (cancelledRef.current) {
        setJobs(prev => {
          const updated = { ...prev }
          for (const [path, j] of Object.entries(updated)) {
            if (j.status === 'queued') updated[path] = { ...j, status: 'error', error: 'Cancelled' }
          }
          return updated
        })
        break
      }

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
          mp3Bitrate: formatOut === 'mp3' ? mp3Bitrate : null,
          caseName: caseName || null
        }}).catch(e => {
          setJobs(prev => ({ ...prev, [file.path]: { ...prev[file.path], status:'error', error: String(e) } }))
          clearInterval(poll); resolve()
        })
      })
    }

    // Clean up event listeners
    for (const unlisten of unlistenersRef.current) {
      await unlisten()
    }
    unlistenersRef.current = []

    setConverting(false)
    invoke('library_get').then(setCases).catch(e => console.error('Failed to reload library:', e))
  }, [converting])

  const retryFile = useCallback(async (file, params) => {
    if (converting) return
    const id = `job_${++jobCounter}`
    setJobs(prev => ({ ...prev, [file.path]: { status: 'converting', id, outputs: [], error: null } }))

    const unProg = await listen('convert:progress', ({ payload }) => {
      if (payload.id !== id) return
      setJobs(prev => ({ ...prev, [file.path]: { ...prev[file.path], seconds: payload.seconds } }))
    })
    const unDone = await listen('convert:done', ({ payload }) => {
      if (payload.id !== id) return
      setJobs(prev => ({ ...prev, [file.path]: { ...prev[file.path], status: 'done', outputs: payload.files } }))
    })
    const unErr = await listen('convert:error', ({ payload }) => {
      if (payload.id !== id) return
      setJobs(prev => ({ ...prev, [file.path]: { ...prev[file.path], status: 'error', error: payload.message } }))
    })

    const resolved = params.outDir || file.path.replace(/\\/g, '/').split('/').slice(0, -1).join('/')
    try {
      await invoke('convert', { job: {
        id, srcPath: file.path, outDir: resolved, mode: params.mode,
        format: params.formatOut, rate: params.formatOut === 'opus' ? '48000' : params.rate,
        labels: params.labels, chanVols: params.chanVols,
        normalize: params.normalize, trim: params.trim,
        fade: params.fade, fadeDur: params.fadeDur, hpf: params.hpf,
        mp3Bitrate: params.formatOut === 'mp3' ? params.mp3Bitrate : null,
        caseName: params.caseName || null,
      }})
    } catch (e) {
      setJobs(prev => ({ ...prev, [file.path]: { ...prev[file.path], status: 'error', error: String(e) } }))
    }

    await unProg(); await unDone(); await unErr()
  }, [converting])

  const doneCount = Object.values(jobs).filter(j => j.status === 'done').length
  const failCount = Object.values(jobs).filter(j => j.status === 'error').length

  return { jobs, setJobs, converting, startConversion, cancelConversion, retryFile, doneCount, failCount }
}
