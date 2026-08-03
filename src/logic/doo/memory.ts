

import { invoke } from "@tauri-apps/api/core";
import type { ChatTurn } from "../../hooks/services/groqService";

const MAX_TURNS = 20;

export type DooMemory = {
  userName: string | null;
  history: ChatTurn[];
};

const EMPTY_MEMORY: DooMemory = { userName: null, history: [] };

export async function loadMemory(): Promise<DooMemory> {
  try {
    const raw = await invoke<string>("load_memory");
    const parsed = JSON.parse(raw);
    return {
      userName: parsed.userName ?? null,
      history: Array.isArray(parsed.history) ? parsed.history : [],
    };
  } catch (err) {
    console.warn("Could not load Doo memory, starting fresh:", err);
    return { ...EMPTY_MEMORY };
  }
}

export async function saveMemory(memory: DooMemory): Promise<void> {
  try {
    const trimmed: DooMemory = {
      userName: memory.userName,
      history: memory.history.slice(-MAX_TURNS),
    };
    await invoke("save_memory", { data: JSON.stringify(trimmed) });
  } catch (err) {
    console.warn("Could not persist Doo memory:", err);
  }
}

export async function clearMemory(): Promise<void> {
  try {
    await invoke("clear_memory");
  } catch (err) {
    console.warn("Could not clear Doo memory:", err);
  }
}

// Very small heuristic: "I'm X" / "my name is X" / "I am X"
export function extractName(text: string): string | null {
  const match = text.match(/\b(?:i am|i'm|my name is)\s+([a-zA-Z]{2,20})\b/i);
  return match ? match[1][0].toUpperCase() + match[1].slice(1).toLowerCase() : null;
}