// English: autumn, diana, hannah (female) / austin, daniel, troy (male)
// Arabic (Saudi): fahad, abdullah (Groq's docs also mention sultan, lulwa, noura, aisha)
export const TTS = {
  enabled: true, // set to false to use the basic browser voice
  english: { model: "canopylabs/orpheus-v1-english", voice: "austin" },
  arabic: { model: "canopylabs/orpheus-arabic-saudi", voice: "fahad" },
};


export const MAX_CHUNK_CHARS = 190;