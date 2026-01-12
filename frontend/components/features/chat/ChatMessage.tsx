interface Message {
  role: "user" | "assistant" | string;
  content: string;
}

interface ChatMessageProps {
  messages: Message[];
}

export function ChatMessage({ messages }: ChatMessageProps) {
    return (
        <div className="flex-1 flex flex-col overflow-y-auto gap-4">
            {messages.map((msg, index) => (
                <div
                    key={index}
                    className={`p-3 rounded-lg max-w-[90%] ${
                        msg.role === "user"
                            ? "bg-slate-100 text-slate-800 self-end"
                            : "bg-white text-slate-800 self-start"
                    }`}
                >
                    <span>{msg.content}</span>
                </div>
            ))}
        </div>
    );
}


