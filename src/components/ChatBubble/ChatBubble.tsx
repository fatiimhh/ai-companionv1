import { useState, useEffect, useRef } from "react";
import "./ChatBubble.css";
import ChatHeader from "./ChatHeader";
import Message from "./Message";
import { generateDooReply } from "../../logic/doo/personality";
import type { Emotion, DooContext } from "../../logic/doo/types";
import { loadMemory, saveMemory, extractName, type DooMemory } from "../../logic/doo/memory";
import { extractFacts } from "../../hooks/services/groqService";
import { transcribeAudio } from "../../hooks/services/groqAudioService";
import { useVoiceRecorder } from "../../hooks/useVoiceRecorder";
import { handleReminderRequest, type Reminder } from "../../logic/doo/reminders";

type MessageType = {
  text: string;
  sender: "user" | "ai";
};

type ChatBubbleProps = {
  emotion: Emotion;
  setEmotion: React.Dispatch<React.SetStateAction<Emotion>>;
  setIsTalking: React.Dispatch<React.SetStateAction<boolean>>;
  reminderQueue: Reminder[];
  onReminderShown: (id: string) => void;
};

const FRESH_MEMORY: DooMemory = { userName: null, history: [], facts: [] };

// to clean up text for speech synthesis
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

let hasGreetedThisLaunch = false;

function ChatBubble({
  emotion,
  setEmotion,
  setIsTalking,
  reminderQueue,
  onReminderShown,
}: ChatBubbleProps) {
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [memoryReady, setMemoryReady] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const currentUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const handledRemindersRef = useRef<Set<string>>(new Set());

 
  // to keep track of the current memory state without triggering re-renders
  const memoryRef = useRef<DooMemory>(FRESH_MEMORY);

  const [messages, setMessages] = useState<MessageType[]>([
    { text: "Hey I'm Doo. Try me", sender: "ai" },
  ]);
  const [context, setContext] = useState<DooContext>({ lastMessages: [], messageCount: 0 });

  // to update the memory and save it to localStorage
  const applyMemory = (next: DooMemory) => {
    memoryRef.current = next;
    void saveMemory(next);
  };

  // to speak text out loud using the browser's speech synthesis API
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
    
    const stopTalking = () => {     // when speech ends or errors stop talking
      if (currentUtteranceRef.current === utterance) setIsTalking(false);
    };
    utterance.onstart = () => setIsTalking(true);
    utterance.onend = stopTalking;
    utterance.onerror = stopTalking;
    window.speechSynthesis.speak(utterance);
  };

  const handleClearChat = () => {
    window.speechSynthesis.cancel();  // stop any speech
    setIsTalking(false);
    setEmotion("neutral");

    const name = memoryRef.current.userName;
    setMessages([
      { text: name ? `Fresh start, ${name}. What's up?` : "Fresh start. What's up?", sender: "ai" },
    ]);
    setContext({ lastMessages: [], messageCount: 0 });

    // wipe the saved conversation but it keeps the name and learned facts
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
        // Only greet once per app launch
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

  // When a reminder comes due it shows it in the chat say it out loud then save it to history
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

  }, [reminderQueue, memoryReady]);

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

    // to handle a reminder request
    const reminderReply = await handleReminderRequest(userText);
    const result: { response: string; emotion: Emotion } = reminderReply
      ? { response: reminderReply, emotion: "playful" }
      : await generateDooReply(userText, nextContext, before.history, before.facts);

    setMessages((prev) => [...prev, { text: result.response, sender: "ai" }]);
    setContext(nextContext);
    setEmotion(result.emotion);
    setIsTyping(false);

    speak(result.response);

    // Save the new exchange right away 
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

    // Learn lasting facts in the background so replies aren't slowed down
    void extractFacts(userText, memoryRef.current.facts).then((newFacts) => {
      if (!newFacts) return;
      console.info("Doo facts updated:", newFacts);
      applyMemory({ ...memoryRef.current, facts: newFacts });
    });
  };

  const handleRecordingComplete = async (blob: Blob) => {
    setIsTranscribing(true);
    const text = await transcribeAudio(blob);
    setIsTranscribing(false);
    if (text) {
      void handleSend(text);
    }
  };

  const { isRecording, toggleRecording } = useVoiceRecorder(handleRecordingComplete);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping, isRecording, isTranscribing]);

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

      <div className="input-container">
        <button
          type="button"
          onClick={toggleRecording}
          className={`mic-button ${isRecording ? "recording" : ""}`}
          title={isRecording ? "Stop recording" : "Record a message"}
          aria-label={isRecording ? "Stop recording" : "Record a message"}
        >
          {isRecording ? <StopIcon /> : <MicIcon />}
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