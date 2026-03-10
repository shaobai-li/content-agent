import {
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  type LexicalEditor,
} from "lexical";
import type { MentionItem } from "./MentionChip";
import { $createMentionNode } from "./MentionNode";

/**
 * Removes trailing @query before caret and inserts MentionNode. No-op if no @trigger.
 */
export function $insertMentionFromTrigger(editor: LexicalEditor, item: MentionItem): void {
  editor.update(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection) || !selection.isCollapsed()) return;

    const anchor = selection.anchor;
    const node = anchor.getNode();
    if (!$isTextNode(node)) return;

    const offset = anchor.offset;
    const text = node.getTextContent();
    const before = text.slice(0, offset);
    const match = before.match(/@\S*$/);
    if (!match) return;

    const start = offset - match[0].length;
    node.spliceText(start, match[0].length, "", true);

    const mention = $createMentionNode(item.id, item.label, item.parsed_path);
    const sel = $getSelection();
    if ($isRangeSelection(sel)) {
      sel.insertNodes([mention]);
    }
  });
}
