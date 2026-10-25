# Doo — AI Desktop Companion

Doo is a small AI companion that lives on your desktop. Click it to chat,
by typing or by talking, and it talks back. It has moods, remembers you
between sessions, and reacts visually to how the conversation is going.

It's designed as a small always-on-top overlay, and it's still in active
development. What's below is what's built and working today. See the
[Roadmap](#roadmap) for what isn't.

## What's working

- **Desktop app** via [Tauri](https://tauri.app/) (Rust shell +
  React/TypeScript frontend): small binary, native window, no Electron
  overhead.
- **Real LLM conversation** via the Groq API (`openai/gpt-oss-20b`), with a
  rule-based offline fallback if there's no API key or a request fails, so
  the app never errors out mid-chat.
- **Voice input:** click the mic to start recording, click again to stop.
  Audio is transcribed with Groq's Whisper and sent like a typed message.
- **Voice output:** every reply is spoken aloud with the browser's built-in
  speech synthesis (emojis are stripped so they aren't read out). Doo's
  mouth animation is synced to the actual start and end of speech.
- **Persistent memory:** Doo remembers your name and your recent
  conversation (last 100 messages) across restarts, and the chat is
  restored on screen whenever you reopen the popup. Memory is stored as JSON
  in the OS app-data directory through custom Rust commands
  (`load_memory`, `save_memory`, `clear_memory`).
- **Long-term facts:** after each message, a background LLM call keeps an
  up-to-date list of lasting facts about you (plans, deadlines, projects,
  preferences). Time-sensitive facts are dated, contradicted facts are
  replaced, and the list is capped at 25. It's injected into Doo's prompt
  so it can bring things up naturally in later conversations.
- **Emotion system:** a rule-based detector reads your messages and drives
  both Doo's reply tone and its visual state.
- **Custom 3D character:** built entirely in code with
  `@react-three/fiber`, with no imported model. A soft blob body, a glowing
  antenna that matches Doo's mood color, and eyes that blink on a random
  timer and open or squint per emotion. A mouth moves while Doo speaks, a
  gentle sway and breathing bob run while idle, and each emotion change
  triggers a short reaction (a hop, a flinch, a perk-up).
- **Reminders that survive closing the window:** say "remind me tomorrow at
  9 to study" or "remind me in 10 minutes to stretch" and the LLM turns it
  into an exact time. Reminders are saved to disk and checked every few
  seconds by a scheduler in the Rust backend, which sends a native Windows
  notification, and Doo also opens the chat and says it out loud. Reminders
  that came due while Doo was fully closed show up as "missed" on the next
  launch.
- **Runs in the background:** closing the window hides Doo to the system
  tray instead of quitting, so reminders keep working. The tray menu has
  "Show Doo" and "Quit Doo".
- **Chat controls:** a clear-chat button (with a confirm step) wipes the
  conversation but keeps the learned long-term facts.
- **Installable:** `npm run tauri build` produces a Windows installer
  (NSIS).

## Tech stack

- **Frontend:** React 19, TypeScript, Vite
- **3D/animation:** `@react-three/fiber`, `@react-three/drei`, `three`
- **Desktop shell:** Tauri 2 (Rust)
- **AI:** Groq API (chat completions + Whisper transcription), with a local
  rule-based fallback
- **Voice:** `MediaRecorder` (input), Web Speech `speechSynthesis` (output)
- **Notifications and background tasks:** `tauri-plugin-notification`,
  system tray, a Rust scheduler thread

## Architecture

```
src/
  components/
    Character/        — procedural 3D character + emotion-driven animation
    ChatBubble/       — chat UI, mic button, message list, speech output
  logic/doo/
    personality.ts    — orchestrates a reply: tries the LLM, falls back to rules
    rules.ts          — keyword-based mood detection (offline fallback)
    responses.ts      — canned replies used by the offline fallback
    emotion.ts        — maps input -> Doo's visual emotion state
    memory.ts         — loads/saves name, chat history and facts via the Tauri commands
    reminders.ts      — detects "remind me..." requests, parses them, saves via Rust   types.ts          — shared types
  hooks/
    useVoiceRecorder.ts   — click-to-record hook built on MediaRecorder
    services/
      groqService.ts      — Groq chat client + background fact extraction      groqAudioService.ts — Groq Whisper transcription client
src-tauri/
  src/lib.rs          — memory commands, system tray, hide-on-close
  src/reminders.rs    — reminder storage, background scheduler, notifications
```

## Running it locally

```bash
npm install
```

Create a `.env` file in the project root:

```
VITE_GROQ_API_KEY=your-key-here
```

Get a free key at [console.groq.com](https://console.groq.com), then:

```bash
npm run tauri dev
```

Run it with `npm run tauri dev`, not `npm run dev`. Memory persistence uses
Tauri's Rust backend, which only exists inside the desktop window, not in a
plain browser tab. Never commit your `.env` file.

Without an API key, chat still works through the offline fallback and
replies are still spoken, but voice input needs a key.

## Known limitations

- The API key is read on the client (`VITE_` variables are bundled into the
  frontend), which is fine for personal local use. A distributable version
  should route API calls through the Rust backend instead.
- Memory is a rolling window of recent messages (100 saved, the last 8 sent
  to the model) plus an LLM-maintained list of up to 25 facts. It isn't
  embedding-based recall, and the fact list can occasionally miss details or
  keep something outdated.
- Saved memory (chat history and learned facts) is stored unencrypted on the
  local machine, and the relevant parts are sent to Groq with each request.- A browser-only build can be hosted on GitHub Pages, but memory
  persistence only works in the desktop app.
- Speech output quality depends on the voices installed on the OS.

## Roadmap

Not built yet:

- Final overlay window: small, transparent, borderless, always-on-top (it's
  currently developed in a larger bordered window)
- Move API calls behind the Rust backend so no key ships in the frontend
- Start automatically with Windows
- Smarter memory retrieval (embeddings, so only relevant facts are used
  instead of the whole list)
- Cursor and user-interaction tracking
- Desktop automation via custom Tauri/Rust commands

## Status

Actively in development. The full loop works end to end: talk or type, Doo
replies in character, speaks the answer, reacts visually, and remembers you
next time.