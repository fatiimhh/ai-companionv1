export type Emotion = "neutral" | "playful" | "teasing" | "curious";

export function detectEmotion(input: string, messageCount: number): Emotion {
  const text = input.toLowerCase();

  // teasing triggers
  if (text.includes("youtube") || text.includes("tiktok")) {
    return "teasing";
  }

  // productivity (playful support)
  if (text.includes("study") || text.includes("work")) {
    return "playful";
  }

  // curiosity triggers
  if (text.includes("?")) {
    return "curious";
  }

  // long conversation = more teasing over time
  if (messageCount > 8) {
    return "teasing";
  }

  return "neutral";
}