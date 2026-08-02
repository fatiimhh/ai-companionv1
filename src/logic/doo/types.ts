export type Mood = "playful" | "teasing" | "neutral";

export type Emotion = "neutral" | "playful" | "teasing" | "curious";

export type DooContext = {
  lastMessages: string[];
  messageCount: number;
};