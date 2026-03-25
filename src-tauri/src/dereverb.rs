use tauri::AppHandle;

use crate::models;
use crate::types::AudioBuffer;

// ── De-reverberation (DCCRN+) ───────────────────────────────────────────────
//
// Reduces room echo and reverb from speech recordings using the DCCRN+
// (Deep Complex Convolution Recurrent Network) model.
//
// The model operates in the STFT domain on complex spectrograms, handling
// both noise and mild reverberation in a single pass.
//
// Model file: dccrn_plus.onnx (~20MB, must be exported from PyTorch)
// Input: 16kHz mono audio
// Output: Enhanced 16kHz mono audio
//
// See scripts/export_dccrn.py for model export instructions.

/// Apply de-reverberation to an AudioBuffer in-place.
/// The DCCRN+ model expects 16kHz mono input, so this function
/// temporarily downmixes/resamples internally if needed.
pub(crate) fn dereverb_buffer(
    app: &AppHandle,
    buf: &mut AudioBuffer,
) -> Result<(), String> {
    let model_path = models::model_path(app, "dccrn_plus.onnx")?;
    let mut session = models::load_session(&model_path)?;

    // DCCRN+ expects 16kHz mono — work on a mono downmix at the original rate,
    // then apply the model. For simplicity, operate on the first channel or mono mix.
    let original_channels = buf.channels;
    let original_rate = buf.sample_rate;

    // Mix down to mono if multi-channel
    let mono_samples: Vec<f32> = if original_channels == 1 {
        buf.samples.clone()
    } else {
        let ch = original_channels as usize;
        let frames = buf.samples.len() / ch;
        (0..frames)
            .map(|f| {
                let sum: f32 = (0..ch).map(|c| buf.samples[f * ch + c]).sum();
                sum / ch as f32
            })
            .collect()
    };

    // Simple resample to 16kHz if needed (linear interpolation)
    let samples_16k: Vec<f32> = if original_rate == 16000 {
        mono_samples.clone()
    } else {
        let ratio = 16000.0 / original_rate as f64;
        let out_len = (mono_samples.len() as f64 * ratio) as usize;
        (0..out_len)
            .map(|i| {
                let src_pos = i as f64 / ratio;
                let idx = src_pos as usize;
                let frac = src_pos - idx as f64;
                let s0 = mono_samples.get(idx).copied().unwrap_or(0.0);
                let s1 = mono_samples.get(idx + 1).copied().unwrap_or(s0);
                s0 + (s1 - s0) * frac as f32
            })
            .collect()
    };

    if samples_16k.is_empty() {
        return Err("Empty audio for de-reverb".into());
    }

    // DCCRN+ processes in fixed-length frames
    let frame_length = 32000usize; // 2 seconds at 16kHz
    let hop = 16000usize; // 1 second overlap
    let total_samples = samples_16k.len();

    let mut output_samples = vec![0.0f32; total_samples];
    let mut weight_sum = vec![0.0f32; total_samples];

    let mut pos = 0usize;
    while pos < total_samples {
        let end = (pos + frame_length).min(total_samples);
        let mut frame = samples_16k[pos..end].to_vec();

        if frame.len() < frame_length {
            frame.resize(frame_length, 0.0);
        }

        let input_tensor = ndarray::Array2::from_shape_vec((1, frame_length), frame)
            .map_err(|e| format!("Tensor error: {}", e))?;
        let input_val = ort::value::Tensor::from_array(input_tensor)
            .map_err(|e| format!("Tensor error: {}", e))?;

        let result = session.run(ort::inputs!["input" => input_val]);

        match result {
            Ok(outputs) => {
                if let Some(out_val) = outputs.values().next() {
                    if let Ok(out_tensor) = out_val.try_extract_tensor::<f32>() {
                        let out_data = out_tensor.1;
                        let actual_len = (end - pos).min(out_data.len());

                        for j in 0..actual_len {
                            let w = if j < hop {
                                j as f32 / hop as f32
                            } else {
                                1.0 - ((j - hop) as f32 / hop as f32).min(1.0)
                            };
                            output_samples[pos + j] += out_data[j] * w;
                            weight_sum[pos + j] += w;
                        }
                    }
                }
            }
            Err(_) => {
                let actual_len = end - pos;
                for j in 0..actual_len {
                    output_samples[pos + j] += samples_16k[pos + j];
                    weight_sum[pos + j] += 1.0;
                }
            }
        }

        pos += hop;
    }

    // Normalize by weight sum
    for i in 0..total_samples {
        if weight_sum[i] > 0.0 {
            output_samples[i] /= weight_sum[i];
        }
    }

    // Resample back to original rate if needed
    let resampled: Vec<f32> = if original_rate == 16000 {
        output_samples
    } else {
        let ratio = original_rate as f64 / 16000.0;
        let out_len = (output_samples.len() as f64 * ratio) as usize;
        (0..out_len)
            .map(|i| {
                let src_pos = i as f64 / ratio;
                let idx = src_pos as usize;
                let frac = src_pos - idx as f64;
                let s0 = output_samples.get(idx).copied().unwrap_or(0.0);
                let s1 = output_samples.get(idx + 1).copied().unwrap_or(s0);
                s0 + (s1 - s0) * frac as f32
            })
            .collect()
    };

    // Write back — mono result replicated to all channels
    if original_channels == 1 {
        buf.samples = resampled;
    } else {
        let ch = original_channels as usize;
        let frames = resampled.len();
        let mut interleaved = Vec::with_capacity(frames * ch);
        for f in 0..frames {
            for _ in 0..ch {
                interleaved.push(resampled[f]);
            }
        }
        buf.samples = interleaved;
    }
    buf.channels = original_channels;
    buf.sample_rate = original_rate;

    Ok(())
}
