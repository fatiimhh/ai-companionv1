import { detectMood } from "./rules";
import { getDooResponse } from "./responses";
import { detectEmotion } from "./emotion";
import { getGroqReply, type ChatTurn } from "../../hooks/services/groqService";
import type { DooContext } from "./types";

export type DooReply = {
  response: string;
  mood: ReturnType<typeof detectMood>;
  emotion: ReturnType<typeof detectEmotion>;
  source: "llm" | "offline";
};

// Tries a real LLM reply first; falls back to the deterministic rule-based
// responder if there's no API key configured or the request fails. This
// means Doo always replies instantly and never shows an error to the user,
// while still being "real AI" whenever a key is present.
export async function generateDooReply(
  input: string,
  context: DooContext,
  history: ChatTurn[] = []
): Promise<DooReply> {
  const mood = detectMood(input, context);
  const emotion = detectEmotion(input, context.messageCount);

  const llmReply = await getGroqReply(input, history);

  if (llmReply) {
    return { response: llmReply, mood, emotion, source: "llm" };
  }

  const response = getDooResponse(input, mood);
  return { response, mood, emotion, source: "offline" };
}
