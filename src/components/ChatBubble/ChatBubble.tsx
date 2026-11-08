import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./ChatBubble.css";
import ChatHeader from "./ChatHeader";
import Message from "./Message";
import { generateDooReply } from "../../logic/doo/personality";
import type { Emotion, DooContext } from "../../logic/doo/types";
import { loadMemory, saveMemory, extractName, type DooMemory } from "../../logic/doo/memory";
import { extractFacts } from "../../hooks/services/groqService";
import { transcribeAudio } from "../../hooks/services/groqAudioService";
import { useVoiceRecorder } from "../../hooks/useVoiceRecorder";
import { useConversationMode, type EndReason } from "../../hooks/useConversationMode";
import { handleReminderRequest, type Reminder } from "../../logic/doo/reminders";

type MessageType = {
  text: string;
  sender: "user" | "ai";
};

type ChatBubbleProps = {
  emotion: Emotion;
  setEmotion: React.Dispatch<React.SetStateAction<Emotion>>;
  setIsTalking: React.Dispatch<React.SetStateAction<boolean>>;
  setIsListening: React.Dispatch<React.SetStateAction<boolean>>;
  reminderQueue: Reminder[];
  onReminderShown: (id: string) => void;
};

const FRESH_MEMORY: DooMemory = { userName: null, history: [], facts: [] };

// to clean up text for speech synthesis, removing emojis and extra whitespace
function cleanForSpeech(text: string): string {
  return text
    .replace(
      /[\p{Extended_Pictographic}\p{Emoji_Modifier}\p{Regional_Indicator}\uFE0F\u200D\u20E3]/gu,
      ""
    )
    .replace(/\s{2,}/g, " ")
    .trim();
}

function pickVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) return null;
  const english = voices.filter((v) => v.lang.startsWith("en"));
  return (
    english.find((v) => v.localService) ??
    voices.find((v) => v.localService) ??
    null
  );
}

function MicIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <line x1="12" y1="18" x2="12" y2="22" />
      <line x1="8" y1="22" x2="16" y2="22" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  );
}

function WaveIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <line x1="4" y1="10" x2="4" y2="14" />
      <line x1="8" y1="6" x2="8" y2="18" />
      <line x1="12" y1="3" x2="12" y2="21" />
      <line x1="16" y1="7" x2="16" y2="17" />
      <line x1="20" y1="10" x2="20" y2="14" />
    </svg>
  );
}

let hasGreetedThisLaunch = false;

