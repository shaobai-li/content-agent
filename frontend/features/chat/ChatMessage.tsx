import { isFileMessage, type Message, type MessagePart } from "@/entities/message/model";
import { FileMessageItem } from "./FileMessageItem";
import { CollapsibleSection } from "./CollapsibleSection";

interface ChatMessageProps {
  messages: Message[];
}

function renderParts(parts: MessagePart[]) {
  const planCount = parts.filter((p) => p.type === "plan").length;
  let planIndex = 0;

  return parts.map((part, i) => {
    if (part.type === "thinking") {
      return (
        <CollapsibleSection
          key={i}
          title="思考过程"
          content={part.content}
          isStreaming={!part.complete}
          type="thinking"
        />
      );
    }
    if (part.type === "plan") {
      planIndex += 1;
      return (
        <CollapsibleSection
          key={i}
          title={planCount > 1 ? `执行计划 ${planIndex}` : "执行计划"}
          content={part.steps}
          isStreaming={!part.complete}
          type="plan"
        />
      );
    }
    if (part.type === "text" && part.content) {
      return <span key={i} className="whitespace-pre-wrap">{part.content}</span>;
    }
    return null;
  });
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
                        {msg.role === "assistant" && msg.parts
                            ? renderParts(msg.parts)
                            : msg.content && <span className="whitespace-pre-wrap">{msg.content}</span>
                        }
                    </div>
                );
            })}
        </div>
    );
}


