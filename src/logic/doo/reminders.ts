import { invoke } from "@tauri-apps/api/core";
import { parseReminder } from "../../hooks/services/groqService";

export type Reminder = { id: string; text: string; dueMs: number };

const REMINDER_INTENT = /\bremind(er|ers)?\b/i;

export function looksLikeReminderRequest(text: string): boolean {
  return REMINDER_INTENT.test(text);
}

function describeDue(dueMs: number): string {
  const due = new Date(dueMs);
  const now = new Date();
  const time = due.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);

  if (due.toDateString() === now.toDateString()) return `today at ${time}`;
  if (due.toDateString() === tomorrow.toDateString()) return `tomorrow at ${time}`;
  const day = due.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
  return `${day} at ${time}`;
}


// to handle a reminder request, saving it then returning a confirmation message
export async function handleReminderRequest(userText: string): Promise<string | null> {
  if (!looksLikeReminderRequest(userText)) return null;

  const parsed = await parseReminder(userText);
  if (!parsed) {
    return `I couldn't work out when you want that. Try something like "remind me in 10 minutes to stretch" or "remind me tomorrow at 9 to study".`;
  }

  const reminder: Reminder = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    text: parsed.text,
    dueMs: parsed.dueMs,
  };

  try {
    await invoke("add_reminder", {
      id: reminder.id,
      text: reminder.text,
      dueMs: reminder.dueMs,
    });
  } catch (err) {
    console.warn("Could not save reminder:", err);
    return "Something went wrong saving that reminder, so I won't remember it. Try again in a moment.";
  }

  return `Okay, I'll remind you ${describeDue(parsed.dueMs)}: ${parsed.text}.`;
}