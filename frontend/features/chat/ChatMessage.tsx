import { useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { Copy, Check } from "lucide-react";
import "highlight.js/styles/github.css";
import { isFileMessage, type Message, type MessagePart } from "@/entities/message/model";
import { FileMessageItem } from "./FileMessageItem";
import { CollapsibleSection } from "./CollapsibleSection";

interface ChatMessageProps {
  messages: Message[];
}

function extractTextContent(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (!node) return "";
  if (Array.isArray(node)) return node.map(extractTextContent).join("");
  if (typeof node === "object" && "props" in node)
    return extractTextContent((node as { props: { children: ReactNode } }).props.children);
  return "";
}

function CopyButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="absolute right-2 top-2 z-10 p-1 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
      title="复制代码"
    >
      {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
    </button>
  );
}

function renderParts(parts: MessagePart[]) {
  return parts.map((part, i) => {
    if (part.type === "trace") {
      return (
        <CollapsibleSection
          key={i}
          title={part.title}
          content={part.content}
          isStreaming={!part.complete}
        />
      );
    }
    if (part.type === "text" && part.content) {
      return (
        <div
          key={i}
          className="
            prose prose-sm max-w-none
            text-foreground
            pl-5

            prose-headings:text-foreground
            prose-headings:font-semibold
            prose-h1:text-2xl
            prose-h2:text-xl
            prose-h3:text-lg

            prose-p:leading-relaxed
            prose-p:my-3

            prose-a:text-foreground
            prose-a:no-underline hover:prose-a:underline

            prose-strong:text-foreground

            prose-code:rounded
            prose-code:px-1.5
            prose-code:py-0.5
            prose-code:text-sm
            prose-code:font-medium
            prose-code:text-foreground
            prose-code:before:content-none
            prose-code:after:content-none

            prose-pre:bg-muted
            prose-pre:text-foreground
            prose-pre:rounded-lg
            prose-pre:p-4
            prose-pre:overflow-x-auto

            prose-table:text-sm
            prose-th:font-semibold
            prose-th:text-foreground
            prose-td:text-muted-foreground

            prose-hr:border-border
          "
        >
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeHighlight]}
            components={{
              pre({ children }) {
                const codeText = extractTextContent(children);
                return (
                  <div className="relative group" style={{ width: '1px', minWidth: '100%', maxWidth: '100%', overflowX: 'auto' }}>
                    <pre className="[overflow:visible]">{children}</pre>
                    <CopyButton code={codeText} />
                  </div>
                );
              },
            }}
          >
            {part.content}
          </ReactMarkdown>
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
            {msg.role === "assistant"
              ? (msg.parts && msg.parts.length > 0) || msg.content
                ? renderParts(msg.parts ?? [{ type: "text", content: msg.content }])
                : (
                  <div className="prose prose-sm max-w-none text-foreground pl-5
                    prose-p:leading-relaxed prose-p:my-3
                  ">
                    <p
                      className="bg-gradient-to-r from-muted-foreground/40 via-foreground to-muted-foreground/40 bg-[length:200%_100%] bg-clip-text text-transparent animate-shimmer"
                    >
                      思考中⋯
                    </p>
                  </div>
                )
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
