import { describe, it, expect } from "vitest";
import { parseSystemPrompt } from "../parseSystemPrompt";

describe("parseSystemPrompt", () => {
  it("标准 SYSTEM.md（含 title/description）→ 正确解析 + 透传其余行 + 正文分离", () => {
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
      body: "\n\n你是一个标准的智能体助手。",
      passthroughLines: ["name: std", "skills: []"],
    });
  });

  it("layout 嵌套块 → 逐行原样透传（含缩进）", () => {
    const content = [
      "---",
      "title: 智能体管理员",
      "name: admin",
      "skills: []",
      "layout:",
      "  left: [history]",
      "  defaultLeft: history",
      "  right: [chat]",
      "  defaultRight: chat",
      "---",
      "",
      "正文",
    ].join("\n");

    expect(parseSystemPrompt(content)).toEqual({
      title: "智能体管理员",
      description: "",
      body: "\n\n正文",
      passthroughLines: [
        "name: admin",
        "skills: []",
        "layout:",
        "  left: [history]",
        "  defaultLeft: history",
        "  right: [chat]",
        "  defaultRight: chat",
      ],
    });
  });

  it("只有 title 无 description → description 为空、其余行透传", () => {
    const content = ["---", "title: 标准个人助手", "name: std", "---", "", "正文"].join(
      "\n",
    );

    expect(parseSystemPrompt(content)).toEqual({
      title: "标准个人助手",
      description: "",
      body: "\n\n正文",
      passthroughLines: ["name: std"],
    });
  });

  it("无 frontmatter（纯正文）→ title/description 均为空、body 为全文", () => {
    expect(parseSystemPrompt("你是一个标准的智能体助手。")).toEqual({
      title: "",
      description: "",
      body: "你是一个标准的智能体助手。",
      passthroughLines: [],
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
      body: "\n\n正文",
      passthroughLines: [],
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
      body: "\n\n正文",
      passthroughLines: [],
    });
  });

  it("无内容或残缺 frontmatter → 空值、body 为剩余原文", () => {
    expect(parseSystemPrompt("")).toEqual({
      title: "",
      description: "",
      body: "",
      passthroughLines: [],
    });
    expect(parseSystemPrompt("---\n---\n正文")).toEqual({
      title: "",
      description: "",
      body: "\n正文",
      passthroughLines: [],
    });
  });
});
