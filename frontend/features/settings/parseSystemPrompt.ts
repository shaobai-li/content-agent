export interface ParsedSystemPrompt {
  title: string;
  description: string;
  /** frontmatter 之后的部分（正文），原样保留含前导空行 */
  body: string;
  /** 原始 frontmatter 中非 schema 字段的原始行（含缩进），序列化时原样透传 */
  passthroughLines: string[];
}

/** 从 SYSTEM.md 完整文本中轻量解析 frontmatter（不依赖 YAML 库）：提取 title/description，透传其余行，正文单独返回。 */
export function parseSystemPrompt(content: string): ParsedSystemPrompt {
  const empty: ParsedSystemPrompt = {
    title: "",
    description: "",
    body: content,
    passthroughLines: [],
  };
  if (!content.startsWith("---")) return empty;

  const parts = content.split("---", 3);
  if (parts.length < 3) return empty;

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

  const parsed: ParsedSystemPrompt = {
    title: "",
    description: "",
    body: parts[2],
    passthroughLines: [],
  };

  // parts[1] 首尾各含一个由定界符产生的换行，剥掉后得到干净的 frontmatter 行
  const frontmatter = parts[1].replace(/^\n/, "").replace(/\n$/, "");
  if (frontmatter === "") return parsed;

  for (const line of frontmatter.split("\n")) {
    const t = line.match(/^title:\s*(.*)$/);
    if (t && !parsed.title) {
      parsed.title = strip(t[1]);
      continue;
    }
    const d = line.match(/^description:\s*(.*)$/);
    if (d && !parsed.description) {
      parsed.description = strip(d[1]);
      continue;
    }
    parsed.passthroughLines.push(line);
  }
  return parsed;
}
