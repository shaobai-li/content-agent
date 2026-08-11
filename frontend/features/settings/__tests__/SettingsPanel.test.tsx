import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SettingsPanel } from "../SettingsPanel";

/** mock i18n：返回固定的中文译文，未命中的 key 原样返回 */
vi.mock("react-i18next", () => {
  const translations: Record<string, string> = {
    "agentManagement.title": "标题",
    "agentManagement.titlePlaceholder": "输入智能体标题",
    "agentManagement.description": "描述",
    "agentManagement.descriptionPlaceholder": "描述这个智能体的用途",
    "settingsPanel.prompts.save": "保存",
    "settingsPanel.prompts.cancel": "取消",
    "settingsPanel.skills.loading": "加载中...",
  };
  return {
    useTranslation: () => ({
      t: (key: string) => translations[key] ?? key,
    }),
  };
});

/** mock useSettingsApi：SYSTEM.md 含 title/description + 透传字段（name/skills/layout） */
const { saveMock } = vi.hoisted(() => ({ saveMock: vi.fn() }));

vi.mock("../useSettingsApi", () => ({
  usePrompts: () => ({
    files: {
      "SYSTEM.md":
        "---\ntitle: 标准助手\ndescription: 写作助手\nname: std\nskills: []\nlayout:\n  left: [history]\n  defaultLeft: history\n---\n\n正文内容",
      "SOUL.md": "",
      "USER.md": "",
      "IDENTITY.md": "",
    },
    loading: false,
    error: null,
    load: vi.fn(),
    save: saveMock,
  }),
  useSkills: () => ({
    skills: [],
    loading: false,
    error: null,
    toggleDisable: vi.fn(),
    upload: vi.fn(),
    remove: vi.fn(),
  }),
}));

/** mock McpServersPanel（capability tab 才用到） */
vi.mock("../McpServersPanel", () => ({
  McpServersPanel: () => <div>McpServersPanel</div>,
}));

describe("SettingsPanel SYSTEM tab title/description 输入框", () => {
  beforeEach(() => {
    saveMock.mockClear();
  });

  function renderSystemTab() {
    render(<SettingsPanel agentId="std" />);
    // SYSTEM tab 默认激活
    expect(screen.getByRole("tabpanel")).toBeInTheDocument();
  }

  it("渲染标题输入框、描述输入框与 SYSTEM 文本框", () => {
    renderSystemTab();
    expect(screen.getByLabelText("标题")).toBeInTheDocument();
    expect(screen.getByLabelText("描述")).toBeInTheDocument();
    expect(screen.getByLabelText("SYSTEM")).toBeInTheDocument();
  });

  it("title/description 初值来自 frontmatter 解析", () => {
    renderSystemTab();
    expect(screen.getByLabelText("标题")).toHaveValue("标准助手");
    expect(screen.getByLabelText("描述")).toHaveValue("写作助手");
  });

  it("title 输入框字数统计随输入更新", () => {
    renderSystemTab();
    expect(screen.getByText("4/20")).toBeInTheDocument(); // "标准助手" = 4 字

    fireEvent.change(screen.getByLabelText("标题"), {
      target: { value: "测试助手助手" },
    });

    expect(screen.getByText("6/20")).toBeInTheDocument(); // "测试助手助手" = 6 字

    fireEvent.change(screen.getByLabelText("标题"), {
      target: { value: "" },
    });

    expect(screen.getByText("0/20")).toBeInTheDocument();
  });

  it("SYSTEM 正文文本框只显示 frontmatter 之后的部分（不含 ---）", () => {
    renderSystemTab();
    expect(screen.getByLabelText("SYSTEM")).toHaveValue("\n\n正文内容");
  });

  it("只编辑 title → 保存按钮可用", () => {
    renderSystemTab();
    const saveButton = screen.getByRole("button", { name: "保存" });
    expect(saveButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText("标题"), {
      target: { value: "测试助手" },
    });

    expect(saveButton).not.toBeDisabled();
  });

  it("编辑 title + 正文 → 保存拼接完整 SYSTEM.md 写回（透传字段原样保留）", () => {
    renderSystemTab();

    fireEvent.change(screen.getByLabelText("标题"), {
      target: { value: "测试助手" },
    });
    fireEvent.change(screen.getByLabelText("SYSTEM"), {
      target: { value: "新正文" },
    });

    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(saveMock).toHaveBeenCalledTimes(1);
    expect(saveMock).toHaveBeenCalledWith(
      "SYSTEM.md",
      "---\ntitle: 测试助手\ndescription: 写作助手\nname: std\nskills: []\nlayout:\n  left: [history]\n  defaultLeft: history\n---\n\n新正文",
    );
  });

  it("取消重置：title/正文恢复 frontmatter 初值", () => {
    renderSystemTab();

    fireEvent.change(screen.getByLabelText("标题"), {
      target: { value: "临时标题" },
    });
    fireEvent.change(screen.getByLabelText("SYSTEM"), {
      target: { value: "临时正文" },
    });

    fireEvent.click(screen.getByRole("button", { name: "取消" }));

    expect(screen.getByLabelText("标题")).toHaveValue("标准助手");
    expect(screen.getByLabelText("SYSTEM")).toHaveValue("\n\n正文内容");
  });
});
