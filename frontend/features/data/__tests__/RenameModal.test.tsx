import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { RenameModal } from "../RenameModal";

/** mock i18n：返回固定的中文译文，未命中的 key 原样返回，支持 {{var}} 插值 */
vi.mock("react-i18next", () => {
  const translations: Record<string, string> = {
    "data.renameDialog.title": "重命名",
    "data.renameDialog.namePlaceholder": "新名称",
    "data.renameDialog.confirm": "确定",
    "data.renameDialog.error.renameFailed": "重命名失败，请重试",
    "common.cancel": "取消",
  };
  return {
    useTranslation: () => ({
      t: (key: string, options?: Record<string, string>) => {
        let text = translations[key] ?? key;
        if (options) {
          for (const [k, v] of Object.entries(options)) {
            text = text.replaceAll(`{{${k}}}`, v);
          }
        }
        return text;
      },
    }),
  };
});

describe("RenameModal i18n 与错误处理", () => {
  function renderModal(onRename?: (record: unknown, name: string) => Promise<void>) {
    const onOpenChange = vi.fn();
    render(
      <RenameModal
        open={true}
        onOpenChange={onOpenChange}
        record={{ id: "db_1", name: "旧名称" }}
        onRename={onRename ?? vi.fn()}
      />,
    );
    return { onOpenChange };
  }

  function typeNewNameAndSubmit(name: string) {
    fireEvent.change(screen.getByPlaceholderText("新名称"), {
      target: { value: name },
    });
    fireEvent.click(screen.getByRole("button", { name: "确定" }));
  }

  it("渲染本地化的标题、占位符与按钮", () => {
    renderModal();
    expect(screen.getByText("重命名")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("新名称")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "取消" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "确定" })).toBeInTheDocument();
  });

  it("onRename 抛出 Error 时透传原始错误消息", async () => {
    const onRename = vi.fn().mockRejectedValue(new Error("名称已存在"));
    renderModal(onRename);
    typeNewNameAndSubmit("新名称");
    expect(await screen.findByText("名称已存在")).toBeInTheDocument();
  });

  it("onRename 抛出无消息错误时回退到本地化兜底文案", async () => {
    const onRename = vi.fn().mockRejectedValue(new Error(""));
    renderModal(onRename);
    typeNewNameAndSubmit("新名称");
    expect(await screen.findByText("重命名失败，请重试")).toBeInTheDocument();
  });

  it("重命名成功后关闭弹窗", async () => {
    const onRename = vi.fn().mockResolvedValue(undefined);
    const { onOpenChange } = renderModal(onRename);
    typeNewNameAndSubmit("新名称");
    expect(await screen.findByRole("button", { name: "确定" })).toBeInTheDocument();
    expect(onRename).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
