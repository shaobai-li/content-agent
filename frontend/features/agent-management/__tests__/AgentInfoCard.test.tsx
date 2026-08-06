import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactNode } from "react";
import { AgentInfoCard, type AgentInfoCardProps } from "../AgentInfoCard";
import { deleteAgent } from "@/shared/api/management";
import { toast } from "sonner";

/** mock i18n：返回固定的中文译文，未命中的 key 原样返回，支持 {{var}} 插值 */
vi.mock("react-i18next", () => {
  const translations: Record<string, string> = {
    "agentManagement.menu.hide": "隐藏",
    "agentManagement.menu.show": "显示",
    "agentManagement.menu.configure": "配置",
    "agentManagement.menu.delete": "删除",
    "agentManagement.deleteConfirm.title": "确认删除",
    "agentManagement.deleteConfirm.description":
      "确定要删除「{{name}}」吗？删除后智能体将从列表中移除，相关数据不会被清除。",
    "agentManagement.deleteConfirm.confirm": "删除",
    "agentManagement.deleting": "删除中...",
    "agentManagement.deleteFailed": "删除失败",
    "agentManagement.deleteFailedRetry": "删除失败，请稍后重试",
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

vi.mock("@/shared/api/management", () => ({
  deleteAgent: vi.fn(),
}));

vi.mock("@/entities/agent/visibility", () => ({
  hideAgent: vi.fn(),
  showAgent: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn() },
}));

/** 简化 DropdownMenu：直接渲染菜单项按钮，避免 Radix Dropdown 在 jsdom 下的交互差异 */
vi.mock("@/shared/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => <>{children}</>,
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({
    onClick,
    children,
  }: {
    onClick?: () => void;
    children: ReactNode;
  }) => <button onClick={onClick}>{children}</button>,
}));

const mockedDeleteAgent = vi.mocked(deleteAgent);
const mockedToastError = vi.mocked(toast.error);

describe("AgentInfoCard i18n 与删除流程", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function renderCard(overrides: Partial<AgentInfoCardProps> = {}) {
    const props: AgentInfoCardProps = {
      agentId: "a_1",
      name: "测试智能体",
      visible: true,
      model: "gpt-4",
      sessionCount: 3,
      lastReplyTime: null,
      lastSessionTitle: null,
      onDeleted: vi.fn(),
      ...overrides,
    };
    render(<AgentInfoCard {...props} />);
    return props;
  }

  it("渲染卡片信息与三点菜单本地化选项", () => {
    renderCard();
    expect(screen.getByText("测试智能体")).toBeInTheDocument();
    expect(screen.getByText("隐藏")).toBeInTheDocument();
    expect(screen.getByText("配置")).toBeInTheDocument();
    expect(screen.getByText("删除")).toBeInTheDocument();
  });

  it("不可见智能体的菜单显示 show 文案", () => {
    renderCard({ visible: false });
    expect(screen.getByText("显示")).toBeInTheDocument();
    expect(screen.queryByText("隐藏")).not.toBeInTheDocument();
  });

  it("锁定智能体不显示删除菜单项", () => {
    renderCard({ locked: true });
    expect(screen.getByText("配置")).toBeInTheDocument();
    expect(screen.queryByText("删除")).not.toBeInTheDocument();
  });

  it("删除确认弹窗展示本地化文案并插值智能体名称", () => {
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: "删除" }));
    const dialog = screen.getByRole("alertdialog");
    expect(within(dialog).getByText("确认删除")).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        "确定要删除「测试智能体」吗？删除后智能体将从列表中移除，相关数据不会被清除。",
      ),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "取消" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "删除" })).toBeInTheDocument();
  });

  it("删除失败时 toast 透传后端错误消息", async () => {
    mockedDeleteAgent.mockRejectedValue(new Error("后端错误"));
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: "删除" }));
    fireEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", { name: "删除" }),
    );
    await waitFor(() => expect(mockedToastError).toHaveBeenCalledWith("后端错误"));
  });

  it("删除失败且无错误消息时 toast 回退到本地化兜底文案", async () => {
    mockedDeleteAgent.mockRejectedValue(new Error(""));
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: "删除" }));
    fireEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", { name: "删除" }),
    );
    await waitFor(() =>
      expect(mockedToastError).toHaveBeenCalledWith("删除失败，请稍后重试"),
    );
  });

  it("删除成功后关闭弹窗并调用 onDeleted", async () => {
    mockedDeleteAgent.mockResolvedValue({ ok: true });
    const { onDeleted } = renderCard();
    fireEvent.click(screen.getByRole("button", { name: "删除" }));
    fireEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", { name: "删除" }),
    );
    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });
});
