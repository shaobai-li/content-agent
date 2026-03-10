"use client";

import {
  $applyNodeReplacement,
  DecoratorNode,
  type EditorConfig,
  type LexicalEditor,
  type LexicalNode,
  type NodeKey,
  type SerializedLexicalNode,
} from "lexical";
import type { ReactNode } from "react";

export type SerializedMentionNode = SerializedLexicalNode & {
  id: string;
  label: string;
  parsed_path?: string;
};

export class MentionNode extends DecoratorNode<ReactNode> {
  __id: string;
  __label: string;
  __parsed_path?: string;

  static getType(): string {
    return "mention";
  }

  static clone(node: MentionNode): MentionNode {
    return new MentionNode(
      node.__id,
      node.__label,
      node.__parsed_path,
      node.__key
    );
  }

  constructor(id: string, label: string, parsed_path?: string, key?: NodeKey) {
    super(key);
    this.__id = id;
    this.__label = label;
    this.__parsed_path = parsed_path;
  }

  createDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = "mention-node";
    span.setAttribute("data-mention-id", this.__id);
    return span;
  }

  updateDOM(): false {
    return false;
  }

  decorate(_editor: LexicalEditor, _config: EditorConfig): ReactNode {
    return (
      <span
        className="inline-block max-w-[120px] min-w-0 px-2 py-0.5 bg-primary/10 text-primary rounded text-[11px] font-medium truncate align-baseline"
        title={this.__label}
        contentEditable={false}
      >
        @{this.__label}
      </span>
    );
  }

  isInline(): boolean {
    return true;
  }

  exportJSON(): SerializedMentionNode {
    return {
      type: "mention",
      version: 1,
      id: this.__id,
      label: this.__label,
      ...(this.__parsed_path != null && { parsed_path: this.__parsed_path }),
    };
  }

  static importJSON(serialized: SerializedLexicalNode): MentionNode {
    const n = serialized as SerializedMentionNode;
    return $createMentionNode(n.id, n.label, n.parsed_path);
  }

  getId(): string {
    return this.__id;
  }

  getLabel(): string {
    return this.__label;
  }
}

export function $createMentionNode(
  id: string,
  label: string,
  parsed_path?: string
): MentionNode {
  return $applyNodeReplacement(new MentionNode(id, label, parsed_path));
}

export function $isMentionNode(
  node: LexicalNode | null | undefined
): node is MentionNode {
  return node instanceof MentionNode;
}
