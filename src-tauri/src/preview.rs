use std::collections::hash_map::DefaultHasher;
use std::fs;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::ffmpeg::{build_proc_filters, probe_channels, probe_duration, run_ffmpeg_silent, ProcOpts};
use crate::helpers::{detect_format_for_path, strip_sgmca_header};

// ── Types ─────────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PreviewRequest {
    pub src_path: String,
    pub preview_type: String,    // "channel" | "mix" | "processing"
    pub channel: Option<u32>,    // which channel (for "channel" type)
    pub chan_vols: Vec<f64>,     // volume settings (for "mix" / "processing")
    pub start_sec: f64,          // where to start the clip
    pub duration: f64,           // clip length in seconds
    pub normalize: bool,
    pub trim: bool,
    pub fade: bool,
    pub fade_dur: f64,
    pub hpf: bool,
    pub mode: String,
}

// ── Cache key ─────────────────────────────────────────────────────────────────

fn preview_cache_key(req: &PreviewRequest) -> String {
    let mut hasher = DefaultHasher::new();
    req.src_path.hash(&mut hasher);
    req.preview_type.hash(&mut hasher);
    req.channel.hash(&mut hasher);
    // Hash chan_vols as bits for determinism
    for v in &req.chan_vols {
        v.to_bits().hash(&mut hasher);
    }
    req.start_sec.to_bits().hash(&mut hasher);
    req.duration.to_bits().hash(&mut hasher);
    req.normalize.hash(&mut hasher);
    req.trim.hash(&mut hasher);
    req.fade.hash(&mut hasher);
    req.fade_dur.to_bits().hash(&mut hasher);
    req.hpf.hash(&mut hasher);
    req.mode.hash(&mut hasher);
    format!("{:016x}", hasher.finish())
}

fn preview_path(hash: &str) -> PathBuf {
    std::env::temp_dir().join(format!("depoaudio_preview_{}.wav", hash))
}

// ── Generate preview ──────────────────────────────────────────────────────────

pub(crate) async fn generate_preview(app: &AppHandle, req: &PreviewRequest) -> Result<String, String> {
    let hash = preview_cache_key(req);
    let out_path = preview_path(&hash);

    // Return cached file if it exists and has content
    if out_path.exists() && fs::metadata(&out_path).map(|m| m.len()).unwrap_or(0) > 0 {
        return Ok(out_path.to_string_lossy().to_string());
    }

    // Detect format and prepare feed
    let fmt = detect_format_for_path(&req.src_path)
        .ok_or("Unrecognised file format")?;

    if fmt.handler == "rejected" {
        return Err(fmt.note.unwrap_or_else(|| "This format cannot be converted.".into()));
    }

    let src = Path::new(&req.src_path);
    let (feed_path, is_temp) = if fmt.handler == "sgmca" {
        strip_sgmca_header(src)?
    } else {
        (src.to_path_buf(), false)
    };

    let result = generate_preview_inner(app, req, &feed_path, &fmt.handler).await;

    if is_temp { let _ = fs::remove_file(&feed_path); }

    result.map(|_| out_path.to_string_lossy().to_string())
}

async fn generate_preview_inner(
    app: &AppHandle,
    req: &PreviewRequest,
    feed: &Path,
    handler: &str,
) -> Result<(), String> {
    let input_codec: Vec<String> = if handler == "ftr" {
        vec!["-acodec".into(), "aac".into()]
    } else {
        vec![]
    };

    let hash = preview_cache_key(req);
    let out_path = preview_path(&hash);

    // Determine start position — clamp if file is shorter
    let file_dur = probe_duration(app, feed, &input_codec).await.unwrap_or(60.0);
    let start = if file_dur > req.start_sec + req.duration {
        req.start_sec
    } else if file_dur > req.duration {
        (file_dur - req.duration) / 2.0  // Center the clip
    } else {
        0.0
    };

    let mut args: Vec<String> = Vec::new();

    // Input seeking (fast, before -i)
    args.extend(input_codec.clone());
    args.extend(["-ss".into(), format!("{:.3}", start)]);
    args.extend(["-t".into(), format!("{:.3}", req.duration)]);
    args.extend(["-i".into(), feed.to_string_lossy().to_string()]);

    match req.preview_type.as_str() {
        "channel" => {
            let ch = req.channel.unwrap_or(0);
            let num_ch = probe_channels(app, feed, &input_codec).await;
            // Build channelsplit tags
            let tags: Vec<String> = (0..num_ch).map(|i| format!("ch{}", i)).collect();
            let fc = format!("[0:a]channelsplit[{}]", tags.join("]["));
            args.extend(["-filter_complex".into(), fc]);
            args.extend(["-map".into(), format!("[ch{}]", ch)]);
            args.extend(["-ac".into(), "1".into()]);
        }

        "mix" => {
            let vols = &req.chan_vols;
            let num_ch = probe_channels(app, feed, &input_codec).await;
            let weights: Vec<String> = (0..num_ch as usize).map(|i| {
                let v = vols.get(i).copied().unwrap_or(1.0) / num_ch as f64;
                format!("{:.4}*c{}", v, i)
            }).collect();
            let mix = weights.join("+");
            let pan = format!("pan=stereo|c0={}|c1={},volume={}.0", mix, mix, num_ch);
            args.extend(["-af".into(), pan]);
        }

        "processing" => {
            // Stereo mix + processing chain
            let vols = &req.chan_vols;
            let num_ch = probe_channels(app, feed, &input_codec).await;
            let weights: Vec<String> = (0..num_ch as usize).map(|i| {
                let v = vols.get(i).copied().unwrap_or(1.0) / num_ch as f64;
                format!("{:.4}*c{}", v, i)
            }).collect();
            let mix = weights.join("+");
            let pan = format!("pan=stereo|c0={}|c1={},volume={}.0", mix, mix, num_ch);

            let proc_opts = ProcOpts {
                hpf: req.hpf,
                normalize: req.normalize,
                trim: req.trim,
                fade: req.fade,
                fade_dur: req.fade_dur,
            };
            let proc = build_proc_filters(app, &proc_opts, feed, &input_codec).await;
            let all: Vec<String> = std::iter::once(pan).chain(proc.into_iter()).collect();
            args.extend(["-af".into(), all.join(",")]);
        }

        _ => return Err(format!("Unknown preview type: {}", req.preview_type)),
    }

    // Always output 48kHz PCM WAV for instant playback
    args.extend([
        "-acodec".into(), "pcm_s16le".into(),
        "-ar".into(), "48000".into(),
        "-y".into(),
        out_path.to_string_lossy().to_string(),
    ]);

    run_ffmpeg_silent(app, args).await
}

// ── Cleanup ───────────────────────────────────────────────────────────────────

pub(crate) fn cleanup_previews() -> u32 {
    let tmp = std::env::temp_dir();
    let mut count = 0u32;
    if let Ok(entries) = fs::read_dir(&tmp) {
        for entry in entries.flatten() {
            let name = entry.file_name();
            let name = name.to_string_lossy();
            if name.starts_with("depoaudio_preview_") && name.ends_with(".wav") {
                if fs::remove_file(entry.path()).is_ok() {
                    count += 1;
                }
            }
        }
    }
    count
}
