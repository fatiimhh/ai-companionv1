import { invoke } from "@tauri-apps/api/core";

const MODEL = "openai/gpt-oss-20b";
const MAX_FACTS = 25;

export type ChatTurn = { role: "user" | "assistant"; content: string };

type GroqResponse = { choices?: { message?: { content?: string } }[] };

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



async function callGroqChat(body: Record<string, unknown>): Promise<GroqResponse | null> {
  if (!("__TAURI_INTERNALS__" in window)) return null;
  try {
    const raw = await invoke<string>("groq_chat", { body: JSON.stringify(body) });
    return JSON.parse(raw) as GroqResponse;
  } catch (err) {
    if (!String(err).includes("NO_API_KEY")) console.warn("Groq request failed:", err);
    return null;
  }
}

export async function getGroqReply(
  userMessage: string,
  history: ChatTurn[],
  facts: string[] = []
): Promise<string | null> {
  const data = await callGroqChat({
    model: MODEL,
    messages: [
      { role: "system", content: buildSystemPrompt(facts) },
      ...history.slice(-8),
      { role: "user", content: userMessage },
    ],
    temperature: 0.9,
    max_tokens: 600,
    reasoning_effort: "low",
  });
  if (!data) return null;

  const text = data.choices?.[0]?.message?.content;
  if (!text?.trim()) {
    console.warn("Groq returned an empty reply:", data);
    return null;
  }
  return text.trim();
}


// to extract lasting facts from a user message, like plans, deadlines, goals...
export async function extractFacts(
  userMessage: string,
  existingFacts: string[]
): Promise<string[] | null> {
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

  const data = await callGroqChat({
    model: MODEL,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.2,
    max_tokens: 800,
    reasoning_effort: "low",
  });
  if (!data) return null;

  try {
    const text = data.choices?.[0]?.message?.content ?? "";
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return null;

    const parsed = JSON.parse(match[0]);
    if (!Array.isArray(parsed)) return null;

    const cleaned = parsed
      .filter((f): f is string => typeof f === "string" && f.trim().length > 0)
      .map((f) => f.trim())
      .slice(-MAX_FACTS);

// return null if the list is unchanged, otherwise return the new list
      return cleaned.length > 0 ? cleaned : null;
  } catch (err) {
    console.warn("Fact extraction errored:", err);
    return null;
  }
}

export type ParsedReminder = { text: string; dueMs: number };


// asks the model to parse a reminder request into a short text and a due time
export async function parseReminder(userMessage: string): Promise<ParsedReminder | null> {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const localNow = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const weekday = now.toLocaleDateString("en-US", { weekday: "long" });

  const prompt = `You turn a reminder request into JSON.
The user's current local date and time is ${localNow} (${weekday}).

Request: "${userMessage}"

Return only a JSON object like {"text": "Study for your exam", "in_minutes": 10, "at": null}:
- "text": the thing to be reminded about, as a short phrase without "remind me" (for example "Study for your exam"). Use normal capitalization.
- "in_minutes": a number if the request is relative to now ("in 10 minutes" = 10, "in 2 hours" = 120), otherwise null.
- "at": for a specific day or time, the user's LOCAL time as "YYYY-MM-DDTHH:mm" in 24-hour format, otherwise null. If only a clock time is given and it has already passed today, use tomorrow. When no exact time is given: morning = 09:00, afternoon = 15:00, evening = 19:00, tonight = 21:00.
- Set exactly one of "in_minutes" or "at".
- If there is no usable time, or no clear thing to remember, return {"text": null, "in_minutes": null, "at": null}.`;

  const data = await callGroqChat({
    model: MODEL,
    messages: [{ role: "user", content: prompt }],
    temperature: 0,
    max_tokens: 800,
    reasoning_effort: "low",
  });
  if (!data) return null;

  try {
    const raw = data.choices?.[0]?.message?.content ?? "";
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;

    const parsed = JSON.parse(match[0]);
    const text = typeof parsed.text === "string" ? parsed.text.trim() : "";
    if (!text) return null;

    let dueMs: number | null = null;
    if (typeof parsed.in_minutes === "number" && parsed.in_minutes > 0) {
      dueMs = Date.now() + parsed.in_minutes * 60_000;
    } else if (typeof parsed.at === "string") {
      const t = new Date(parsed.at).getTime(); // no timezone in the string = local time
      if (Number.isFinite(t)) dueMs = t;
    }
    if (dueMs === null) return null;

    // to avoid reminders in the past or more than a year in the future
    const nowMs = Date.now();
    if (dueMs < nowMs - 30_000 || dueMs > nowMs + 365 * 24 * 3600 * 1000) return null;

    return { text, dueMs: Math.max(dueMs, nowMs + 1000) };
  } catch (err) {
    console.warn("Reminder parsing errored:", err);
    return null;
  }
}