function ChatBubble({
  emotion,
  setEmotion,
  setIsTalking,
  setIsListening,
  reminderQueue,
  onReminderShown,
}: ChatBubbleProps) {
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [handsFree, setHandsFree] = useState(false);
  const [memoryReady, setMemoryReady] = useState(false);
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [keyError, setKeyError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const currentUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const handledRemindersRef = useRef<Set<string>>(new Set());


  // to keep the live copy of memory current and save to disk
  const memoryRef = useRef<DooMemory>(FRESH_MEMORY);

  const [messages, setMessages] = useState<MessageType[]>([
    { text: "Hey I'm Doo. Try me", sender: "ai" },
  ]);
  const [context, setContext] = useState<DooContext>({ lastMessages: [], messageCount: 0 });

  // Single place that updates memory keeps the live copy current and saves to disk
  const applyMemory = (next: DooMemory) => {
    memoryRef.current = next;
    void saveMemory(next);
  };

  // speaks text aloud syncing the mouth to real speech
  const speak = (text: string) => {
    const spokenText = cleanForSpeech(text);
    if (!spokenText) return;

    if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
      window.speechSynthesis.cancel();
    }
    const utterance = new SpeechSynthesisUtterance(spokenText);
    if (voiceRef.current) utterance.voice = voiceRef.current;
    utterance.rate = 1.05;
    utterance.pitch = 1.1;

    currentUtteranceRef.current = utterance; 

    setIsSpeaking(true);// set speaking state to true when speech starts


    // reacts only if the utterance is still the current one 
    const stopTalking = () => {
      if (currentUtteranceRef.current === utterance) {
        setIsTalking(false);
        setIsSpeaking(false);
      }
    };
    utterance.onstart = () => setIsTalking(true);
    utterance.onend = stopTalking;
    utterance.onerror = stopTalking;
    window.speechSynthesis.speak(utterance);

    // safety net
    setTimeout(stopTalking, Math.min(60000, 4000 + spokenText.length * 120));
  };

  const handleClearChat = () => {
    // stop any speech that's still playing
    window.speechSynthesis.cancel();
    currentUtteranceRef.current = null;
    setIsTalking(false);
    setIsSpeaking(false);
    setEmotion("neutral");

    const name = memoryRef.current.userName;
    setMessages([
      { text: name ? `Fresh start, ${name}. What's up?` : "Fresh start. What's up?", sender: "ai" },
    ]);
    setContext({ lastMessages: [], messageCount: 0 });

    // wipe the saved conversation but keeps the name and learned facts
    applyMemory({ ...memoryRef.current, history: [] });
  };

  useEffect(() => {
    let cancelled = false;
    loadMemory().then((loaded) => {
      if (cancelled) return;
      memoryRef.current = loaded;
      setContext({
        lastMessages: loaded.history.map((h) => h.content),
        messageCount: loaded.history.length,
      });

      // Restore chat messages from memory
      const restored: MessageType[] = loaded.history.map((h) => ({
        text: h.content,
        sender: (h.role === "user" ? "user" : "ai") as MessageType["sender"],
      }));

      if (restored.length > 0) {
        // Only greet once per app launch not on every popup open
        if (loaded.userName && !hasGreetedThisLaunch) {
          restored.push({
            text: `Hey ${loaded.userName}, I'm back. Miss me?`,
            sender: "ai",
          });
        }
        setMessages(restored);
      } else if (loaded.userName) {
        setMessages([{ text: `Hey ${loaded.userName}, I'm back. Miss me?`, sender: "ai" }]);
      }

      hasGreetedThisLaunch = true;
      setMemoryReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const loadVoice = () => {
      voiceRef.current = pickVoice();
    };
    loadVoice();
    window.speechSynthesis.addEventListener("voiceschanged", loadVoice);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", loadVoice);
  }, []);

  // only the desktop can check for a saved key
  useEffect(() => {
    if (!("__TAURI_INTERNALS__" in window)) return;
    invoke<boolean>("has_api_key")
      .then(setHasKey)
      .catch(() => setHasKey(null));
  }, []);

  // When a reminder comes due it shows it in the chat says it out loud saves it to history
  useEffect(() => {
    if (!memoryReady || reminderQueue.length === 0) return;

    const reminder = reminderQueue[0];
    if (handledRemindersRef.current.has(reminder.id)) {
      onReminderShown(reminder.id);
      return;
    }
    handledRemindersRef.current.add(reminder.id);

    const text = `Reminder: ${reminder.text}`;
    setMessages((prev) => [...prev, { text, sender: "ai" }]);
    setEmotion("playful");
    speak(text);

    const latest = memoryRef.current;
    applyMemory({
      ...latest,
      history: [...latest.history, { role: "assistant", content: text }],
    });

    onReminderShown(reminder.id);

  }, [reminderQueue, memoryReady]); // run whenever the reminder queue changes or memory is ready

  const handleSend = async (overrideText?: string) => {
    const userText = overrideText ?? input;
    if (!userText.trim() || !memoryReady) return;

    setMessages((prev) => [...prev, { text: userText, sender: "user" }]);
    if (!overrideText) setInput("");
    setIsTyping(true);

    const detectedName = extractName(userText);

    const nextContext: DooContext = {
      lastMessages: [...context.lastMessages, userText],
      messageCount: context.messageCount + 1,
    };

    const before = memoryRef.current;

    // "remind me." messages are handled here
    const reminderReply = await handleReminderRequest(userText);
    const result: { response: string; emotion: Emotion } = reminderReply
      ? { response: reminderReply, emotion: "playful" }
      : await generateDooReply(userText, nextContext, before.history, before.facts);

    setMessages((prev) => [...prev, { text: result.response, sender: "ai" }]);
    setContext(nextContext);
    setEmotion(result.emotion);
    setIsTyping(false);

    speak(result.response);

    // save the new exchange right away (re-reading the latest memory)
    const latest = memoryRef.current;
    applyMemory({
      ...latest,
      userName: latest.userName ?? detectedName,
      history: [
        ...latest.history,
        { role: "user", content: userText },
        { role: "assistant", content: result.response },
      ],
    });

    // learn lasting facts in the background so replies aren't slowed down
    void extractFacts(userText, memoryRef.current.facts).then((newFacts) => {
      if (!newFacts) return;
      console.info("Doo facts updated:", newFacts);
      applyMemory({ ...memoryRef.current, facts: newFacts });
    });
  };


  // One-message recording (click to start, click to stop)
  const handleRecordingComplete = async (blob: Blob): Promise<boolean> => {
    setIsTranscribing(true);
    const text = await transcribeAudio(blob);
    setIsTranscribing(false);
    if (text) {
      void handleSend(text);
      return true;
    }
    return false;
  };

  const handleConversationEnd = (reason: EndReason) => {
    setHandsFree(false);
    if (reason === "mic-error") {
      setMessages((prev) => [
        ...prev,
        {
          text: "I can't reach your microphone. Check that it's allowed and not in use by another app.",
          sender: "ai",
        },
      ]);
    }
  };

  const handleSaveKey = async () => {
    setKeyError(null);
    try {
      await invoke("set_api_key", { key: keyInput });
      setKeyInput("");
      setHasKey(true);
      setMessages((prev) => [
        ...prev,
        { text: "Key saved. I'm properly awake now.", sender: "ai" },
      ]);
    } catch (err) {
      setKeyError(String(err));
    }
  };

  // One-message recording (click to start, click to stop)
  const { isRecording, toggleRecording } = useVoiceRecorder(handleRecordingComplete);

  // Hands-free conversation mode (wait for speech, then for silence)
  const { phase } = useConversationMode({
    active: handsFree,
    paused: isTyping || isTranscribing || isSpeaking,
    onUtterance: handleRecordingComplete,
    onEnd: handleConversationEnd,
  });

  // Let the character know when Doo is listening (it tilts its head and widens its eyes)
  useEffect(() => {
    setIsListening(isRecording || phase !== "off");
  }, [isRecording, phase, setIsListening]);
  useEffect(() => () => setIsListening(false), [setIsListening]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping, isRecording, isTranscribing, phase]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleSend();
  };

  return (
    <div className="chat-bubble">
      <ChatHeader mood={emotion} onClear={handleClearChat} disabled={isTyping} />

      <div className="messages-container">
        {messages.map((msg, i) => (
          <Message key={i} text={msg.text} sender={msg.sender} />
        ))}

        {isRecording && (
          <div className="typing">
            Listening <span className="dots"></span>
          </div>
        )}

        {phase === "waiting" && (
          <div className="typing">
            Listening, go ahead <span className="dots"></span>
          </div>
        )}

        {phase === "hearing" && (
          <div className="typing">
            Hearing you <span className="dots"></span>
          </div>
        )}

        {isTranscribing && (
          <div className="typing">
            Transcribing <span className="dots"></span>
          </div>
        )}

        {isTyping && (
          <div className="typing">
            Doo is thinking <span className="dots">...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {hasKey === false && (
        <div className="key-banner">
          <p>
            I'm on basic canned replies. Paste a free Groq key (from console.groq.com) to
            unlock the real me.
          </p>
          <div className="key-row">
            <input
              type="password"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder="gsk_..."
            />
            <button type="button" onClick={handleSaveKey}>
              Save
            </button>
          </div>
          {keyError && <p className="key-error">{keyError}</p>}
        </div>
      )}

      <div className="input-container">
        <button
          type="button"
          onClick={toggleRecording}
          disabled={handsFree}
          className={`mic-button ${isRecording ? "recording" : ""}`}
          title={isRecording ? "Stop recording" : "Record a message"}
          aria-label={isRecording ? "Stop recording" : "Record a message"}
        >
          {isRecording ? <StopIcon /> : <MicIcon />}
        </button>
        <button
          type="button"
          onClick={() => setHandsFree((on) => !on)}
          disabled={isRecording}
          className={`mic-button ${handsFree ? "handsfree" : ""}`}
          title={handsFree ? "End hands-free conversation" : "Start a hands-free conversation"}
          aria-label={handsFree ? "End hands-free conversation" : "Start a hands-free conversation"}
        >
          <WaveIcon />
        </button>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Talk to Doo..."
        />
        <button onClick={() => handleSend()}>Send</button>
      </div>
    </div>
  );
}

export default ChatBubble;