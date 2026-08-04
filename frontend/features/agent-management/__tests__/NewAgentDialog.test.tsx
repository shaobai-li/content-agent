import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NewAgentDialog } from "../NewAgentDialog";
import { createAgent } from "@/shared/api/management";

/** mock i18n：返回固定的中文译文，未命中的 key 原样返回 */
vi.mock("react-i18next", () => {
  const translations: Record<string, string> = {
    "agentManagement.newAgent": "新建智能体",
    "agentManagement.title": "标题",
    "agentManagement.titlePlaceholder": "输入智能体标题",
    "agentManagement.description": "描述",
    "agentManagement.descriptionPlaceholder": "描述这个智能体的用途",
    "agentManagement.create": "创建",
    "agentManagement.creating": "创建中...",
    "agentManagement.createFailed": "创建失败",
    "agentManagement.createFailedRetry": "创建失败，请稍后重试",
    "agentManagement.errors.nameRequired": "请输入智能体标题",
    "agentManagement.errors.nameTooLong": "智能体标题不能超过20个字符",
    "agentManagement.errors.descriptionTooLong": "智能体描述不能超过200个字符",
    "agentManagement.errors.notLoggedIn": "未登录用户无法创建智能体",
    "common.cancel": "取消",
  };
  return {
    useTranslation: () => ({
      t: (key: string) => translations[key] ?? key,
    }),
  };
});

vi.mock("@/shared/api/management", () => ({
  createAgent: vi.fn(),
}));

const mockedCreateAgent = vi.mocked(createAgent);

describe("NewAgentDialog i18n 与错误处理", () => {
  beforeEach(() => {
    mockedCreateAgent.mockReset();
  });

  function renderDialog() {
    const onCreated = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <NewAgentDialog
        open={true}
        onOpenChange={onOpenChange}
        onCreated={onCreated}
      />,
    );
    return { onCreated, onOpenChange };
  }

  function fillAndSubmit(title: string, description = "") {
    fireEvent.change(screen.getByLabelText("标题"), {
      target: { value: title },
    });
    if (description) {
      fireEvent.change(screen.getByLabelText("描述"), {
        target: { value: description },
      });
    }
    fireEvent.click(screen.getByRole("button", { name: "创建" }));
  }

  it("渲染本地化的标题、字段标签与按钮", () => {
    renderDialog();
    expect(screen.getByText("新建智能体")).toBeInTheDocument();
    expect(screen.getByLabelText("标题")).toBeInTheDocument();
    expect(screen.getByLabelText("描述")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "创建" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "取消" })).toBeInTheDocument();
  });

  it("标题与描述输入框显示字数统计并随输入更新", () => {
    renderDialog();
    expect(screen.getByText("0/20")).toBeInTheDocument();
    expect(screen.getByText("0/200")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("标题"), {
      target: { value: "测试智能体" },
    });
    fireEvent.change(screen.getByLabelText("描述"), {
      target: { value: "测试描述" },
    });

    expect(screen.getByText("5/20")).toBeInTheDocument();
    expect(screen.getByText("4/200")).toBeInTheDocument();
  });

  it("后端返回 error_code 时展示本地化错误消息", async () => {
    mockedCreateAgent.mockResolvedValue({
      ok: false,
      error: "智能体描述不能超过200个字符",
      error_code: "AGENT_DESCRIPTION_TOO_LONG",
    });
    renderDialog();
    fillAndSubmit("测试");
    expect(
      await screen.findByText("智能体描述不能超过200个字符"),
    ).toBeInTheDocument();
  });

  it("后端返回无 error_code 的错误时透传原始消息", async () => {
    mockedCreateAgent.mockResolvedValue({ ok: false, error: "unexpected" });
    renderDialog();
    fillAndSubmit("测试");
    expect(await screen.findByText("unexpected")).toBeInTheDocument();
  });

  it("后端返回空错误且无 error_code 时回退到通用创建失败文案", async () => {
    mockedCreateAgent.mockResolvedValue({ ok: false });
    renderDialog();
    fillAndSubmit("测试");
    expect(await screen.findByText("创建失败")).toBeInTheDocument();
  });

  it("创建成功后清空表单并调用 onCreated", async () => {
    mockedCreateAgent.mockResolvedValue({
      ok: true,
      agent: { id: "a_1234", name: "测试" },
    });
    const { onCreated } = renderDialog();
    fillAndSubmit("测试");
    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
  });
});
