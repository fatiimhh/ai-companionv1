# Doo — AI Desktop Companion

Doo is a small AI companion that lives on your desktop as an always-on-top
window. Click it to chat. It has moods, remembers a bit about you between
sessions, and reacts visually to how the conversation is going.

This is a **v1 / in-progress** project. What's below is what's actually
built and working right now — see [Roadmap](#roadmap) for what's planned
but not yet implemented.

## What's actually working

- 🖥️ **Cross-platform desktop app** via [Tauri](https://tauri.app/) (Rust
  shell + React/TypeScript frontend) — small binary, native window, no
  Electron overhead.
- 💬 **Real LLM-powered conversation** via the Groq API (Llama 3.1),
  with a deterministic offline fallback if no API key is set or the
  request fails, so the app never breaks or shows an error mid-chat.
- 🧠 **Lightweight persistent memory** — Doo remembers your name (if you
  mention it) and your recent conversation across app restarts.
- 😊 **Emotion system** — a rule-based mood/emotion detector reads your
  messages and drives both Doo's reply tone and its visual state
  (color, scale, animation speed).
- 🎬 **Live animation loop** — Doo idles with a breathing motion and
  reacts to emotion changes in real time via `@react-three/fiber`.
  The current model is a placeholder box, not a rigged character yet
  (see Roadmap).

## Tech stack

- **Frontend:** React 19, TypeScript, Vite
- **3D/animation:** `@react-three/fiber`, `@react-three/drei`, `three`
- **Desktop shell:** Tauri 2 (Rust)
- **AI:** Groq API (Llama 3.1 8B), with local rule-based fallback

## Architecture

```
src/
  components/
    Character/     — 3D character + emotion-driven animation
    ChatBubble/     — chat UI, message list, input
  logic/doo/
    personality.ts  — orchestrates a reply: tries the LLM, falls back to rules
    rules.ts        — keyword-based mood detection (offline fallback)
    responses.ts    — canned replies used by the offline fallback
    emotion.ts       — maps input -> Doo's visual emotion state
    memory.ts        — persists name + recent history across sessions
  hooks/services/
    groqService.ts  — Groq chat-completions client
src-tauri/          — Tauri/Rust desktop shell (currently default config)
```

## Running it locally

```bash
npm install
cp .env.example .env      # add your Groq API key (optional — works without one)
npm run tauri dev
```

Get a free Groq API key at [console.groq.com](https://console.groq.com).
Without a key, Doo still works, using its offline keyword-based responses.

## Roadmap

Not built yet — listed here honestly rather than claimed as done:

- 🎙️ Voice input and speech output
- 🤖 A real rigged/animated 3D character model (current one is a placeholder box)
- 👀 Cursor and user-interaction tracking
- 🔔 Notifications and reminders
- 📂 Desktop automation via custom Tauri/Rust commands
- 🧠 Deeper memory (semantic recall, not just a rolling window)

## Status

🚧 Actively in development. Core chat + memory loop works end-to-end;
visual character and voice are the next milestones.
