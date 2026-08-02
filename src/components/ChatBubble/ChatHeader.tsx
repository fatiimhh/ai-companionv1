import "./ChatHeader.css";
import type { Emotion } from "../../logic/doo/types";

type Props = {
  mood?: Emotion;
};

function ChatHeader({ mood = "neutral" }: Props) {
  return (
    <div className="chat-header">
      <div className="title">Doo</div>
      <div className="status">● {mood}</div>
    </div>
  );
}

export default ChatHeader;
