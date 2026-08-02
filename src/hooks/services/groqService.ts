// Thin client for Groq's chat completions API.
// Returns null on any failure so callers can fall back to the offline
// rule-based responder instead of crashing or showing an error to the user.

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.1-8b-instant";

export type ChatTurn = { role: "user" | "assistant"; content: string };

const DOO_SYSTEM_PROMPT = `You are Doo, a small, witty AI desktop companion that lives on the user's screen.
Personality: playful, a little teasing, genuinely supportive underneath the sarcasm. You notice
patterns in what the user tells you (procrastinating, working, studying) and comment on them like
a friend would, not like a generic assistant. Keep replies SHORT — 1-2 sentences, chat-bubble length.
Never break character or mention that you are an AI language model.`;

export async function getGroqReply(
  userMessage: string,
  history: ChatTurn[]
): Promise<string | null> {
  const apiKey = import.meta.env.VITE_GROQ_API_KEY;
  if (!apiKey) return null;

  try {
    const response = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: DOO_SYSTEM_PROMPT },
          ...history.slice(-8), // keep last few turns so replies stay in context
          { role: "user", content: userMessage },
        ],
        temperature: 0.9,
        max_tokens: 120,
      }),
    });

    if (!response.ok) {
      console.warn("Groq request failed:", response.status, await response.text());
      return null;
    }

    const data = await response.json();
    const text: string | undefined = data?.choices?.[0]?.message?.content;
    return text?.trim() || null;
  } catch (err) {
    console.warn("Groq request errored, falling back to offline replies:", err);
    return null;
  }
}