use crate::models;
use crate::types::AudioBuffer;

// ── Bandwidth extension (audio super-resolution) ────────────────────────────
//
// Upscales narrow-band audio (8–16 kHz phone recordings, old equipment)
// to 48 kHz. Uses FlashSR ONNX model when available, falls back to
// FFmpeg SoX high-quality resampler.

/// Bandwidth extension on an AudioBuffer using FlashSR.
/// FlashSR expects 16kHz mono input and produces 48kHz output.
/// If the model is not available, this is a no-op (returns Ok).
pub(crate) fn enhance_buffer(
    app: &tauri::AppHandle,
    buf: &mut AudioBuffer,
) -> Result<(), String> {
    let model_path = match models::model_path(app, "flashsr.onnx") {
        Ok(p) => p,
        Err(_) => return Ok(()), // No model available — no-op
    };
    let mut session = models::load_session(&model_path)?;

    let original_channels = buf.channels;
    let original_rate = buf.sample_rate;

    // FlashSR expects 16kHz mono — mix down and resample
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

    // Resample to 16kHz if needed
    let samples_16k: Vec<f32> = if original_rate == 16000 {
        mono_samples
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
        return Err("Empty audio for FlashSR".into());
    }

    let input_len = samples_16k.len();
    let input_tensor = ndarray::Array2::from_shape_vec((1, input_len), samples_16k)
        .map_err(|e| format!("Tensor error: {}", e))?;
    let input_val = ort::value::Tensor::from_array(input_tensor)
        .map_err(|e| format!("Tensor error: {}", e))?;

    let outputs = session
        .run(ort::inputs!["input" => input_val])
        .map_err(|e| format!("FlashSR inference failed: {}", e))?;

    let first_output = outputs
        .values()
        .next()
        .ok_or("No FlashSR output")?;
    let output_tensor = first_output
        .try_extract_tensor::<f32>()
        .map_err(|e| format!("Failed to extract FlashSR output: {}", e))?;

    let output_48k: Vec<f32> = output_tensor.1.to_vec();

    // FlashSR outputs 48kHz mono — replicate to all original channels
    if original_channels == 1 {
        buf.samples = output_48k;
    } else {
        let ch = original_channels as usize;
        let frames = output_48k.len();
        let mut interleaved = Vec::with_capacity(frames * ch);
        for f in 0..frames {
            for _ in 0..ch {
                interleaved.push(output_48k[f]);
            }
        }
        buf.samples = interleaved;
    }
    buf.channels = original_channels;
    buf.sample_rate = 48000;

    Ok(())
}

