const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "openai/gpt-oss-20b";
const MAX_FACTS = 25;

export type ChatTurn = { role: "user" | "assistant"; content: string };

const DOO_SYSTEM_PROMPT = `You are Doo, a small, witty AI desktop companion that lives on the user's screen.
Personality: playful, a little teasing, genuinely supportive underneath the sarcasm. You notice
patterns in what the user tells you (procrastinating, working, studying) and comment on them like
a friend would, not like a generic assistant. Keep replies SHORT — 1-2 sentences, chat-bubble length.
Never break character or mention that you are an AI language model.`;

function buildSystemPrompt(facts: string[]): string {
  if (facts.length === 0) return DOO_SYSTEM_PROMPT;
  return `${DOO_SYSTEM_PROMPT}

Things you remember about the user (some may be out of date, so don't treat them as certain):
${facts.map((f) => `- ${f}`).join("\n")}
Bring these up naturally and only when relevant, like a friend would. Don't recite them as a list unless the user asks what you remember.`;
}

export async function getGroqReply(
  userMessage: string,
  history: ChatTurn[],
  facts: string[] = []
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
          { role: "system", content: buildSystemPrompt(facts) },
          ...history.slice(-8),
          { role: "user", content: userMessage },
        ],
        temperature: 0.9,
        max_tokens: 600,
        reasoning_effort: "low",
      }),
    });

    if (!response.ok) {
      console.warn("Groq request failed:", response.status, await response.text());
      return null;
    }

    const data = await response.json();
    const text: string | undefined = data?.choices?.[0]?.message?.content;
    if (!text?.trim()) {
      console.warn("Groq returned an empty reply:", data);
      return null;
    }
    return text.trim();
  } catch (err) {
    console.warn("Groq request errored, falling back to offline replies:", err);
    return null;
  }
}

// to extract facts from user messages and update the memory
export async function extractFacts( 
  userMessage: string,
  existingFacts: string[]
): Promise<string[] | null> {
  const apiKey = import.meta.env.VITE_GROQ_API_KEY;
  if (!apiKey) return null;
  if (userMessage.trim().length < 12) return null; // skip "hi", "ok", etc.

  const today = new Date().toISOString().slice(0, 10);
  const prompt = `You maintain a short list of lasting facts about a user for a companion app.
Today's date is ${today}.

Current facts:
${existingFacts.length ? existingFacts.map((f) => `- ${f}`).join("\n") : "(none yet)"}

The user just said: "${userMessage}"

Return the complete updated list of facts as a JSON array of short strings, and nothing else.
Rules:
- Only keep things worth remembering later: plans, deadlines, goals, projects, preferences, people, and personal circumstances the user shared about themselves.
- Skip small talk, greetings, and questions to the assistant.
- For time-sensitive things (like "exam on Friday"), include when it was said, e.g. "Has an exam on Friday (said on ${today})".
- If the new message updates or contradicts an existing fact, replace the old one.
- Keep each fact under 15 words and keep at most ${MAX_FACTS} facts.
- If nothing changes, return the current list unchanged.`;

  try {
    const response = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
        max_tokens: 800,
        reasoning_effort: "low",
      }),
    });

    if (!response.ok) {
      console.warn("Fact extraction failed:", response.status);
      return null;
    }

    const data = await response.json();
    const text: string = data?.choices?.[0]?.message?.content ?? "";
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return null;

    const parsed = JSON.parse(match[0]);
    if (!Array.isArray(parsed)) return null;

    const cleaned = parsed
      .filter((f): f is string => typeof f === "string" && f.trim().length > 0)
      .map((f) => f.trim())
      .slice(-MAX_FACTS);

    
    return cleaned.length > 0 ? cleaned : null;
  } catch (err) {
    console.warn("Fact extraction errored:", err);
    return null;
  }
}