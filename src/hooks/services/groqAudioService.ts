import { invoke } from "@tauri-apps/api/core";

export async function transcribeAudio(audioBlob: Blob): Promise<string | null> {
  if (!("__TAURI_INTERNALS__" in window)) return null;

  try {
    const bytes = Array.from(new Uint8Array(await audioBlob.arrayBuffer()));
    const raw = await invoke<string>("groq_transcribe", { audio: bytes, mime: audioBlob.type });
    const data = JSON.parse(raw);
    return data?.text?.trim() || null;
  } catch (err) {
    if (!String(err).includes("NO_API_KEY")) console.warn("Groq transcription failed:", err);
    return null;
  }
}