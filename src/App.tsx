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
  const [reminderQueue, setReminderQueue] = useState<Reminder[]>([]);


// Listen for reminders from the Rust backend and add them to the queue
  useEffect(() => {
    
    if (!("__TAURI_INTERNALS__" in window)) return; // only listen for reminders if running in Tauri

    let cancelled = false;
    let unlisten: (() => void) | undefined;

    listen<Reminder>("reminder-due", (event) => {
      setReminderQueue((queue) => [...queue, event.payload]);
      setShowBubble(true);
    })
      .then((fn) => {
        if (cancelled) fn();
        else unlisten = fn;
      })
      .catch((err) => console.warn("Could not listen for reminders:", err));

    return () => {
      cancelled = true;
      unlisten?.();
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
          reminderQueue={reminderQueue}
          onReminderShown={(id) =>
            setReminderQueue((queue) => queue.filter((r) => r.id !== id))
          }
        />
      )}

      <div onClick={handleCharacterClick}>
        <Character3D emotion={emotion} isTalking={isTalking} />
      </div>
    </div>
  );
}

export default App;