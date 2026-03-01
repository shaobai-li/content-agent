import type { Message } from "@/entities/message/model";

interface ChatMessageProps {
  messages: Message[];
}

export function ChatMessage({ messages }: ChatMessageProps) {
    return (
        <div className="flex flex-col gap-4">
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


