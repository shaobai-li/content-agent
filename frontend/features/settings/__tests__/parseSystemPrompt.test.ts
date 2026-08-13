import { describe, it, expect } from "vitest";
import { parseSystemPrompt, buildSystemPrompt } from "../parseSystemPrompt";

describe("parseSystemPrompt", () => {
  it("标准 SYSTEM.md（含 title/description）→ 正确解析 + 保留全部原始行 + 正文分离", () => {
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
      frontmatterLines: [
        "title: 标准个人助手",
        "name: std",
        "description: 通用的标准助手",
        "skills: []",
      ],
    });
  });

  it("layout 嵌套块 → 逐行原样保留（含缩进）", () => {
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
      frontmatterLines: [
        "title: 智能体管理员",
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

  it("只有 title 无 description → description 为空、其余行保留", () => {
    const content = ["---", "title: 标准个人助手", "name: std", "---", "", "正文"].join(
      "\n",
    );

    expect(parseSystemPrompt(content)).toEqual({
      title: "标准个人助手",
      description: "",
      body: "\n\n正文",
      frontmatterLines: ["title: 标准个人助手", "name: std"],
    });
  });

  it("无 frontmatter（纯正文）→ title/description 均为空、body 为全文", () => {
    expect(parseSystemPrompt("你是一个标准的智能体助手。")).toEqual({
      title: "",
      description: "",
      body: "你是一个标准的智能体助手。",
      frontmatterLines: [],
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
      frontmatterLines: ['title: "标准助手"', "description: 助手"],
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
      frontmatterLines: ["title: 写作助手", 'description: "用途：写作与总结"'],
    });
  });

  it("无内容或残缺 frontmatter → 空值、body 为剩余原文", () => {
    expect(parseSystemPrompt("")).toEqual({
      title: "",
      description: "",
      body: "",
      frontmatterLines: [],
    });
    expect(parseSystemPrompt("---\n---\n正文")).toEqual({
      title: "",
      description: "",
      body: "\n正文",
      frontmatterLines: [],
    });
  });
});

describe("buildSystemPrompt", () => {
  it("round-trip：改 title/description 后其他字段原样保留、顺序不变、body 不变", () => {
    const original = [
      "---",
      "title: 标准个人助手",
      "name: std",
      "description: 通用的标准助手",
      "skills: []",
      "layout:",
      "  left: [history]",
      "  defaultLeft: history",
      "---",
      "",
      "正文",
    ].join("\n");

    const parsed = parseSystemPrompt(original);
    const rebuilt = buildSystemPrompt({
      ...parsed,
      title: "新标题",
      description: "新描述",
    });

    expect(parseSystemPrompt(rebuilt)).toEqual({
      title: "新标题",
      description: "新描述",
      body: "\n\n正文",
      frontmatterLines: [
        "title: 新标题",
        "name: std",
        "description: 新描述",
        "skills: []",
        "layout:",
        "  left: [history]",
        "  defaultLeft: history",
      ],
    });
  });

  it("只改正文不改 title/description → 字段顺序保持原始（description 不挪前）", () => {
    const original = [
      "---",
      "title: A",
      "name: std",
      "description: B",
      "skills: []",
      "---",
      "",
      "正文",
    ].join("\n");

    const parsed = parseSystemPrompt(original);
    const rebuilt = buildSystemPrompt({ ...parsed, body: "新正文" });

    expect(rebuilt).toBe("---\ntitle: A\nname: std\ndescription: B\nskills: []\n---\n\n新正文");
  });

  it("description 为空串 → 拼接结果不含 description 行", () => {
    const parsed = parseSystemPrompt(
      ["---", "title: T", "name: std", "---", "", "正文"].join("\n"),
    );
    const rebuilt = buildSystemPrompt({ ...parsed, description: "" });

    expect(rebuilt).toBe("---\ntitle: T\nname: std\n---\n\n正文");
    expect(rebuilt).not.toContain("description:");
  });

  it("title 值含半角冒号 → 序列化加双引号保护，round-trip 值不变", () => {
    const parsed = parseSystemPrompt(
      ["---", 'title: "写作: 助手"', "---", "", "正文"].join("\n"),
    );
    const rebuilt = buildSystemPrompt({ ...parsed, title: "写作: 助手" });

    expect(rebuilt).toBe("---\ntitle: \"写作: 助手\"\n---\n\n正文");
    expect(parseSystemPrompt(rebuilt).title).toBe("写作: 助手");
  });

  it("无 frontmatter 且 title/description 为空 → 返回纯正文（不生成 ---）", () => {
    const parsed = parseSystemPrompt("你是一个标准的智能体助手。");
    expect(buildSystemPrompt(parsed)).toBe("你是一个标准的智能体助手。");
  });

  it("无 frontmatter 但 title 有值 → 生成 frontmatter", () => {
    const parsed = parseSystemPrompt("你是一个标准的智能体助手。");
    const rebuilt = buildSystemPrompt({ ...parsed, title: "新智能体" });

    expect(rebuilt).toBe("---\ntitle: 新智能体\n---\n\n你是一个标准的智能体助手。");
  });
});
