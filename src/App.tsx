import { useState, useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import Character3D from "./components/Character/Character3D";
import ChatBubble from "./components/ChatBubble/ChatBubble";
import type { Emotion } from "./logic/doo/types";
import type { Reminder } from "./logic/doo/reminders";

function App() {
  const [showBubble, setShowBubble] = useState(false);
  const [emotion, setEmotion] = useState<Emotion>("neutral");
  const [isTalking, setIsTalking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [reminderQueue, setReminderQueue] = useState<Reminder[]>([]);
  const [pendingSummon, setPendingSummon] = useState(false);

  // Listen for events from the backend (Tauri) and update state accordingly
  useEffect(() => {

    if (!("__TAURI_INTERNALS__" in window)) return;

    let cancelled = false;
    const unlisteners: Array<() => void> = [];

    const register = async () => {
      try {
        const offReminder = await listen<Reminder>("reminder-due", (event) => {
          setReminderQueue((queue) => [...queue, event.payload]);
          setShowBubble(true);
        });
        const offSummon = await listen("summon", () => {
          setShowBubble(true);
          setPendingSummon(true);
        });

        if (cancelled) {
          offReminder();
          offSummon();
        } else {
          unlisteners.push(offReminder, offSummon);
        }
      } catch (err) {
        console.warn("Could not listen for Doo events:", err);
      }
    };
    void register();

    return () => {
      cancelled = true;
      unlisteners.forEach((off) => off());
    };
  }, []);

  const handleCharacterClick = () => {
    setShowBubble(!showBubble);
  };

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "flex-end",
        position: "relative",
        padding: "20px",
      }}
    >
      {showBubble && (
        <ChatBubble
          emotion={emotion}
          setEmotion={setEmotion}
          setIsTalking={setIsTalking}
          setIsListening={setIsListening}
          reminderQueue={reminderQueue}
          onReminderShown={(id) =>
            setReminderQueue((queue) => queue.filter((r) => r.id !== id))
          }
          pendingSummon={pendingSummon}
          onSummonHandled={() => setPendingSummon(false)}
        />
      )}

      <div onClick={handleCharacterClick}>
        <Character3D emotion={emotion} isTalking={isTalking} isListening={isListening} />
      </div>
    </div>
  );
}

export default App;