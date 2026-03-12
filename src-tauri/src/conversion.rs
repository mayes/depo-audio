use std::fs;
use std::path::{Path, PathBuf};

use tauri::AppHandle;

use crate::ffmpeg::{build_proc_filters, probe_channels, run_ffmpeg};
use crate::helpers::{basename, detect_format_for_path, output_args, output_ext, safe_label, strip_sgmca_header, unique_path};
use crate::types::{ConvertJob, FormatInfo, OutputFile};

// ── Conversion orchestration ─────────────────────────────────────────────────

pub(crate) async fn do_convert(app: &AppHandle, job: &ConvertJob) -> Result<Vec<OutputFile>, String> {
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
    let proc_opts = crate::ffmpeg::ProcOpts::from(job);
    let proc = build_proc_filters(app, &proc_opts, feed, &input_codec).await;

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
                let _op_tags: Vec<String> = (0..num_ch as usize).map(|i| format!("op{}", i)).collect();
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
