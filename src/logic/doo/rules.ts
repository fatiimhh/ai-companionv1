import type { DooContext } from "./types";

export function detectMood(input: string, context: DooContext) {
  const text = input.toLowerCase();

  // teasing triggers
  if (text.includes("youtube") || text.includes("tiktok")) {
    return "teasing";
  }

  // productivity triggers
  if (text.includes("study") || text.includes("work")) {
    return "playful";
  }

  // default behavior shift
  if (context.messageCount > 10) {
    return "teasing";
  }

  return "neutral";
}