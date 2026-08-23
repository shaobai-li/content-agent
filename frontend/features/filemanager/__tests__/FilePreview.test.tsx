import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import zhCN from "../../../locales/zh-CN/translation.json";
import { FilePreview } from "../FilePreview";
import { MOCK_TREE } from "../mockData";
import { findNode } from "../fileTreeUtils";
import type { FileNode } from "../types";

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

/** mock 文件 API：fetchFileContent / updateFileContent 供编辑流程断言 */
const { fetchFileContentMock, updateFileContentMock } = vi.hoisted(() => ({
  fetchFileContentMock: vi.fn(async () => "# original"),
  updateFileContentMock: vi.fn(async () => {}),
}));

vi.mock("@/shared/api/files", () => ({
  fetchFileContent: fetchFileContentMock,
  updateFileContent: updateFileContentMock,
}));

/** 真实文本文件（有 path、扩展名在白名单）——用于编辑流程 */
const realTextFile: FileNode = {
  id: "SYSTEM.md",
  name: "SYSTEM.md",
  type: "file",
  path: "SYSTEM.md",
  size: 12,
  modifiedAt: "2026-08-01T09:00:00",
};

describe("FilePreview", () => {
  beforeEach(() => {
    fetchFileContentMock.mockResolvedValue("# original");
    updateFileContentMock.mockClear();
  });

  it("未选中时显示选择提示", () => {
    render(<FilePreview node={null} agentId="std" />);
    expect(screen.getByText(zhCN.filemanager.selectHint)).toBeTruthy();
  });

  it("文本文件渲染纯文本内容", () => {
    const node = findNode(MOCK_TREE, "docs-req")!;
    render(<FilePreview node={node} agentId="std" />);
    expect(screen.getAllByText(/需求说明/).length).toBeGreaterThan(0);
  });

  it("文件夹显示子项数量", () => {
    const node = findNode(MOCK_TREE, "docs")!;
    render(<FilePreview node={node} agentId="std" />);
    expect(screen.getByText(/3 项/)).toBeTruthy();
  });

  it("无内容文件显示无预览空态", () => {
    const node = findNode(MOCK_TREE, "assets-logo")!;
    render(<FilePreview node={node} agentId="std" />);
    expect(screen.getByText(zhCN.filemanager.noPreview)).toBeTruthy();
  });

  it("点击编辑进入编辑态，保存调用 updateFileContent 并退出编辑态", async () => {
    render(<FilePreview node={realTextFile} agentId="std" />);
    // 内容加载完成
    expect(await screen.findByText("# original")).toBeTruthy();

    fireEvent.click(screen.getByLabelText("编辑"));
    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "# edited" } });
    fireEvent.click(screen.getByText("保存"));

    expect(updateFileContentMock).toHaveBeenCalledWith("std", "SYSTEM.md", "# edited");
    await waitFor(() => expect(screen.queryByRole("textbox")).toBeNull());
  });

  it("取消编辑不调用保存并退出编辑态", async () => {
    render(<FilePreview node={realTextFile} agentId="std" />);
    await screen.findByText("# original");

    fireEvent.click(screen.getByLabelText("编辑"));
    fireEvent.click(screen.getByText("取消"));

    expect(updateFileContentMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("非文本文件编辑按钮置灰", () => {
    const image: FileNode = {
      id: "logo.png",
      name: "logo.png",
      type: "file",
      path: "logo.png",
    };
    render(<FilePreview node={image} agentId="std" />);
    const editBtn = screen.getByLabelText("编辑") as HTMLButtonElement;
    expect(editBtn.disabled).toBe(true);
  });
});
