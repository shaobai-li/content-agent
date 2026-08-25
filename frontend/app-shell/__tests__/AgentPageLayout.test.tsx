import { describe, expect, it, vi, beforeEach, type ComponentProps } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { AgentPageLayout } from "../AgentPageLayout";
import { SidebarContext } from "../SidebarContext";

const CHAT_WIDTH_KEY = "omniage.chatWidth";

type LayoutProps = ComponentProps<typeof AgentPageLayout>;

function renderLayout(props: Partial<LayoutProps> = {}) {
  return render(
    <SidebarContext.Provider
      value={{ sidebarOpen: false, toggleSidebar: vi.fn(), closeSidebar: vi.fn() }}
    >
      <AgentPageLayout
        agentId="admin"
        leftBody={<div>模块面板</div>}
        rightBody={<div>聊天面板</div>}
        autoExpand={true}
        leftParam="history"
        {...props}
      />
    </SidebarContext.Provider>,
  );
}

function getGrid(container: HTMLElement): HTMLElement {
  const grid = container.querySelector(".grid");
  if (!grid) throw new Error("grid not found");
  return grid as HTMLElement;
}

describe("AgentPageLayout", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("展开态渲染分隔条，网格为三列且 Chat 宽默认 400px", () => {
    const { container } = renderLayout();
    expect(screen.getByRole("separator", { name: "调整面板宽度" })).toBeTruthy();
    expect(getGrid(container).style.gridTemplateColumns).toBe(
      "minmax(0, 1fr) 0 minmax(0, 400px)",
    );
  });

  it("收起态不渲染分隔条，网格回退 0fr 0 minmax(0, 1fr)", () => {
    const { container } = renderLayout({ autoExpand: false });
    expect(screen.queryByRole("separator")).toBeNull();
    expect(getGrid(container).style.gridTemplateColumns).toBe(
      "0fr 0 minmax(0, 1fr)",
    );
  });

  it("读取 localStorage 预置宽度", () => {
    localStorage.setItem(CHAT_WIDTH_KEY, "700");
    const { container } = renderLayout();
    expect(getGrid(container).style.gridTemplateColumns).toBe(
      "minmax(0, 1fr) 0 minmax(0, 700px)",
    );
  });

  it("加载超上限的历史值会被 clamp 到 MAX_CHAT_WIDTH", () => {
    localStorage.setItem(CHAT_WIDTH_KEY, "9999");
    const { container } = renderLayout();
    expect(getGrid(container).style.gridTemplateColumns).toBe(
      "minmax(0, 1fr) 0 minmax(0, 1200px)",
    );
  });

  it("拖动结束后持久化取整后的宽度", () => {
    const { container } = renderLayout();
    const separator = screen.getByRole("separator");
    const grid = getGrid(container);

    // jsdom 无真实布局，mock 容器宽度 1000px
    vi.spyOn(grid, "getBoundingClientRect").mockReturnValue({
      left: 0,
      right: 1000,
      top: 0,
      bottom: 100,
      width: 1000,
      height: 100,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);
    // jsdom 未实现 setPointerCapture
    separator.setPointerCapture = vi.fn();

    fireEvent.pointerDown(separator, { pointerId: 1, clientX: 600 });
    // 右侧宽 = 1000 - 550.7 = 449.3 → 取整 449
    fireEvent.pointerMove(separator, { pointerId: 1, clientX: 550.7 });
    fireEvent.pointerUp(separator, { pointerId: 1 });

    expect(localStorage.getItem(CHAT_WIDTH_KEY)).toBe("449");
  });
});
