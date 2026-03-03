import { isFileMessage, type Message } from "@/entities/message/model";
import { FileMessageItem } from "./FileMessageItem";
interface ChatMessageProps {
  messages: Message[];
}

export function ChatMessage({ messages }: ChatMessageProps) {
    return (
        <div className="flex flex-col gap-4">
            {messages.map((msg) => {
                if (isFileMessage(msg)) {
                    return <FileMessageItem key={msg.id} message={msg} />;
                }
                return (
                    <div
                        key={msg.id}
                        className={`p-3 rounded-lg max-w-[90%] text-sm ${
                            msg.role === "user"
                                ? "bg-slate-100 text-slate-800 self-end"
                                : "bg-white text-slate-800 self-start"
                        }`}
                    >
                        <span>{msg.content}</span>
                    </div>
                );
            })}
        </div>
    );
}


