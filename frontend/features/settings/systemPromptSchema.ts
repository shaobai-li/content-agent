export interface SystemPromptField {
  /** frontmatter 字段名 */
  key: string;
  /** 缺失时补全的默认值（可空） */
  defaultValue: string;
  /** 值为空串时省略该行（仅 description 开启） */
  omitWhenEmpty?: boolean;
}

/** SYSTEM.md frontmatter 可编辑字段的最新 schema，其余字段（name/skills/layout/locked 等）一律原样透传。 */
export const SYSTEM_PROMPT_SCHEMA: SystemPromptField[] = [
  { key: "title", defaultValue: "" },
  { key: "description", defaultValue: "", omitWhenEmpty: true },
];
