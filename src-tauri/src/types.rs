use std::path::PathBuf;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};

// ── Conversion types ─────────────────────────────────────────────────────────

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
#[serde(rename_all = "camelCase")]
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
