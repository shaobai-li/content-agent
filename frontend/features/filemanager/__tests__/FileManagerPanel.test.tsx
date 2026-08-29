import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import zhCN from "../../../locales/zh-CN/translation.json";
import { FileManagerPanel } from "../FileManagerPanel";

/** mock i18n：t 从真实 zh-CN locale 读取（同 SettingsPanel.test.tsx 模式） */
function resolveLocalePath(obj: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, p) => {
    if (acc && typeof acc === "object") return (acc as Record<string, unknown>)[p];
    return undefined;
  }, obj);
}

vi.mock("react-i18next", () => {
  const t = (key: string) => {
    const value = resolveLocalePath(zhCN, key);
    return typeof value === "string" ? value : key;
  };
  return { useTranslation: () => ({ t }) };
});

const { fetchFileTreeMock } = vi.hoisted(() => ({ fetchFileTreeMock: vi.fn() }));
vi.mock("@/shared/api/files", () => ({
  fetchFileTree: fetchFileTreeMock,
}));

describe("FileManagerPanel", () => {
  it("渲染目录树与预览区不崩溃（回归：TreeRootDrop 缺失 useDroppable import）", async () => {
    fetchFileTreeMock.mockResolvedValue({
      id: "root",
      name: "std",
      type: "folder",
      path: "",
      children: [
        {
          id: "SYSTEM.md",
          name: "SYSTEM.md",
          type: "file",
          path: "SYSTEM.md",
          size: 10,
          modifiedAt: "2026-01-01T00:00:00",
        },
        { id: "docs", name: "docs", type: "folder", path: "docs", children: [] },
      ],
    });

    render(<FileManagerPanel agentId="std" />);

    // 文件管理标题区搜索框出现
    expect(await screen.findByPlaceholderText("搜索文件")).toBeTruthy();
    // 树节点渲染（真实树加载后）
    expect(screen.getByText("SYSTEM.md")).toBeTruthy();
    expect(screen.getByText("docs")).toBeTruthy();
    // 预览区未选中提示
    expect(screen.getByText("请选择文件或文件夹")).toBeTruthy();
  });
});
