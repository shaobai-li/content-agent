import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { KnowledgeBaseListPanel } from "../KnowledgeBaseListPanel";
import { deleteKnowledgeBase } from "@/shared/api/records";
import { useKnowledgeBases } from "../useKnowledgeBases";
import { toast } from "sonner";

/** mock i18n：返回固定的中文译文，未命中的 key 原样返回，支持 {{var}} 插值 */
vi.mock("react-i18next", () => {
  const translations: Record<string, string> = {
    "kb.loading": "正在加载数据库...",
    "kb.noKnowledgeBase": "暂无知识库",
    "kb.noResults": "未找到匹配的数据库",
    "kb.deleteFailed": "删除知识库失败",
    "kb.deleteFailedRetry": "删除知识库失败，请重试",
    "data.confirmDelete.title": "确认删除",
    "data.confirmDelete.description": `确定要删除 "{{name}}" 吗？`,
    "data.confirmDelete.confirm": "删除",
    "common.cancel": "取消",
    "common.prev": "上一页",
    "common.next": "下一页",
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

vi.mock("@/shared/api/records", () => ({
  fetchKnowledgeBases: vi.fn(),
  renameKnowledgeBase: vi.fn(),
  deleteKnowledgeBase: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn() },
}));

vi.mock("../useKnowledgeBases", () => ({
  useKnowledgeBases: vi.fn(),
}));

vi.mock("../useKnowledgeBaseSelection", () => ({
  useKnowledgeBaseSelection: () => ({
    databaseId: null,
    selectDatabase: vi.fn(),
    clearDatabase: vi.fn(),
  }),
}));

vi.mock("@/shared/lib/usePagination", () => ({
  usePagination: (items: unknown[]) => ({
    currentItems: items,
    canGoPrev: false,
    canGoNext: false,
    goPrev: vi.fn(),
    goNext: vi.fn(),
    resetPage: vi.fn(),
  }),
}));

/** 简化 HistoryItemMenu：直接用按钮暴露 onDelete / onRename，避免 Radix Dropdown 在 jsdom 下的交互差异 */
vi.mock("../../history/HistoryItemMenu", () => ({
  HistoryItemMenu: ({
    onDelete,
    onRename,
  }: {
    onDelete?: () => void;
    onRename?: () => void;
  }) => (
    <div>
      <button onClick={onDelete}>删除入口</button>
      <button onClick={onRename}>重命名入口</button>
    </div>
  ),
}));

vi.mock("../../history/HistoryFooter", () => ({
  HistoryFooter: () => <div />,
}));

const mockedDeleteKnowledgeBase = vi.mocked(deleteKnowledgeBase);
const mockUseKnowledgeBases = vi.mocked(useKnowledgeBases);
const mockedToastError = vi.mocked(toast.error);

const DATABASE_SEARCH_CHANGE_EVENT = "kb-database-search-change";

const TEST_DATABASES = [{ id: "db_1", name: "测试库", description: "测试描述" }];

describe("KnowledgeBaseListPanel i18n 与状态渲染", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseKnowledgeBases.mockReturnValue({
      databases: [],
      loading: true,
      refresh: vi.fn(),
    });
  });

  function renderPanel() {
    return render(<KnowledgeBaseListPanel agentId="agent_1" />);
  }

  it("加载态显示本地化 loading 文案", () => {
    renderPanel();
    expect(screen.getByText("正在加载数据库...")).toBeInTheDocument();
  });

  it("空态显示本地化 noKnowledgeBase 文案", () => {
    mockUseKnowledgeBases.mockReturnValue({
      databases: [],
      loading: false,
      refresh: vi.fn(),
    });
    renderPanel();
    expect(screen.getByText("暂无知识库")).toBeInTheDocument();
  });

  it("搜索无结果时显示本地化 noResults 文案", () => {
    mockUseKnowledgeBases.mockReturnValue({
      databases: TEST_DATABASES,
      loading: false,
      refresh: vi.fn(),
    });
    renderPanel();
    act(() => {
      window.dispatchEvent(
        new CustomEvent(DATABASE_SEARCH_CHANGE_EVENT, {
          detail: { keyword: "不存在的关键字" },
        }),
      );
    });
    expect(screen.getByText("未找到匹配的数据库")).toBeInTheDocument();
  });

  it("删除确认弹窗展示本地化文案并插值知识库名称", () => {
    mockUseKnowledgeBases.mockReturnValue({
      databases: TEST_DATABASES,
      loading: false,
      refresh: vi.fn(),
    });
    renderPanel();
    fireEvent.click(screen.getByText("删除入口"));
    expect(screen.getByText("确认删除")).toBeInTheDocument();
    expect(screen.getByText(`确定要删除 "测试库" 吗？`)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "取消" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "删除" })).toBeInTheDocument();
  });

  it("删除失败时 toast 透传后端错误消息", async () => {
    mockUseKnowledgeBases.mockReturnValue({
      databases: TEST_DATABASES,
      loading: false,
      refresh: vi.fn(),
    });
    mockedDeleteKnowledgeBase.mockRejectedValue(new Error("数据库被占用"));
    renderPanel();
    fireEvent.click(screen.getByText("删除入口"));
    fireEvent.click(screen.getByRole("button", { name: "删除" }));
    await waitFor(() => expect(mockedToastError).toHaveBeenCalledWith("数据库被占用"));
  });

  it("删除失败且无错误消息时 toast 回退到本地化兜底文案", async () => {
    mockUseKnowledgeBases.mockReturnValue({
      databases: TEST_DATABASES,
      loading: false,
      refresh: vi.fn(),
    });
    mockedDeleteKnowledgeBase.mockRejectedValue(new Error(""));
    renderPanel();
    fireEvent.click(screen.getByText("删除入口"));
    fireEvent.click(screen.getByRole("button", { name: "删除" }));
    await waitFor(() =>
      expect(mockedToastError).toHaveBeenCalledWith("删除知识库失败，请重试"),
    );
  });
});
