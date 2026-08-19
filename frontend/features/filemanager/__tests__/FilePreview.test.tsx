import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import zhCN from "../../../locales/zh-CN/translation.json";
import { FilePreview } from "../FilePreview";
import { MOCK_TREE } from "../mockData";
import { findNode } from "../fileTreeUtils";

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

describe("FilePreview", () => {
  it("未选中时显示选择提示", () => {
    render(<FilePreview node={null} />);
    expect(screen.getByText(zhCN.filemanager.selectHint)).toBeTruthy();
  });

  it("文本文件渲染纯文本内容", () => {
    const node = findNode(MOCK_TREE, "docs-req")!;
    render(<FilePreview node={node} />);
    expect(screen.getAllByText(/需求说明/).length).toBeGreaterThan(0);
  });

  it("文件夹显示子项数量", () => {
    const node = findNode(MOCK_TREE, "docs")!;
    render(<FilePreview node={node} />);
    expect(screen.getByText(/3 项/)).toBeTruthy();
  });

  it("无内容文件显示无预览空态", () => {
    const node = findNode(MOCK_TREE, "assets-logo")!;
    render(<FilePreview node={node} />);
    expect(screen.getByText(zhCN.filemanager.noPreview)).toBeTruthy();
  });
});
