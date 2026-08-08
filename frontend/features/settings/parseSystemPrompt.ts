export interface SystemPromptMeta {
  title: string;
  description: string;
}

/** 从 SYSTEM.md 完整文本中轻量解析 frontmatter 的 title/description（不依赖 YAML 库）。 */
export function parseSystemPrompt(content: string): SystemPromptMeta {
  const meta: SystemPromptMeta = { title: "", description: "" };
  if (!content.startsWith("---")) return meta;

  const parts = content.split("---", 3);
  if (parts.length < 3) return meta;

  const strip = (raw: string) => {
    const trimmed = raw.trim();
    if (
      (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))
    ) {
      return trimmed.slice(1, -1);
    }
    return trimmed;
  };

  for (const line of parts[1].split("\n")) {
    const t = line.match(/^title:\s*(.*)$/);
    if (t && !meta.title) meta.title = strip(t[1]);
    const d = line.match(/^description:\s*(.*)$/);
    if (d && !meta.description) meta.description = strip(d[1]);
  }
  return meta;
}
