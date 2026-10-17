import { useState, useEffect } from "react";
import "./ChatHeader.css";
import type { Emotion } from "../../logic/doo/types";

type Props = {
  mood?: Emotion;
  onClear?: () => void;
  disabled?: boolean;
};

function TrashIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}

function ChatHeader({ mood = "neutral", onClear, disabled = false }: Props) {
  const [confirming, setConfirming] = useState(false);

  // to reset the confirming state after 3 seconds if the user doesn't click again
  useEffect(() => {
    if (!confirming) return;
    const timer = setTimeout(() => setConfirming(false), 3000);
    return () => clearTimeout(timer);
  }, [confirming]);

  const handleClick = () => {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setConfirming(false);
    onClear?.();
  };

  return (
    <div className="chat-header">
      <div className="title">Doo</div>
      <div className="header-right">
        <div className="status">● {mood}</div>
        {onClear && (
          <button
            type="button"
            className={`clear-button ${confirming ? "confirming" : ""}`}
            onClick={handleClick}
            disabled={disabled}
            title="Clear chat"
            aria-label="Clear chat"
          >
            {confirming ? "Clear?" : <TrashIcon />}
          </button>
        )}
      </div>
    </div>
  );
}

export default ChatHeader;