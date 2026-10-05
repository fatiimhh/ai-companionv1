import { useState, useEffect, useRef } from "react";

import "./ChatBubble.css";

import ChatHeader from "./ChatHeader";
import Message from "./Message";

import { generateDooReply } from "../../logic/doo/personality";
import type { Emotion, DooContext } from "../../logic/doo/types";
import { loadMemory, saveMemory, extractName, type DooMemory } from "../../logic/doo/memory";
import type { ChatTurn } from "../../hooks/services/groqService";
import { transcribeAudio } from "../../hooks/services/groqAudioService";
import { useVoiceRecorder } from "../../hooks/useVoiceRecorder";

type MessageType = {
  text: string;
  sender: "user" | "ai";
};

type ChatBubbleProps = {
  emotion: Emotion;
  setEmotion: React.Dispatch<React.SetStateAction<Emotion>>;
  setIsTalking: React.Dispatch<React.SetStateAction<boolean>>;
};

const FRESH_MEMORY: DooMemory = { userName: null, history: [] };

function ChatBubble({ emotion, setEmotion, setIsTalking }: ChatBubbleProps) {
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [memoryReady, setMemoryReady] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const [memory, setMemory] = useState<DooMemory>(FRESH_MEMORY);
  const [messages, setMessages] = useState<MessageType[]>([
    { text: "Hey I'm Doo. Try me", sender: "ai" },
  ]);
  const [context, setContext] = useState<DooContext>({ lastMessages: [], messageCount: 0 });

  useEffect(() => {
    let cancelled = false;
    loadMemory().then((loaded) => {
      if (cancelled) return;
      setMemory(loaded);
      setContext({
        lastMessages: loaded.history.map((h) => h.content),
        messageCount: loaded.history.length,
      });
      if (loaded.userName) {
        setMessages([{ text: `Hey ${loaded.userName}, I'm back. Miss me?`, sender: "ai" }]);
      }
      setMemoryReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  const handleSend = async (overrideText?: string) => {
    const userText = overrideText ?? input;
    if (!userText.trim() || !memoryReady) return;

    setMessages((prev) => [...prev, { text: userText, sender: "user" }]);
    if (!overrideText) setInput("");
    setIsTyping(true);

    const detectedName = extractName(userText);
    const nextUserName = memory.userName ?? detectedName;

    const nextContext: DooContext = {
      lastMessages: [...context.lastMessages, userText],
      messageCount: context.messageCount + 1,
    };

    const historyForLLM: ChatTurn[] = memory.history;
    const result = await generateDooReply(userText, nextContext, historyForLLM);

    setMessages((prev) => [...prev, { text: result.response, sender: "ai" }]);
    setContext(nextContext);
    setEmotion(result.emotion);
    setIsTyping(false);

    // Speak the reply aloud, and sync the mouth animation to actual speech
    
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(result.response);
    utterance.rate = 1.05;
    utterance.pitch = 1.1;
    utterance.onstart = () => setIsTalking(true);
    utterance.onend = () => setIsTalking(false);
    utterance.onerror = () => setIsTalking(false);
    window.speechSynthesis.speak(utterance);

    const updatedHistory: ChatTurn[] = [
      ...memory.history,
      { role: "user", content: userText },
      { role: "assistant", content: result.response },
    ];
    const updatedMemory: DooMemory = { userName: nextUserName, history: updatedHistory };
    setMemory(updatedMemory);
    void saveMemory(updatedMemory);
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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleSend();
  };

  return (
    <div className="chat-bubble">
      <ChatHeader mood={emotion} />

      <div className="messages-container">
        {messages.map((msg, i) => (
          <Message key={i} text={msg.text} sender={msg.sender} />
        ))}

        {isTyping && (
          <div className="typing">
            Doo is thinking <span className="dots">...</span>
          </div>
        )}

        {isTranscribing && <div className="typing">Listening...</div>}

        <div ref={messagesEndRef} />
      </div>

      <div className="input-container">
        <button
          type="button"
          onClick={toggleRecording}
          className={`mic-button ${isRecording ? "recording" : ""}`}
          title={isRecording ? "Stop recording" : "Record a message"}
        >
          {isRecording ? "⏹" : "🎤"}
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