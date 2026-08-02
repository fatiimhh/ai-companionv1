import { useState } from "react";
import Character3D from "./components/Character/Character3D";
import ChatBubble from "./components/ChatBubble/ChatBubble";
import type { Emotion } from "./logic/doo/types";

function App() {
  const [showBubble, setShowBubble] = useState(false);

  const [emotion, setEmotion] = useState<Emotion>("neutral");

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
        />
      )}

      <div onClick={handleCharacterClick}>
        <Character3D emotion={emotion} />
      </div>
    </div>
  );
}

export default App;