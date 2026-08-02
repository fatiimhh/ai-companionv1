import type { Mood } from "./types";

export function getDooResponse(input: string, mood: Mood) {
  const text = input.toLowerCase();

  // YouTube / procrastination
  if (text.includes("youtube")) {
    return "YouTube again? I see we’re committing to this lifestyle.";
  }

  // Study
  if (text.includes("study")) {
    return mood === "playful"
      ? "Look at you being productive… suspicious behavior honestly"
      : "Good. Stay focused. I’m watching";
  }

  // Work
  if (text.includes("work")) {
    return "Work mode activated? I’ll believe it when I see it";
  }

  // Default responses based on mood
  switch (mood) {
    case "teasing":
      return "Hmm… interesting choice of words. I’m judging slightly";

    case "playful":
      return "Okay okay, I see you trying your best";

    default:
      return "Tell me more";
  }
}