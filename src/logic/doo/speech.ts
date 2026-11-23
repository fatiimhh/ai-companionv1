import { invoke } from "@tauri-apps/api/core";
import { mouth } from "./mouthLevel";
import { TTS, MAX_CHUNK_CHARS } from "./voice";

type Callbacks = { onStart?: () => void; onEnd?: () => void };
type Result = { ok: boolean; error?: string };

let audioCtx: AudioContext | null = null;
let currentSource: AudioBufferSourceNode | null = null;
let runId = 0;
let rafId = 0;

function getContext(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext();
  return audioCtx;
}

const ARABIC = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/g;
const LATIN = /[A-Za-z]/g;

function isMostlyArabic(text: string): boolean {
  const arabic = (text.match(ARABIC) ?? []).length;
  const latin = (text.match(LATIN) ?? []).length;
  return arabic > latin;
}

// long replies are split at sentence boundaries to fit the per-request limit
function splitIntoChunks(text: string): string[] {
  const sentences = text.match(/[^.!?؟۔…\n]+[.!?؟۔…]*\s*/g) ?? [text];
  const chunks: string[] = [];
  let current = "";

  const pushLongSentence = (sentence: string) => {
    let part = "";
    for (const word of sentence.split(/\s+/)) {
      if ((part + " " + word).trim().length > MAX_CHUNK_CHARS) {
        if (part) chunks.push(part.trim());
        part = word;
      } else {
        part = (part + " " + word).trim();
      }
    }
    if (part) chunks.push(part.trim());
  };

  for (const sentence of sentences) {
    if (sentence.length > MAX_CHUNK_CHARS) {
      if (current.trim()) {
        chunks.push(current.trim());
        current = "";
      }
      pushLongSentence(sentence);
    } else if ((current + sentence).length > MAX_CHUNK_CHARS) {
      chunks.push(current.trim());
      current = sentence;
    } else {
      current += sentence;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.filter((c) => c.length > 0);
}

async function fetchAudio(text: string, arabic: boolean): Promise<AudioBuffer> {
  const cfg = arabic ? TTS.arabic : TTS.english;
  const bytes = await invoke<ArrayBuffer>("groq_speak", {
    text,
    model: cfg.model,
    voice: cfg.voice,
  });
  return await getContext().decodeAudioData(bytes);
}

// Play the audio buffer and animate the mouth level based on the RMS of the signal
function playBuffer(buffer: AudioBuffer): Promise<void> {
  return new Promise((resolve) => {
    const ctx = getContext();
    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    analyser.connect(ctx.destination);

    const samples = new Float32Array(analyser.fftSize);
    const tick = () => {
      analyser.getFloatTimeDomainData(samples);
      let sum = 0;
      for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
      const rms = Math.sqrt(sum / samples.length);
      mouth.level += (Math.min(1, rms * 5) - mouth.level) * 0.5;
      rafId = requestAnimationFrame(tick);
    };

    source.onended = () => {
      cancelAnimationFrame(rafId);
      mouth.level = 0;
      if (currentSource === source) currentSource = null;
      resolve();
    };

    currentSource = source;
    mouth.active = true;
    tick();
    source.start();
  });
}

export function stopNaturalSpeech() {
  runId += 1; // stop any in-progress speech
  cancelAnimationFrame(rafId);
  mouth.active = false;
  mouth.level = 0;
  if (currentSource) {
    try {
      currentSource.stop();
    } catch {
      // already stopped
    }
    currentSource = null;
  }
}



export async function speakNatural(text: string, cb: Callbacks = {}): Promise<Result> {
  if (!TTS.enabled) return { ok: false };
  if (!("__TAURI_INTERNALS__" in window)) return { ok: false };

  stopNaturalSpeech();
  const run = ++runId;

  // Browsers keep audio locked til interacted with the page once
  const ctx = getContext();
  if (ctx.state !== "running") {
    try {
      await ctx.resume();
    } catch {
      // handled below
    }
  }
  if (ctx.state !== "running") {
    return { ok: false, error: "audio is blocked until you click inside Doo once" };
  }

  const arabic = isMostlyArabic(text);
  const chunks = splitIntoChunks(text);
  if (chunks.length === 0) return { ok: true };

  // Request all pieces at once then play them in order as they arrive
  let lastError: string | undefined;
  const buffers = chunks.map((chunk) =>
    fetchAudio(chunk, arabic).catch((err) => {
      lastError = String(err);
      console.warn("Natural voice request failed:", err);
      return null;
    })
  );

  const first = await buffers[0];
  if (run !== runId) return { ok: true }; 
  if (!first) return { ok: false, error: lastError };

  cb.onStart?.();
  await playBuffer(first);

  for (let i = 1; i < buffers.length; i++) {
    if (run !== runId) return { ok: true };
    const next = await buffers[i];
    if (!next || run !== runId) break;
    await playBuffer(next);
  }

  if (run === runId) {
    mouth.active = false;
    cb.onEnd?.();
  }
  return { ok: true };
}