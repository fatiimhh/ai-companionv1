type MessageProps = {
  text: string;
  sender: "user" | "ai";
};

function Message({ text, sender }: MessageProps) {
  return (
    <div className={`message ${sender}`} dir="auto">
      {text}
    </div>
  );
}

export default Message;