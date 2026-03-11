use std::fs;
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use chrono::Utc;
use regex::Regex;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;
use uuid::Uuid;

// ── Structs ───────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FormatInfo {
    pub key: String,
    pub name: String,
    pub vendor: String,
    pub status: String,
    pub handler: String,
    pub channels: Option<String>,
    pub note: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ConvertJob {
    pub id: String,
    pub src_path: String,
    pub out_dir: String,
    pub mode: String,
    pub format: String,
    pub rate: String,
    pub labels: Vec<String>,
    pub chan_vols: Vec<f64>,
    pub normalize: bool,
    pub trim: bool,
    pub fade: bool,
    pub fade_dur: f64,
    pub hpf: bool,
    pub case_name: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OutputFile {
    pub name: String,
    pub path: String,
    pub size: u64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ConvertResult {
    pub files: Vec<OutputFile>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProgressEvent {
    pub id: String,
    pub seconds: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DoneEvent {
    pub id: String,
    pub files: Vec<OutputFile>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ErrorEvent {
    pub id: String,
    pub message: String,
}

// ── Library types ─────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LibFile {
    pub path: String,
    pub format: String,
    pub size: u64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Participant {
    pub label: String,
    pub files: Vec<LibFile>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    pub id: String,
    pub date: String,
    pub source_file: String,
    pub source_name: String,
    pub participants: Vec<Participant>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Case {
    pub id: String,
    pub name: String,
    pub created_at: String,
    pub archived: bool,
    pub sessions: Vec<Session>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct Library {
    pub version: u32,
    pub cases: Vec<Case>,
}

// ── Prefs ─────────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Prefs {
    pub theme: String,
    pub mode: String,
    pub format: String,
    pub rate: String,
    pub out_dir: String,
    pub labels: Vec<String>,
    pub chan_vols: Vec<f64>,
    pub normalize: bool,
    pub trim: bool,
    pub fade: bool,
    pub fade_dur: f64,
    pub hpf: bool,
}

impl Default for Prefs {
    fn default() -> Self {
        Self {
            theme: "system".into(),
            mode: "stereo".into(),
            format: "wav".into(),
            rate: "48000".into(),
            out_dir: "".into(),
            labels: vec!["Reporter".into(), "Witness".into(), "Attorney 1".into(), "Attorney 2".into()],
            chan_vols: vec![1.0, 1.0, 1.0, 1.0],
            normalize: false,
            trim: false,
            fade: false,
            fade_dur: 0.5,
            hpf: false,
        }
    }
}

// ── App state ─────────────────────────────────────────────────────────────────

pub struct AppState {
    pub library: Mutex<Library>,
    pub prefs: Mutex<Prefs>,
    pub lib_path: Mutex<Option<PathBuf>>,
    pub prefs_path: Mutex<Option<PathBuf>>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            library: Mutex::new(Library::default()),
            prefs: Mutex::new(Prefs::default()),
            lib_path: Mutex::new(None),
            prefs_path: Mutex::new(None),
        }
    }
}

// ── Format registry ───────────────────────────────────────────────────────────

fn get_formats() -> Vec<FormatInfo> {
    vec![
        FormatInfo { key: "sgmca".into(), name: "Stenograph SGMCA".into(), vendor: "Case CATalyst".into(),
            status: "supported".into(), handler: "sgmca".into(), channels: Some("4".into()), note: None },
        FormatInfo { key: "ftr".into(), name: "FTR Recording".into(), vendor: "For The Record".into(),
            status: "experimental".into(), handler: "ftr".into(), channels: Some("4–16".into()),
            note: Some("FTR uses proprietary AAC codec tag 0x4180. Drop all .trm files for a session together.".into()) },
        FormatInfo { key: "aes".into(), name: "Eclipse AudioSync".into(), vendor: "Eclipse CAT".into(),
            status: "unsupported".into(), handler: "rejected".into(), channels: None,
            note: Some("AES-128 encrypted. Open in Eclipse → File → Export Audio → WAV first.".into()) },
        FormatInfo { key: "digitalcat".into(), name: "DigitalCAT Audio".into(), vendor: "Stenovations".into(),
            status: "experimental".into(), handler: "passthrough".into(), channels: None,
            note: Some("No public spec — conversion may fail. Please report results on GitHub.".into()) },
        FormatInfo { key: "bwf".into(), name: "Broadcast WAV".into(), vendor: "CourtSmart / Various".into(),
            status: "supported".into(), handler: "passthrough".into(), channels: None, note: None },
        FormatInfo { key: "generic".into(), name: "WAV · MP3 · FLAC · WMA · M4A · OGG · Opus + more".into(),
            vendor: "Eclipse · ProCAT · StenoCAT · Standard".into(),
            status: "supported".into(), handler: "passthrough".into(), channels: None, note: None },
    ]
}

fn detect_format_for_path(path: &str) -> Option<FormatInfo> {
    let ext = Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        .unwrap_or_default();

    let fmts = get_formats();
    match ext.as_str() {
        "sgmca"                                            => fmts.into_iter().find(|f| f.key == "sgmca"),
        "trm" | "ftr"                                      => fmts.into_iter().find(|f| f.key == "ftr"),
        "aes"                                              => fmts.into_iter().find(|f| f.key == "aes"),
        "dm"                                               => fmts.into_iter().find(|f| f.key == "digitalcat"),
        "bwf"                                              => fmts.into_iter().find(|f| f.key == "bwf"),
        "wav"|"mp3"|"flac"|"wma"|"m4a"|"aac"|"ogg"|"opus"|"aif"|"aiff" => fmts.into_iter().find(|f| f.key == "generic"),
        _                                                  => None,
    }
}

// ── Case name detection ───────────────────────────────────────────────────────

fn infer_case_name(filename: &str) -> String {
    let stem = Path::new(filename)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or(filename);

    // Remove date patterns: 2025-11-14, 20251114, 11-14-2025
    let date_re = Regex::new(r"[_\-]?\d{4}[_\-]\d{2}[_\-]\d{2}|[_\-]?\d{8}|[_\-]?\d{2}[_\-]\d{2}[_\-]\d{4}").unwrap();
    let cleaned = date_re.replace_all(stem, "");

    // Replace underscores with spaces, collapse runs
    let spaced = cleaned.replace('_', " ");
    let words: Vec<&str> = spaced.split_whitespace().collect();
    if words.is_empty() {
        return stem.to_string();
    }
    words.join(" ")
}

// ── FFmpeg path helpers ───────────────────────────────────────────────────────

fn ffmpeg_bin_name() -> &'static str {
    if cfg!(target_os = "windows") { "ffmpeg.exe" } else { "ffmpeg" }
}
fn ffprobe_bin_name() -> &'static str {
    if cfg!(target_os = "windows") { "ffprobe.exe" } else { "ffprobe" }
}

// ── SGMCA header stripping ────────────────────────────────────────────────────

fn strip_sgmca_header(src: &Path) -> Result<(PathBuf, bool), String> {
    const MAGIC: &[u8] = b"OggS";
    const SCAN: usize = 8192;

    let mut file = fs::File::open(src).map_err(|e| e.to_string())?;
    let mut buf = vec![0u8; SCAN.min(fs::metadata(src).map(|m| m.len() as usize).unwrap_or(SCAN))];
    file.read_exact(&mut buf).ok();

    let offset = buf.windows(4).position(|w| w == MAGIC).unwrap_or(0);
    if offset == 0 {
        return Ok((src.to_path_buf(), false));
    }

    let tmp = std::env::temp_dir().join(format!("depoaudio_{}.ogg", Uuid::new_v4().to_string().replace('-', "")));
    file.seek(SeekFrom::Start(offset as u64)).map_err(|e| e.to_string())?;
    let mut out = fs::File::create(&tmp).map_err(|e| e.to_string())?;
    let mut chunk = vec![0u8; 65536];
    loop {
        let n = file.read(&mut chunk).map_err(|e| e.to_string())?;
        if n == 0 { break; }
        out.write_all(&chunk[..n]).map_err(|e| e.to_string())?;
    }
    Ok((tmp, true))
}

// ── Filter chain ──────────────────────────────────────────────────────────────

async fn probe_duration(app: &AppHandle, feed: &Path, input_codec: &[String]) -> Option<f64> {
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

async fn probe_channels(app: &AppHandle, feed: &Path, input_codec: &[String]) -> u32 {
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

async fn build_proc_filters(app: &AppHandle, opts: &ConvertJob, feed: &Path, input_codec: &[String]) -> Vec<String> {
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

fn output_args(format: &str, rate: &str) -> Vec<String> {
    match format {
        "mp3"  => vec!["-acodec".into(), "libmp3lame".into(), "-b:a".into(), "192k".into(),  "-ar".into(), rate.into()],
        "flac" => vec!["-c:a".into(), "flac".into(), "-ar".into(), rate.into()],
        "opus" => vec!["-c:a".into(), "libopus".into(), "-b:a".into(), "64k".into(), "-vbr".into(), "on".into(), "-ar".into(), "48000".into()],
        _      => vec!["-acodec".into(), "pcm_s16le".into(), "-ar".into(), rate.into()],
    }
}

fn output_ext(format: &str) -> &'static str {
    match format {
        "mp3"  => ".mp3",
        "flac" => ".flac",
        "opus" => ".opus",
        _      => ".wav",
    }
}

fn unique_path(path: &Path) -> PathBuf {
    if !path.exists() { return path.to_path_buf(); }
    let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("out");
    let ext = path.extension().and_then(|e| e.to_str()).map(|e| format!(".{}", e)).unwrap_or_default();
    let parent = path.parent().unwrap_or(Path::new("."));
    let mut n = 1;
    loop {
        let candidate = parent.join(format!("{}_{}{}", stem, n, ext));
        if !candidate.exists() { return candidate; }
        n += 1;
    }
}

fn safe_label(s: &str) -> String {
    s.chars().map(|c| if "<>:\"/\\|?* ".contains(c) { '_' } else { c }).collect::<String>().trim().to_string()
}

fn basename(path: &str) -> String {
    Path::new(path).file_name().and_then(|n| n.to_str()).unwrap_or(path).to_string()
}

// ── Run FFmpeg sidecar, emit progress, return on exit ────────────────────────

async fn run_ffmpeg(app: &AppHandle, args: Vec<String>, job_id: &str) -> Result<(), String> {
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

// ── Commands ──────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_formats_list() -> Vec<FormatInfo> { get_formats() }

#[tauri::command]
pub fn detect_format(path: String) -> Option<FormatInfo> { detect_format_for_path(&path) }

#[tauri::command]
pub fn infer_case_name_cmd(filename: String) -> String { infer_case_name(&filename) }

#[tauri::command]
pub async fn convert(
    app: AppHandle,
    state: State<'_, AppState>,
    job: ConvertJob,
) -> Result<(), String> {
    let id = job.id.clone();

    let result = do_convert(&app, &job).await;
    match result {
        Ok(files) => {
            // Save to library
            save_to_library(&app, &state, &job, &files);
            let _ = app.emit("convert:done", DoneEvent { id, files });
        }
        Err(msg) => {
            let _ = app.emit("convert:error", ErrorEvent { id, message: msg });
        }
    }
    Ok(())
}

async fn do_convert(app: &AppHandle, job: &ConvertJob) -> Result<Vec<OutputFile>, String> {
    let fmt = detect_format_for_path(&job.src_path)
        .ok_or("Unrecognised file format")?;

    if fmt.handler == "rejected" {
        return Err(fmt.note.unwrap_or_else(|| "This format cannot be converted.".into()));
    }

    let src = Path::new(&job.src_path);
    let (feed_path, is_temp) = if fmt.handler == "sgmca" {
        strip_sgmca_header(src)?
    } else {
        (src.to_path_buf(), false)
    };

    let result = do_convert_inner(app, job, &feed_path, &fmt).await;

    if is_temp { let _ = fs::remove_file(&feed_path); }
    result
}

async fn do_convert_inner(app: &AppHandle, job: &ConvertJob, feed: &Path, fmt: &FormatInfo) -> Result<Vec<OutputFile>, String> {
    let input_codec: Vec<String> = if fmt.handler == "ftr" {
        vec!["-acodec".into(), "aac".into()]
    } else {
        vec![]
    };

    let base = Path::new(&job.src_path)
        .file_stem().and_then(|s| s.to_str()).unwrap_or("output");

    let out_dir = if job.out_dir.is_empty() {
        Path::new(&job.src_path).parent().unwrap_or(Path::new(".")).to_path_buf()
    } else {
        PathBuf::from(&job.out_dir)
    };

    let ext = output_ext(&job.format);
    let out_codec = output_args(&job.format, &job.rate);
    let proc = build_proc_filters(app, job, feed, &input_codec).await;

    let mut ffmpeg_args: Vec<String> = input_codec.clone();
    ffmpeg_args.extend(["-i".into(), feed.to_string_lossy().to_string()]);

    let mut output_paths: Vec<PathBuf> = Vec::new();

    match job.mode.as_str() {
        "stereo" => {
            let dst = unique_path(&out_dir.join(format!("{}{}", base, ext)));
            let vols = &job.chan_vols;
            let weights: Vec<String> = (0..4).map(|i| {
                let v = vols.get(i).copied().unwrap_or(1.0) * 0.25;
                format!("{:.4}*c{}", v, i)
            }).collect();
            let mix = weights.join("+");
            let pan = format!("pan=stereo|c0={}|c1={},volume=4.0", mix, mix);
            let all: Vec<String> = std::iter::once(pan).chain(proc.into_iter()).collect();
            let mut args = ffmpeg_args.clone();
            args.extend(["-af".into(), all.join(",")]);
            args.extend(out_codec.clone());
            args.extend(["-y".into(), dst.to_string_lossy().to_string()]);
            run_ffmpeg(app, args, &job.id).await?;
            output_paths.push(dst);
        }

        "keep" => {
            let dst = unique_path(&out_dir.join(format!("{}_orig{}", base, ext)));
            let mut args = ffmpeg_args.clone();
            if !proc.is_empty() {
                args.extend(["-af".into(), proc.join(",")]);
            }
            args.extend(out_codec.clone());
            args.extend(["-y".into(), dst.to_string_lossy().to_string()]);
            run_ffmpeg(app, args, &job.id).await?;
            output_paths.push(dst);
        }

        "split" => {
            let num_ch = probe_channels(app, feed, &input_codec).await;
            let labels: Vec<String> = (0..num_ch as usize).map(|i| {
                let raw = job.labels.get(i).map(|s| s.as_str()).unwrap_or("");
                let sl = safe_label(raw);
                if sl.is_empty() { format!("ch{}", i + 1) } else { sl }
            }).collect();
            let dsts: Vec<PathBuf> = labels.iter()
                .map(|l| unique_path(&out_dir.join(format!("{}_{}{}", base, l, ext))))
                .collect();

            let mut args = ffmpeg_args.clone();
            if !proc.is_empty() {
                let sp_tags: Vec<String> = (0..num_ch as usize).map(|i| format!("sp{}", i)).collect();
                let op_tags: Vec<String> = (0..num_ch as usize).map(|i| format!("op{}", i)).collect();
                let split_str = format!("[0:a]channelsplit[{}]", sp_tags.join("]["));
                let chain: Vec<String> = (0..num_ch as usize)
                    .map(|i| format!("[sp{}]{}[op{}]", i, proc.join(","), i))
                    .collect();
                let fc = std::iter::once(split_str).chain(chain).collect::<Vec<_>>().join(";");
                args.extend(["-filter_complex".into(), fc]);
                for (i, dst) in dsts.iter().enumerate() {
                    args.extend(["-map".into(), format!("[op{}]", i)]);
                    args.extend(out_codec.clone());
                    args.push(dst.to_string_lossy().to_string());
                }
            } else {
                let tags: Vec<String> = (0..num_ch as usize).map(|i| format!("ch{}", i)).collect();
                let fc = format!("[0:a]channelsplit[{}]", tags.join("]["));
                args.extend(["-filter_complex".into(), fc]);
                for (i, dst) in dsts.iter().enumerate() {
                    args.extend(["-map".into(), format!("[ch{}]", i)]);
                    args.extend(out_codec.clone());
                    args.push(dst.to_string_lossy().to_string());
                }
            }
            args.push("-y".into());
            run_ffmpeg(app, args, &job.id).await?;
            output_paths.extend(dsts);
        }

        _ => return Err(format!("Unknown mode: {}", job.mode)),
    }

    let files: Vec<OutputFile> = output_paths.into_iter().map(|p| {
        let size = fs::metadata(&p).map(|m| m.len()).unwrap_or(0);
        OutputFile { name: basename(&p.to_string_lossy()), path: p.to_string_lossy().to_string(), size }
    }).collect();

    if let Some(empty) = files.iter().find(|f| f.size == 0) {
        return Err(format!("Output file is empty: {}", empty.name));
    }

    Ok(files)
}

// ── Library persistence ───────────────────────────────────────────────────────

fn lib_path(app: &AppHandle) -> PathBuf {
    app.path().app_data_dir().unwrap_or_else(|_| PathBuf::from(".")).join("library.json")
}
fn prefs_path(app: &AppHandle) -> PathBuf {
    app.path().app_data_dir().unwrap_or_else(|_| PathBuf::from(".")).join("prefs.json")
}

fn load_library(app: &AppHandle) -> Library {
    let path = lib_path(app);
    fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn save_library(app: &AppHandle, lib: &Library) {
    let path = lib_path(app);
    if let Some(parent) = path.parent() { let _ = fs::create_dir_all(parent); }
    if let Ok(json) = serde_json::to_string_pretty(lib) {
        let _ = fs::write(path, json);
    }
}

fn save_to_library(app: &AppHandle, state: &State<'_, AppState>, job: &ConvertJob, files: &[OutputFile]) {
    let mut lib = state.library.lock().unwrap();

    let source_name = basename(&job.src_path);
    let case_name = job.case_name.clone()
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| infer_case_name(&source_name));

    let participants = if job.mode == "split" {
        files.iter().enumerate().map(|(i, f)| Participant {
            label: job.labels.get(i).cloned().unwrap_or_else(|| format!("Channel {}", i + 1)),
            files: vec![LibFile { path: f.path.clone(), format: job.format.clone(), size: f.size }],
        }).collect()
    } else {
        let label = if job.mode == "keep" { "Original".to_string() } else { "Stereo Mix".to_string() };
        files.iter().map(|f| Participant {
            label: label.clone(),
            files: vec![LibFile { path: f.path.clone(), format: job.format.clone(), size: f.size }],
        }).collect()
    };

    let session = Session {
        id: Uuid::new_v4().to_string(),
        date: Utc::now().format("%Y-%m-%d").to_string(),
        source_file: job.src_path.clone(),
        source_name,
        participants,
    };

    // Find existing case by name (case-insensitive) or create new
    let case_name_lower = case_name.to_lowercase();
    let case_idx = lib.cases.iter().position(|c| c.name.to_lowercase() == case_name_lower);
    if let Some(idx) = case_idx {
        lib.cases[idx].sessions.push(session);
    } else {
        lib.cases.push(Case {
            id: Uuid::new_v4().to_string(),
            name: case_name,
            created_at: Utc::now().to_rfc3339(),
            archived: false,
            sessions: vec![session],
        });
    }

    save_library(app, &lib);
}

// ── Library commands ──────────────────────────────────────────────────────────

#[tauri::command]
pub fn library_get(app: AppHandle, state: State<'_, AppState>) -> Vec<Case> {
    let lib = load_library(&app);
    *state.library.lock().unwrap() = lib.clone();
    lib.cases
}

#[tauri::command]
pub fn library_rename_case(app: AppHandle, state: State<'_, AppState>, case_id: String, name: String) -> bool {
    let mut lib = state.library.lock().unwrap();
    if let Some(c) = lib.cases.iter_mut().find(|c| c.id == case_id) { c.name = name; }
    save_library(&app, &lib);
    true
}

#[tauri::command]
pub fn library_archive_case(app: AppHandle, state: State<'_, AppState>, case_id: String, archived: bool) -> bool {
    let mut lib = state.library.lock().unwrap();
    if let Some(c) = lib.cases.iter_mut().find(|c| c.id == case_id) { c.archived = archived; }
    save_library(&app, &lib);
    true
}

#[tauri::command]
pub fn library_delete_case(app: AppHandle, state: State<'_, AppState>, case_id: String) -> bool {
    let mut lib = state.library.lock().unwrap();
    lib.cases.retain(|c| c.id != case_id);
    save_library(&app, &lib);
    true
}

#[tauri::command]
pub fn library_delete_session(app: AppHandle, state: State<'_, AppState>, case_id: String, session_id: String) -> bool {
    let mut lib = state.library.lock().unwrap();
    if let Some(c) = lib.cases.iter_mut().find(|c| c.id == case_id) {
        c.sessions.retain(|s| s.id != session_id);
    }
    save_library(&app, &lib);
    true
}

// ── Prefs commands ────────────────────────────────────────────────────────────

#[tauri::command]
pub fn prefs_get(app: AppHandle, state: State<'_, AppState>) -> Prefs {
    let path = prefs_path(&app);
    let loaded: Prefs = fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default();
    *state.prefs.lock().unwrap() = loaded.clone();
    loaded
}

#[tauri::command]
pub fn prefs_set(app: AppHandle, state: State<'_, AppState>, patch: serde_json::Value) -> bool {
    let mut prefs = state.prefs.lock().unwrap();
    // Merge patch into current prefs via JSON round-trip
    if let Ok(mut current) = serde_json::to_value(prefs.clone()) {
        if let serde_json::Value::Object(ref mut map) = current {
            if let serde_json::Value::Object(patch_map) = patch {
                for (k, v) in patch_map { map.insert(k, v); }
            }
        }
        if let Ok(updated) = serde_json::from_value::<Prefs>(current) {
            *prefs = updated;
        }
    }
    let path = prefs_path(&app);
    if let Some(parent) = path.parent() { let _ = fs::create_dir_all(parent); }
    if let Ok(json) = serde_json::to_string_pretty(&*prefs) {
        let _ = fs::write(path, json);
    }
    true
}

// ── Library import (add existing audio to library without conversion) ───────

#[tauri::command]
pub fn library_import_file(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
    case_name: String,
    label: String,
) -> Result<(), String> {
    let mut lib = state.library.lock().map_err(|e| e.to_string())?;
    let lib_path = lib_path(&app);
    let trimmed = case_name.trim().to_string();
    if trimmed.is_empty() { return Err("Case name cannot be empty".into()); }
    let size = fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
    let ext = Path::new(&path).extension().and_then(|e| e.to_str()).unwrap_or("wav").to_lowercase();
    let source_name = Path::new(&path).file_name().and_then(|n| n.to_str()).unwrap_or("imported").to_string();
    let idx = lib.cases.iter().position(|c| !c.archived && c.name.to_lowercase() == trimmed.to_lowercase());
    let case = if let Some(i) = idx {
        &mut lib.cases[i]
    } else {
        lib.cases.push(Case { id: Uuid::new_v4().to_string(), name: trimmed.clone(), created_at: Utc::now().to_rfc3339(), archived: false, sessions: vec![] });
        lib.cases.last_mut().unwrap()
    };
    case.sessions.push(Session {
        id: Uuid::new_v4().to_string(),
        date: Utc::now().format("%Y-%m-%d").to_string(),
        source_file: path.clone(),
        source_name,
        participants: vec![Participant { label: label.trim().to_string(), files: vec![LibFile { path, format: ext, size }] }],
    });
    if let Some(parent) = lib_path.parent() { let _ = fs::create_dir_all(parent); }
    if let Ok(json) = serde_json::to_string_pretty(&*lib) { fs::write(&lib_path, json).map_err(|e| e.to_string())?; }
    Ok(())
}

// ── Shell / opener commands ───────────────────────────────────────────────────

#[tauri::command]
pub fn show_in_folder(app: AppHandle, path: String) -> Result<(), String> {
    app.opener()
        .reveal_item_in_dir(&path)
        .map_err(|e| e.to_string())
}

// ── run() ─────────────────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_drag_drop::init())
        .plugin(tauri_plugin_opener::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            get_formats_list,
            detect_format,
            infer_case_name_cmd,
            convert,
            show_in_folder,
            library_get,
            library_rename_case,
            library_archive_case,
            library_delete_case,
            library_delete_session,
            library_import_file,
            prefs_get,
            prefs_set,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
