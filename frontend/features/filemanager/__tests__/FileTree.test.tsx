import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import zhCN from "../../../locales/zh-CN/translation.json";
import { FileTree } from "../FileTree";
import { MOCK_TREE } from "../mockData";

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

const root = MOCK_TREE;

describe("FileTree", () => {
  it("渲染根目录名", () => {
    render(
      <FileTree
        nodes={[root]}
        expandedIds={new Set()}
        onToggleFolder={() => {}}
        selectedId={null}
        onSelect={() => {}}
      />,
    );
    expect(screen.getByText("工作区")).toBeTruthy();
  });

  it("展开后显示子目录与文件", () => {
    render(
      <FileTree
        nodes={[root]}
        expandedIds={new Set(["root", "docs"])}
        onToggleFolder={() => {}}
        selectedId={null}
        onSelect={() => {}}
      />,
    );
    expect(screen.getByText("项目文档")).toBeTruthy();
    expect(screen.getByText("需求说明.md")).toBeTruthy();
  });

  it("点击文件触发 onSelect", () => {
    const onSelect = vi.fn();
    render(
      <FileTree
        nodes={[root]}
        expandedIds={new Set(["root", "docs"])}
        onToggleFolder={() => {}}
        selectedId={null}
        onSelect={onSelect}
      />,
    );
    fireEvent.click(screen.getByText("需求说明.md"));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: "docs-req" }));
  });

  it("点击文件夹同时触发 onToggleFolder 与 onSelect", () => {
    const onToggle = vi.fn();
    const onSelect = vi.fn();
    render(
      <FileTree
        nodes={[root]}
        expandedIds={new Set(["root"])}
        onToggleFolder={onToggle}
        selectedId={null}
        onSelect={onSelect}
      />,
    );
    fireEvent.click(screen.getByText("项目文档"));
    expect(onToggle).toHaveBeenCalledWith("docs");
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: "docs" }));
  });
});
