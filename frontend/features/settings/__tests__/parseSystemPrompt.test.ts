import { describe, it, expect } from "vitest";
import { parseSystemPrompt } from "../parseSystemPrompt";

describe("parseSystemPrompt", () => {
  it("标准 SYSTEM.md（含 title/description）→ 正确解析", () => {
    const content = [
      "---",
      "title: 标准个人助手",
      "name: std",
      "description: 通用的标准助手",
      "skills: []",
      "---",
      "",
      "你是一个标准的智能体助手。",
    ].join("\n");

    expect(parseSystemPrompt(content)).toEqual({
      title: "标准个人助手",
      description: "通用的标准助手",
    });
  });

  it("只有 title 无 description → description 为空", () => {
    const content = ["---", "title: 标准个人助手", "name: std", "---", "", "正文"].join(
      "\n",
    );

    expect(parseSystemPrompt(content)).toEqual({
      title: "标准个人助手",
      description: "",
    });
  });

  it("无 frontmatter（纯正文）→ title/description 均为空", () => {
    expect(parseSystemPrompt("你是一个标准的智能体助手。")).toEqual({
      title: "",
      description: "",
    });
  });

  it("值带引号（title: \"标准助手\"）→ 去引号", () => {
    const content = [
      "---",
      'title: "标准助手"',
      "description: 助手",
      "---",
      "",
      "正文",
    ].join("\n");

    expect(parseSystemPrompt(content)).toEqual({
      title: "标准助手",
      description: "助手",
    });
  });

  it("description 含冒号（description: \"用途：写作\"）→ 取完整值", () => {
    const content = [
      "---",
      "title: 写作助手",
      'description: "用途：写作与总结"',
      "---",
      "",
      "正文",
    ].join("\n");

    expect(parseSystemPrompt(content)).toEqual({
      title: "写作助手",
      description: "用途：写作与总结",
    });
  });

  it("无内容或残缺 frontmatter → 空值", () => {
    expect(parseSystemPrompt("")).toEqual({ title: "", description: "" });
    expect(parseSystemPrompt("---\n---\n正文")).toEqual({
      title: "",
      description: "",
    });
  });
});
