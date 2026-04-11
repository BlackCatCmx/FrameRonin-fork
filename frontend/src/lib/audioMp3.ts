import { loadLameJs } from './lamejs'

const MP3_SAMPLE_RATES = [8000, 11025, 12000, 16000, 22050, 24000, 32000, 44100, 48000]
const MP3_FRAME_SAMPLES = 1152

const AudioContextCtor =
  typeof window !== 'undefined'
    ? (window.AudioContext ||
        (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
    : undefined

function pickNearestSampleRate(sampleRate: number): number {
  return MP3_SAMPLE_RATES.reduce((best, current) => {
    return Math.abs(current - sampleRate) < Math.abs(best - sampleRate) ? current : best
  }, MP3_SAMPLE_RATES[0]!)
}

function clampFloatToInt16(value: number): number {
  const clamped = Math.max(-1, Math.min(1, value))
  return clamped < 0 ? Math.round(clamped * 0x8000) : Math.round(clamped * 0x7fff)
}

function floatChunkToInt16(source: Float32Array, start: number, end: number): Int16Array {
  const out = new Int16Array(end - start)
  for (let i = start; i < end; i++) {
    out[i - start] = clampFloatToInt16(source[i] ?? 0)
  }
  return out
}

function mixStereoChunk(
  leftSource: Float32Array,
  rightSource: Float32Array,
  start: number,
  end: number
): { left: Int16Array; right: Int16Array } {
  const left = new Int16Array(end - start)
  const right = new Int16Array(end - start)
  for (let i = start; i < end; i++) {
    left[i - start] = clampFloatToInt16(leftSource[i] ?? 0)
    right[i - start] = clampFloatToInt16(rightSource[i] ?? 0)
  }
  return { left, right }
}

async function decodeAudio(file: Blob): Promise<AudioBuffer> {
  if (!AudioContextCtor) throw new Error('ERR_AUDIO_CONTEXT_UNSUPPORTED')
  const context = new AudioContextCtor()
  try {
    const buf = await file.arrayBuffer()
    return await context.decodeAudioData(buf.slice(0))
  } finally {
    await context.close().catch(() => {})
  }
}

async function resampleAudioBuffer(source: AudioBuffer, targetSampleRate: number): Promise<AudioBuffer> {
  if (source.sampleRate === targetSampleRate) return source
  const frameCount = Math.max(1, Math.ceil(source.duration * targetSampleRate))
  const offline = new OfflineAudioContext(Math.min(source.numberOfChannels, 2), frameCount, targetSampleRate)
  const audioSource = offline.createBufferSource()
  audioSource.buffer = source
  audioSource.connect(offline.destination)
  audioSource.start(0)
  return offline.startRendering()
}

function nextAnimationFrame(): Promise<void> {
  return new Promise((resolve) => window.requestAnimationFrame(() => resolve()))
}

export interface CompressWavToMp3Result {
  blob: Blob
  durationSec: number
  sampleRate: number
  channels: number
}

export async function compressWavToMp3(
  file: File,
  bitrateKbps: number,
  onProgress?: (percent: number) => void
): Promise<CompressWavToMp3Result> {
  const decoded = await decodeAudio(file)
  const sampleRate = pickNearestSampleRate(decoded.sampleRate)
  const prepared = await resampleAudioBuffer(decoded, sampleRate)
  const channels = Math.min(2, prepared.numberOfChannels)
  const lamejs = await loadLameJs()
  const encoder = new lamejs.Mp3Encoder(channels, sampleRate, bitrateKbps)
  const leftSource = prepared.getChannelData(0)
  const rightSource = channels > 1 ? prepared.getChannelData(1) : null
  const chunks: ArrayBuffer[] = []
  const totalFrames = Math.max(1, Math.ceil(prepared.length / MP3_FRAME_SAMPLES))

  onProgress?.(5)

  for (let start = 0, frame = 0; start < prepared.length; start += MP3_FRAME_SAMPLES, frame++) {
    const end = Math.min(start + MP3_FRAME_SAMPLES, prepared.length)
    const encoded =
      channels > 1 && rightSource
        ? (() => {
            const stereo = mixStereoChunk(leftSource, rightSource, start, end)
            return encoder.encodeBuffer(stereo.left, stereo.right)
          })()
        : encoder.encodeBuffer(floatChunkToInt16(leftSource, start, end))

    if (encoded.length > 0) {
      const copy = new Uint8Array(encoded.length)
      copy.set(encoded)
      chunks.push(copy.buffer)
    }

    const percent = Math.min(98, 5 + Math.round(((frame + 1) / totalFrames) * 90))
    onProgress?.(percent)
    if (frame % 18 === 0) await nextAnimationFrame()
  }

  const tail = encoder.flush()
  if (tail.length > 0) {
    const copy = new Uint8Array(tail.length)
    copy.set(tail)
    chunks.push(copy.buffer)
  }
  onProgress?.(100)

  return {
    blob: new Blob(chunks, { type: 'audio/mpeg' }),
    durationSec: prepared.duration,
    sampleRate,
    channels,
  }
}
