# DepoAudio

**Desktop court recording audio converter for Windows and macOS.**

DepoAudio converts proprietary court recording formats into standard audio files, with built-in processing, batch support, and a case-organized library.

## Features

- **Format Support** — Stenograph SGMCA, FTR/TRM, Broadcast WAV, DigitalCAT, plus standard formats (WAV, MP3, FLAC, M4A, OGG, Opus, WMA, and more)
- **Three Output Modes** — Mix to Stereo, Keep Original, or Split by Channel
- **Per-Channel Controls** — Label and volume-adjust each channel (Reporter, Witness, Attorney 1 & 2)
- **Track Preview** — Audition individual channels and the final stereo mix before converting
- **Processing Preview** — Hear the effect of filters and normalization before committing
- **Processing Chain** — High-pass filter (80 Hz), loudness normalization (–16 LUFS), silence trimming, fade in/out
- **Output Formats** — WAV (PCM 16-bit), MP3 (192 kbps), FLAC, Opus (64 kbps VBR)
- **Case Library** — Auto-filed by case name with inline playback, search, archive, and re-export
- **Global Audio Player** — Persistent playback bar with queue support across views
- **Batch Processing** — Queue and convert multiple files at once; cancel any time with automatic cleanup
- **Auto-Updates** — In-app update notifications powered by GitHub Releases
- **Dark & Light Themes** — System-aware with manual override

## Supported Formats

| Format | Vendor | Status |
|--------|--------|--------|
| SGMCA | Stenograph / Case CATalyst | Supported |
| FTR / TRM | For The Record | Experimental |
| BWF | CourtSmart / Various | Supported |
| DigitalCAT (.dm) | Stenovations | Experimental |
| WAV, MP3, FLAC, M4A, OGG, Opus, WMA, AIF | Standard | Supported |
| AES (Eclipse AudioSync) | Eclipse CAT | Unsupported (encrypted) |

## Installation

Download the latest preview release for your platform:

- **macOS** — `.dmg` (Apple Silicon and Intel)
- **Windows** — `.msi` installer or `.exe`

> [Latest Release](https://github.com/mayes/depo-audio/releases/latest)

**Note:** Preview builds are not code-signed yet. You'll need to bypass Gatekeeper on macOS or SmartScreen on Windows on first launch. See the [installation guide](https://depoaudio.com/install) for step-by-step instructions.

## Development Setup

### Prerequisites

- [Rust](https://rustup.rs/) (stable toolchain)
- [Node.js](https://nodejs.org/) 22+
- [Tauri CLI](https://v2.tauri.app/start/prerequisites/) (`cargo install tauri-cli`)

### FFmpeg Sidecars

Place FFmpeg and FFprobe binaries in `src-tauri/binaries/` with target-triple naming:

| Platform | Files |
|----------|-------|
| macOS ARM | `ffmpeg-aarch64-apple-darwin`, `ffprobe-aarch64-apple-darwin` |
| macOS Intel | `ffmpeg-x86_64-apple-darwin`, `ffprobe-x86_64-apple-darwin` |
| Windows x64 | `ffmpeg-x86_64-pc-windows-msvc.exe`, `ffprobe-x86_64-pc-windows-msvc.exe` |

Download from [ffmpeg.org](https://ffmpeg.org/download.html) or [evermeet.cx/ffmpeg](https://evermeet.cx/ffmpeg/) (macOS).

### Run

```bash
npm install
npm run tauri dev
```

### Build

```bash
npm run tauri build
```

## Architecture

```
DepoAudio
├── src/                  # React frontend
│   ├── components/       # UI components (Convert, Library, common)
│   ├── hooks/            # Custom hooks (theme, prefs, conversion, updater)
│   ├── constants.js      # Mode/format definitions
│   └── App.jsx           # Main app shell
├── src-tauri/            # Rust backend (Tauri v2)
│   ├── src/
│   │   ├── commands.rs   # Tauri command handlers
│   │   ├── conversion.rs # FFmpeg conversion logic
│   │   ├── ffmpeg.rs     # FFmpeg sidecar runner
│   │   ├── helpers.rs    # Format detection, output helpers
│   │   ├── persistence.rs # Library & prefs storage
│   │   └── types.rs      # Shared type definitions
│   └── binaries/         # FFmpeg/FFprobe sidecars (not committed)
└── .github/workflows/    # CI/CD (release builds)
```

**Stack:** Tauri 2 · Rust · React 19 · Vite 8 · FFmpeg

## Releasing

Push a version tag to trigger automated builds:

```bash
git tag v1.0.0
git push origin v1.0.0
```

GitHub Actions builds installers for macOS (ARM64 + Intel) and Windows (x64), then creates a draft release with all assets.

## License

[MIT](LICENSE)
