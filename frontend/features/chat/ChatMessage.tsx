import { isFileMessage, type Message } from "@/entities/message/model";
import { FileMessageItem } from "./FileMessageItem";
import { CollapsibleSection } from "./CollapsibleSection";

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
                        {msg.role === "assistant" && (
                            <>
                                {(msg.thinking !== undefined || (msg.metadata && !msg.metadata.thinkingComplete)) && (
                                    <CollapsibleSection
                                        title="思考过程"
                                        content={msg.thinking || ""}
                                        isStreaming={msg.metadata && !msg.metadata.thinkingComplete}
                                        type="thinking"
                                    />
                                )}
                                {(msg.plan !== undefined || (msg.metadata && !msg.metadata.planComplete)) && (
                                    <CollapsibleSection
                                        title="执行计划"
                                        content={msg.plan || []}
                                        isStreaming={msg.metadata && !msg.metadata.planComplete}
                                        type="plan"
                                    />
                                )}
                            </>
                        )}
                        {msg.content && <span className="whitespace-pre-wrap">{msg.content}</span>}
                    </div>
                );
            })}
        </div>
    );
}


