const GROQ_TRANSCRIPTION_URL = "https://api.groq.com/openai/v1/audio/transcriptions";

export async function transcribeAudio(audioBlob: Blob): Promise<string | null> {
  const apiKey = import.meta.env.VITE_GROQ_API_KEY;
  if (!apiKey) return null;

  try {
    const formData = new FormData();
    formData.append("file", audioBlob, "recording.webm");
    formData.append("model", "whisper-large-v3-turbo");

    const response = await fetch(GROQ_TRANSCRIPTION_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
    });

    if (!response.ok) {
      console.warn("Groq transcription failed:", response.status, await response.text());
      return null;
    }

    const data = await response.json();
    return data?.text?.trim() || null;
  } catch (err) {
    console.warn("Groq transcription errored:", err);
    return null;
  }
}