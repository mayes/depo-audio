# Changelog

## [0.3.0] - 2026-03-12

### Added
- In-app auto-updater powered by GitHub Releases — update notifications with change notes and skip option
- Shared audio player hook (`useAudioPlayer`) reducing code duplication
- ARIA labels and semantic roles throughout the UI for accessibility
- Update banner component with download progress and release notes viewer

### Fixed
- **Critical:** `ConvertJob` serde deserialization — added `camelCase` rename so frontend `srcPath`/`outDir`/`chanVols`/`fadeDur` fields map correctly to Rust struct
- macOS Intel CI builds — replaced deprecated `macos-13` runner with cross-compilation on `macos-latest`
- Toggle component accessibility — changed from `<div>` to `<button role="switch">` with keyboard support

### Changed
- ConvertTab now accepts grouped prop objects (`prefs`, `fileDrop`, `conversion`) instead of 30+ individual props
- Consolidated duplicate `.proc-chain` CSS definitions
- Updated README with full feature docs, architecture overview, and format support table
- Replaced placeholder SECURITY.md with actual project information

## [0.2.0] - 2026-03-11

### Changed
- Refactored Rust backend from single 806-line `lib.rs` into 7 focused modules:
  - `types.rs` — all struct/enum definitions
  - `helpers.rs` — format registry, path helpers, SGMCA stripping
  - `ffmpeg.rs` — FFmpeg probe, filter chain, sidecar runner
  - `conversion.rs` — core conversion logic (stereo/keep/split)
  - `persistence.rs` — library and preferences storage
  - `commands.rs` — Tauri command handlers
  - `lib.rs` — module declarations and app builder
- Added `protocol-asset` feature to Tauri dependency
- Skipped macOS code signing for unsigned builds

## [0.1.0] - Initial Release

### Added
- SGMCA, BWF, FTR/TRM, DigitalCAT .dm, and standard audio format support
- Three output modes: Mix to Stereo, Keep Original, Split Channels
- Per-channel volume controls (Reporter, Witness, Attorney 1 & 2)
- Processing chain: High-pass filter, loudness normalization, silence trim, fade in/out
- Output formats: WAV, MP3 (192 kbps), FLAC, Opus (64 kbps VBR)
- Case/witness auto-filing library with inline playback and re-export
- Batch processing support
- Windows (x64) and macOS (Apple Silicon + Intel) builds
