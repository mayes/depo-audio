use std::path::Path;

use regex::Regex;
use tauri::{AppHandle, Emitter};
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;

use crate::helpers::{ffmpeg_bin_name, ffprobe_bin_name};
use crate::types::{ConvertJob, ProgressEvent};

// ── Probe helpers ─────────────────────────────────────────────────────────────

pub(crate) async fn probe_duration(app: &AppHandle, feed: &Path, input_codec: &[String]) -> Option<f64> {
    let mut args = input_codec.to_vec();
    args.extend(vec![
        "-v".into(), "quiet".into(),
        "-print_format".into(), "json".into(),
        "-show_format".into(),
        feed.to_string_lossy().to_string(),
    ]);
    let output = app.shell().sidecar(ffprobe_bin_name()).ok()?
        .args(args).output().await.ok()?;
    let text = String::from_utf8_lossy(&output.stdout);
    let v: serde_json::Value = serde_json::from_str(&text).ok()?;
    v["format"]["duration"].as_str()?.parse::<f64>().ok()
}

pub(crate) async fn probe_channels(app: &AppHandle, feed: &Path, input_codec: &[String]) -> u32 {
    let mut args = input_codec.to_vec();
    args.extend(vec![
        "-v".into(), "quiet".into(),
        "-print_format".into(), "json".into(),
        "-show_streams".into(),
        "-select_streams".into(), "a:0".into(),
        feed.to_string_lossy().to_string(),
    ]);
    let ok = app.shell().sidecar(ffprobe_bin_name())
        .and_then(|s| Ok(s.args(args)))
        .ok();
    if let Some(cmd) = ok {
        if let Ok(out) = cmd.output().await {
            let text = String::from_utf8_lossy(&out.stdout);
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(&text) {
                if let Some(ch) = v["streams"][0]["channels"].as_u64() {
                    if ch > 0 { return ch as u32; }
                }
            }
        }
    }
    4
}

// ── Filter chain builder ─────────────────────────────────────────────────────

/// Processing filter parameters — extracted from ConvertJob so preview can reuse this.
pub(crate) struct ProcOpts {
    pub hpf: bool,
    pub normalize: bool,
    pub trim: bool,
    pub fade: bool,
    pub fade_dur: f64,
}

impl From<&ConvertJob> for ProcOpts {
    fn from(j: &ConvertJob) -> Self {
        Self { hpf: j.hpf, normalize: j.normalize, trim: j.trim, fade: j.fade, fade_dur: j.fade_dur }
    }
}

pub(crate) async fn build_proc_filters(app: &AppHandle, opts: &ProcOpts, feed: &Path, input_codec: &[String]) -> Vec<String> {
    let mut filters = Vec::new();
    if opts.hpf        { filters.push("highpass=f=80".into()); }
    if opts.normalize  { filters.push("loudnorm=I=-16:TP=-1.5:LRA=11".into()); }
    if opts.trim       { filters.push("silenceremove=start_periods=1:start_duration=0.3:start_threshold=-50dB:stop_periods=-1:stop_duration=0.3:stop_threshold=-50dB".into()); }
    if opts.fade {
        let dur = probe_duration(app, feed, input_codec).await;
        filters.push(format!("afade=t=in:d={}", opts.fade_dur));
        if let Some(d) = dur {
            let start = (d - opts.fade_dur).max(0.0);
            filters.push(format!("afade=t=out:st={start:.3}:d={}", opts.fade_dur));
        }
    }
    filters
}

/// Run FFmpeg without progress tracking — for short preview clips
pub(crate) async fn run_ffmpeg_silent(app: &AppHandle, args: Vec<String>) -> Result<(), String> {
    let output = app
        .shell()
        .sidecar(ffmpeg_bin_name())
        .map_err(|e| e.to_string())?
        .args(args)
        .output()
        .await
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let lines: Vec<&str> = stderr.lines()
            .filter(|l| !l.starts_with("ffmpeg version") && !l.starts_with("built") && !l.starts_with("lib") && !l.starts_with("configuration:"))
            .collect();
        let msg = lines.iter().rev().take(4).cloned().collect::<Vec<_>>().into_iter().rev().collect::<Vec<_>>().join(" | ");
        return Err(msg.chars().take(300).collect());
    }
    Ok(())
}

// ── Run FFmpeg sidecar ────────────────────────────────────────────────────────

pub(crate) async fn run_ffmpeg(app: &AppHandle, args: Vec<String>, job_id: &str) -> Result<(), String> {
    let (mut rx, _child) = app
        .shell()
        .sidecar(ffmpeg_bin_name())
        .map_err(|e| e.to_string())?
        .args(args)
        .spawn()
        .map_err(|e| e.to_string())?;

    let mut stderr_acc = String::new();
    let time_re = Regex::new(r"time=(\d+):(\d+):(\d+\.\d+)").unwrap();

    while let Some(event) = rx.recv().await {
        match event {
            CommandEvent::Stderr(bytes) => {
                let line = String::from_utf8_lossy(&bytes).to_string();
                stderr_acc.push_str(&line);
                if let Some(cap) = time_re.captures(&line) {
                    let h: f64 = cap[1].parse().unwrap_or(0.0);
                    let m: f64 = cap[2].parse().unwrap_or(0.0);
                    let s: f64 = cap[3].parse().unwrap_or(0.0);
                    let secs = h * 3600.0 + m * 60.0 + s;
                    let _ = app.emit("convert:progress", ProgressEvent { id: job_id.to_string(), seconds: secs });
                }
            }
            CommandEvent::Terminated(status) => {
                if status.code != Some(0) {
                    let lines: Vec<&str> = stderr_acc.lines()
                        .filter(|l| !l.starts_with("ffmpeg version") && !l.starts_with("built") && !l.starts_with("lib") && !l.starts_with("configuration:"))
                        .collect();
                    let msg = lines.iter().rev().take(4).cloned().collect::<Vec<_>>().into_iter().rev().collect::<Vec<_>>().join(" | ");
                    return Err(msg.chars().take(300).collect());
                }
                return Ok(());
            }
            _ => {}
        }
    }
    Ok(())
}
