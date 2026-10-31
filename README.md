# Doo — AI Desktop Companion

Doo is a small AI companion that lives on your desktop. Click it to chat, by
typing or by talking, and it talks back. It has moods, remembers you between
sessions, reminds you of things, and reacts visually to how the conversation
is going.



It's designed as a small always-on-top overlay and is still in active
development. What's below is what's built and working today. See the
[Roadmap](#roadmap) for what isn't.

## What's working

- **Desktop app** via [Tauri](https://tauri.app/) (Rust shell +
  React/TypeScript frontend): small binary, native window, no Electron
  overhead. Builds for Windows and macOS.
- **Real LLM conversation** via the Groq API (`openai/gpt-oss-20b`), with a
  rule-based offline fallback if there's no API key or a request fails, so
  the app never errors out mid-chat.
- **The API key never touches the frontend.** Every Groq request (chat, fact
  extraction, reminder parsing, Whisper transcription) is made by the Rust
  backend. The key is pasted into the app once, saved locally, and is not
  inside the installer.
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
- **Reminders that survive closing the window:** say "remind me tomorrow at
  9 to study" or "remind me in 10 minutes to stretch" and the LLM turns it
  into an exact time. Reminders are saved to disk and checked every few
  seconds by a scheduler in the Rust backend, which sends a native
  notification, and Doo also opens the chat and says it out loud. Reminders
  that came due while Doo was fully quit show up as "missed" on the next
  launch.
- **Runs in the background:** closing the window hides Doo to the system
  tray (menu bar on macOS) instead of quitting, so reminders keep working.
  The tray menu has "Show Doo" and "Quit Doo".
- **Chat controls:** a clear-chat button (with a confirm step) wipes the
  conversation but keeps the learned long-term facts.
- **Emotion system:** a rule-based detector reads your messages and drives
  both Doo's reply tone and its visual state.
- **Custom 3D character:** built entirely in code with
  `@react-three/fiber`, with no imported model. A soft blob body, a glowing
  antenna that matches Doo's mood color, and eyes that blink on a random
  timer and open or squint per emotion. A mouth moves while Doo speaks, a
  gentle sway and breathing bob run while idle, and each emotion change
  triggers a short reaction (a hop, a flinch, a perk-up).

## Tech stack

- **Frontend:** React 19, TypeScript, Vite
- **3D/animation:** `@react-three/fiber`, `@react-three/drei`, `three`
- **Desktop shell:** Tauri 2 (Rust), `reqwest` for HTTP
- **AI:** Groq API (chat completions + Whisper transcription), with a local
  rule-based fallback
- **Voice:** `MediaRecorder` (input), Web Speech `speechSynthesis` (output)
- **Background tasks:** system tray, `tauri-plugin-notification`, a Rust
  scheduler thread
- **CI:** GitHub Actions workflow that builds the macOS app

## Architecture

```
src/
  components/
    Character/        — procedural 3D character + emotion-driven animation
    ChatBubble/       — chat UI, mic button, API-key banner, speech output
  logic/doo/
    personality.ts    — orchestrates a reply: tries the LLM, falls back to rules
    rules.ts          — keyword-based mood detection (offline fallback)
    responses.ts      — canned replies used by the offline fallback
    emotion.ts        — maps input -> Doo's visual emotion state
    memory.ts         — loads/saves name, chat history and facts via the Tauri commands
    reminders.ts      — detects "remind me..." requests, parses them, saves via Rust
    types.ts          — shared types
  hooks/
    useVoiceRecorder.ts   — click-to-record hook built on MediaRecorder
    services/
      groqService.ts      — builds chat / fact / reminder requests, sends them through Rust
      groqAudioService.ts — sends recorded audio to Rust for transcription
src-tauri/
  src/lib.rs          — memory commands, system tray, hide-on-close
  src/groq.rs         — all Groq requests and API-key storage
  src/reminders.rs    — reminder storage, background scheduler, notifications
.github/workflows/
  build-mac.yml       — builds a universal macOS app on a GitHub-hosted Mac
```

## Install

Pre-built installers are shared directly for now. To make your own, see
[Building from source](#building-from-source). The installers aren't
code-signed (certificates cost money), so your OS will warn you the first
time you open Doo.

**Windows:** run the installer. If you see "Windows protected your PC",
click **More info**, then **Run anyway**.

**macOS (Apple Silicon and Intel):** open the `.dmg` and drag Doo into
Applications. The first time, right-click the app and choose **Open**, then
**Open** again. If that's blocked, go to System Settings > Privacy & Security
and click **Open Anyway**. If macOS says the app is "damaged", run
`xattr -cr /Applications/ai-companion.app` in Terminal and try again. Allow
the microphone and notifications when asked.

**First launch:** Doo needs a free [Groq](https://console.groq.com) API key
for the real AI. Paste it into the banner in the chat. Without a key, Doo
still works using its offline replies, but voice input needs a key.

## Running it locally

You'll need Node.js, Rust, and the
[Tauri prerequisites](https://tauri.app/start/prerequisites/).

```bash
git clone https://github.com/fatiimhh/ai-companionv1.git
cd ai-companionv1
npm install
npm run tauri dev
```

Run it with `npm run tauri dev`, not `npm run dev`. Memory, reminders, and
the AI calls all go through Tauri's Rust backend, which only exists inside
the desktop window, not in a plain browser tab.

## Building from source

```bash
npm run tauri build
```

The Windows installer ends up in `src-tauri/target/release/bundle/nsis/`.

macOS apps can't be built from Windows. The workflow in
`.github/workflows/build-mac.yml` builds a universal `.dmg` on a GitHub Mac:
run it manually from the repo's Actions tab and download the artifact.

By default no API key is included in a build. If you set a `GROQ_API_KEY`
environment variable while building, that key is embedded in the app as a
fallback. Anyone with the installer can extract it, so only do that for
people you trust, and use a key you can revoke.

## Known limitations

- The API key is saved as plain text in `doo-settings.json` in the app-data
  folder of the user's account. Storing it in the OS keychain would be better.
- Installers aren't code-signed, so Windows and macOS both show a warning on
  first launch.
- macOS support is new and has had limited testing. Microphone permission
  and notifications are the parts most likely to behave differently.
- Memory is a rolling window of recent messages (100 saved, the last 8 sent
  to the model) plus an LLM-maintained list of up to 25 facts. It isn't
  embedding-based recall, and the fact list can occasionally miss details or
  keep something outdated.
- Saved memory (chat history and learned facts) is stored unencrypted on the
  local machine, and the relevant parts are sent to Groq with each request.
- Reminders are checked every few seconds while Doo is running (hidden in the
  tray counts as running). If Doo is fully quit, they fire on the next launch.
- A browser-only build can be hosted on GitHub Pages, but memory, reminders,
  and AI replies only work in the desktop app, so the web version only shows
  the character and offline replies.
- Speech output quality depends on the voices installed on the OS.

## Roadmap

Not built yet:

- Final overlay window: small, transparent, borderless, always-on-top (it's
  currently developed in a larger bordered window)
- Start automatically at login
- Code-signed installers and in-app updates
- Store the API key in the OS keychain
- Smarter memory retrieval (embeddings, so only relevant facts are used
  instead of the whole list)
- Cursor and user-interaction tracking
- Desktop automation via custom Tauri/Rust commands

## License

Copyright © 2026 Fatima Bani Sakher. All rights reserved. The source is
public for viewing and evaluation only. See [LICENSE](LICENSE).

## Status

Actively in development. The full loop works end to end: talk or type, Doo
replies in character, speaks the answer, reacts visually, remembers you, and
reminds you of things, even when its window is closed.