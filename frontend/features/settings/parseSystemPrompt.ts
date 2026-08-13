import { SYSTEM_PROMPT_SCHEMA, type SystemPromptField } from "./systemPromptSchema";

export interface ParsedSystemPrompt {
  title: string;
  description: string;
  /** frontmatter 之后的部分（正文），原样保留含前导空行 */
  body: string;
  /** 原始 frontmatter 全部原始行（含 title/description 行），序列化时原位替换、保持顺序 */
  frontmatterLines: string[];
}

/** 从 SYSTEM.md 完整文本中轻量解析 frontmatter（不依赖 YAML 库）：提取 title/description 值，保留全部原始行，正文单独返回。 */
export function parseSystemPrompt(content: string): ParsedSystemPrompt {
  const empty: ParsedSystemPrompt = {
    title: "",
    description: "",
    body: content,
    frontmatterLines: [],
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
    frontmatterLines: [],
  };

  // parts[1] 首尾各含一个由定界符产生的换行，剥掉后得到干净的 frontmatter 行
  const frontmatter = parts[1].replace(/^\n/, "").replace(/\n$/, "");
  if (frontmatter === "") return parsed;

  for (const line of frontmatter.split("\n")) {
    const t = line.match(/^title:\s*(.*)$/);
    if (t && !parsed.title) parsed.title = strip(t[1]);
    const d = line.match(/^description:\s*(.*)$/);
    if (d && !parsed.description) parsed.description = strip(d[1]);
    parsed.frontmatterLines.push(line);
  }
  return parsed;
}

/** 值含 YAML 特殊字符或首尾空白时加双引号保护，避免剥引号后破坏 frontmatter 结构（如值含半角冒号）。 */
function yamlSafe(value: string): string {
  if (value === "") return value;
  if (/[:#\[\]{},&*!|>'"%@`]/.test(value) || value !== value.trim()) {
    return JSON.stringify(value);
  }
  return value;
}

/** 按 schema 字段取当前值（避免类型断言，schema 扩展时在此补充映射）。 */
function schemaFieldValue(field: SystemPromptField, input: ParsedSystemPrompt): string {
  switch (field.key) {
    case "title":
      return input.title;
    case "description":
      return input.description;
    default:
      return field.defaultValue;
  }
}

/** 按最新 schema 拼接完整 SYSTEM.md：schema 字段在原始行上原位替换/删除，其余行原样透传，缺失字段按默认值补全。 */
export function buildSystemPrompt(input: ParsedSystemPrompt): string {
  const seen = new Set<string>();
  const lines: string[] = [];

  // 遍历原始 frontmatter 行：schema 字段行原位替换（空且 omitWhenEmpty 则删除），其余行保持原位置
  for (const line of input.frontmatterLines) {
    const m = line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*.*$/);
    if (m) {
      const field = SYSTEM_PROMPT_SCHEMA.find((f) => f.key === m[1]);
      if (field) {
        seen.add(field.key);
        const value = schemaFieldValue(field, input);
        if (field.omitWhenEmpty && value === "") continue;
        lines.push(`${field.key}: ${yamlSafe(value)}`);
        continue;
      }
    }
    lines.push(line);
  }

  // 缺失的 schema 字段按默认值补全：title 置顶，其余紧跟 title 之后
  for (const field of SYSTEM_PROMPT_SCHEMA) {
    if (seen.has(field.key)) continue;
    const value = schemaFieldValue(field, input);
    if (value === "") continue; // 空值不凭空追加
    const line = `${field.key}: ${yamlSafe(value)}`;
    if (field.key === "title") {
      lines.unshift(line);
    } else {
      const titleIdx = lines.findIndex((l) => l.startsWith("title:"));
      if (titleIdx >= 0) lines.splice(titleIdx + 1, 0, line);
      else lines.unshift(line);
    }
  }

  // 无任何可写 frontmatter → 纯正文
  if (lines.length === 0) return input.body;

  // body 自带前导换行（原 frontmatter 分离或用户保留空行）则直接接在 --- 后无损，否则补分隔空行
  const separator = input.body.startsWith("\n") ? "" : "\n\n";
  return `---\n${lines.join("\n")}\n---${separator}${input.body}`;
}
