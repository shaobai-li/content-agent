import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Splitter, resolvePanelWidth } from "../splitter";

/** 模拟父容器的 getBoundingClientRect，left=0、right=1000（宽度 1000px） */
function mockContainerRect(el: HTMLElement, right = 1000) {
  vi.spyOn(el, "getBoundingClientRect").mockReturnValue({
    left: 0,
    right,
    top: 0,
    bottom: 100,
    width: right,
    height: 100,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect);
}

describe("resolvePanelWidth", () => {
  it("低于右侧最小宽度时 clamp 到 rightMin", () => {
    expect(resolvePanelWidth(100, 1000)).toBe(320);
  });

  it("正常宽度原样返回", () => {
    expect(resolvePanelWidth(500, 1000)).toBe(500);
  });

  it("不超过「容器宽 - 左侧最小宽度」", () => {
    expect(resolvePanelWidth(900, 1000)).toBe(1000 - 280);
  });

  it("窄容器退化：右侧最小宽度不被左侧最小挤没", () => {
    // max = max(320, 300-280=20) = 320
    expect(resolvePanelWidth(200, 300)).toBe(320);
  });
});

describe("Splitter", () => {
  it("默认隐藏指示线（悬停/拖动时才显示）", () => {
    render(<Splitter value={400} onChange={() => {}} />);
    const separator = screen.getByRole("separator");
    expect(separator.getAttribute("aria-orientation")).toBe("vertical");
    const line = separator.firstElementChild as HTMLElement;
    expect(line.className).toContain("opacity-0");
    expect(line.className).toContain("group-hover:opacity-100");
  });

  it("pointer 拖动按容器右边缘计算宽度并 clamp", () => {
    const onChange = vi.fn();
    const onDraggingChange = vi.fn();
    render(
      <Splitter
        value={400}
        onChange={onChange}
        onDraggingChange={onDraggingChange}
      />,
    );
    const separator = screen.getByRole("separator");
    mockContainerRect(separator.parentElement as HTMLElement);

    // jsdom 未实现 setPointerCapture
    separator.setPointerCapture = vi.fn();

    fireEvent.pointerDown(separator, { pointerId: 1, clientX: 600 });
    expect(onDraggingChange).toHaveBeenLastCalledWith(true);

    // 右侧宽 = 1000 - 550 = 450
    fireEvent.pointerMove(separator, { pointerId: 1, clientX: 550 });
    expect(onChange).toHaveBeenLastCalledWith(450);

    // 右侧宽 = 1000 - 150 = 850 → clamp 到 1000 - 280 = 720
    fireEvent.pointerMove(separator, { pointerId: 1, clientX: 150 });
    expect(onChange).toHaveBeenLastCalledWith(720);

    fireEvent.pointerUp(separator, { pointerId: 1 });
    expect(onDraggingChange).toHaveBeenLastCalledWith(false);
  });

  it("方向键微调宽度（shift 加速）", () => {
    const onChange = vi.fn();
    render(<Splitter value={400} onChange={onChange} />);
    const separator = screen.getByRole("separator");
    mockContainerRect(separator.parentElement as HTMLElement);

    fireEvent.keyDown(separator, { key: "ArrowRight" });
    expect(onChange).toHaveBeenLastCalledWith(416);

    fireEvent.keyDown(separator, { key: "ArrowLeft", shiftKey: true });
    expect(onChange).toHaveBeenLastCalledWith(400 - 48);
  });

  it("方向键受最小宽度约束", () => {
    const onChange = vi.fn();
    render(<Splitter value={320} onChange={onChange} />);
    const separator = screen.getByRole("separator");
    mockContainerRect(separator.parentElement as HTMLElement);

    fireEvent.keyDown(separator, { key: "ArrowLeft" });
    expect(onChange).toHaveBeenLastCalledWith(320);
  });
});
