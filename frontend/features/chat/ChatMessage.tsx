import { isFileMessage, type Message, type MessagePart } from "@/entities/message/model";
import { FileMessageItem } from "./FileMessageItem";
import { CollapsibleSection } from "./CollapsibleSection";

interface ChatMessageProps {
  messages: Message[];
}

function renderParts(parts: MessagePart[]) {
  return parts.map((part, i) => {
    if (part.type === "box") {
      return (
        <CollapsibleSection
          key={i}
          title={part.title}
          icon={part.icon}
          content={part.content}
          isStreaming={!part.complete}
        />
      );
    }
    if (part.type === "text" && part.content) {
      return (
        <div
          key={i}
          className="min-w-0 max-w-full whitespace-pre-wrap break-all"
        >
          {part.content}
        </div>
      );
    }
    return null;
  });
}

export function ChatMessage({ messages }: ChatMessageProps) {
  return (
    <div className="flex w-full min-w-0 max-w-full flex-col gap-4">
      {messages.map((msg) => {
        if (isFileMessage(msg)) {
          return <FileMessageItem key={msg.id} message={msg} />;
        }
        return (
          <div
            key={msg.id}
            className={`min-w-0 max-w-[90%] rounded-lg p-3 text-sm break-all ${
              msg.role === "user"
                ? "bg-slate-100 text-slate-800 self-end"
                : "bg-white text-slate-800 self-start"
            }`}
          >
            {msg.role === "assistant" && msg.parts
              ? renderParts(msg.parts)
              : msg.content && (
                  <div className="min-w-0 max-w-full whitespace-pre-wrap break-all">
                    {msg.content}
                  </div>
                )}
          </div>
        );
      })}
    </div>
  );
}
