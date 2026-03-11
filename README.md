# DepoAudio

Court recording audio converter for Windows and macOS.

Converts SGMCA, FTR (.trm), BWF, and standard audio formats to WAV, MP3, FLAC, or Opus.
Includes an audio library organized by case → session → participant.

**Built on:** Tauri 2 · Rust · React · FFmpeg

## Development setup

```bash
# Prerequisites: Rust (rustup.rs), Node.js 20+, Tauri CLI

npm install
npm run tauri dev
```

### FFmpeg sidecars (required for local dev)

Place FFmpeg binaries in `src-tauri/binaries/` named by target triple:

| Platform | Files |
|---|---|
| macOS Apple Silicon | `ffmpeg-aarch64-apple-darwin` `ffprobe-aarch64-apple-darwin` |
| macOS Intel | `ffmpeg-x86_64-apple-darwin` `ffprobe-x86_64-apple-darwin` |
| Windows x64 | `ffmpeg-x86_64-pc-windows-msvc.exe` `ffprobe-x86_64-pc-windows-msvc.exe` |

Download from: https://ffmpeg.org/download.html or https://evermeet.cx/ffmpeg/ (macOS)

## Releasing

```bash
git tag v1.0.1
git push origin v1.0.1
```

GitHub Actions builds installers for all three platforms and publishes a draft release.

**macOS notarization:** Set `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID` as repository secrets. Builds work without these but won't be notarized (Gatekeeper warning on first launch).

## License

MIT
