import { SYSTEM_PROMPT_SCHEMA } from "./systemPromptSchema";

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

/** 按最新 schema 拼接完整 SYSTEM.md：可编辑字段按 schema 生成，其余字段（passthroughLines）原样透传。 */
export function buildSystemPrompt(input: ParsedSystemPrompt): string {
  const schemaLines: string[] = [];
  let hasNonEmptyField = false;
  for (const field of SYSTEM_PROMPT_SCHEMA) {
    const value = input[field.key as "title" | "description"] ?? field.defaultValue;
    if (field.omitWhenEmpty && value === "") continue; // description 空串省略
    if (value !== "") hasNonEmptyField = true;
    schemaLines.push(`${field.key}: ${value}`);
  }
  const frontmatterLines = [...schemaLines, ...input.passthroughLines];

  // 原无 frontmatter 且无可编辑非空字段 → 不凭空生成 frontmatter，返回纯正文
  if (input.passthroughLines.length === 0 && !hasNonEmptyField) return input.body;

  // 原 frontmatter 分离出的 body 自带前导换行，直接接在 --- 后无损；纯正文无前导换行则补分隔空行
  const separator = input.body.startsWith("\n") ? "" : "\n\n";
  return `---\n${frontmatterLines.join("\n")}\n---${separator}${input.body}`;
}
