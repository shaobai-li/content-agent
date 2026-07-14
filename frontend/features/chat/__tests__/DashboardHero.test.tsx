import { render, screen, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DashboardHero } from "../DashboardHero";

vi.mock("react-clock", () => ({
  default: function MockClock() {
    return <div data-testid="mock-clock" />;
  },
}));

const FIRST_PROMPT = '点击「⋯」→ Management 新建智能体';
const SECOND_PROMPT = '左下角头像 → Settings 配置 API Key';

/** 在 act 中推进假定时器，让 React 在每次 tick 之间完成重渲染 */
function tick(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

/** 逐字完成打字阶段（每字 80ms） */
function typePrompt(text: string) {
  for (let i = 0; i < text.length; i++) {
    tick(80);
  }
}

/** 逐字完成删除阶段（每字 40ms） */
function deletePrompt(text: string) {
  for (let i = 0; i < text.length; i++) {
    tick(40);
  }
}

/** 完成一条提示语的完整生命周期：typing → pausing → deleting */
function completeCycle(text: string) {
  typePrompt(text);
  tick(3000);  // pausing
  deletePrompt(text); // deleting → 循环到下一段
}

describe("DashboardHero 打字机状态机", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-14T09:00:00"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ─── 初始渲染 ────────────────────────────────────────

  it("渲染欢迎语和基础布局", () => {
    render(<DashboardHero />);
    expect(screen.getByText("Welcome back!")).toBeInTheDocument();
    expect(screen.getByTestId("mock-clock")).toBeInTheDocument();
    expect(screen.getByText("Tuesday")).toBeInTheDocument();
  });

  it("初始状态：displayText 为空，phase 为 typing（光标闪烁）", () => {
    render(<DashboardHero />);

    const cursor = document.querySelector(".inline-flex");
    expect(cursor).toBeInTheDocument();
    expect(cursor?.className).toContain("animate-pulse");
  });

  // ─── typing 阶段 ─────────────────────────────────────

  it("typing 阶段逐字输出（每 80ms 一个字）", () => {
    render(<DashboardHero />);

    tick(80);
    expect(screen.getByText("点")).toBeInTheDocument();

    tick(80);
    expect(screen.getByText("点击")).toBeInTheDocument();

    tick(80);
    expect(screen.getByText("点击「")).toBeInTheDocument();
  });

  it("完整输入一条提示语后进入 pausing 阶段（光标停止闪烁）", () => {
    render(<DashboardHero />);

    typePrompt(FIRST_PROMPT);

    // 全文出现
    expect(screen.getByText(FIRST_PROMPT)).toBeInTheDocument();

    // 进入 pausing — 光标不再有 animate-pulse
    const cursor = document.querySelector(".inline-flex");
    expect(cursor?.className).not.toContain("animate-pulse");
  });

  // ─── pausing 阶段 ────────────────────────────────────

  it("pausing 阶段等待 3000ms 后进入 deleting", () => {
    render(<DashboardHero />);

    typePrompt(FIRST_PROMPT);
    expect(screen.getByText(FIRST_PROMPT)).toBeInTheDocument();

    // 2999ms — 仍在 pausing，全文保留
    tick(2999);
    expect(screen.getByText(FIRST_PROMPT)).toBeInTheDocument();

    // 再走 1ms（共 3000ms）— 进入 deleting，但删除定时器 40ms 尚未触发
    tick(1);
    expect(screen.getByText(FIRST_PROMPT)).toBeInTheDocument();

    // 走完 40ms — 第一个字被删
    tick(40);
    expect(screen.queryByText(FIRST_PROMPT)).not.toBeInTheDocument();
  });

  // ─── deleting 阶段 ───────────────────────────────────

  it("deleting 阶段逐字删除（每 40ms 一个字）", () => {
    render(<DashboardHero />);

    typePrompt(FIRST_PROMPT);
    tick(3000);

    tick(40);
    expect(screen.getByText(FIRST_PROMPT.slice(0, -1))).toBeInTheDocument();

    tick(40);
    expect(screen.getByText(FIRST_PROMPT.slice(0, -2))).toBeInTheDocument();
  });

  // ─── 循环 ────────────────────────────────────────────

  it("删除完成后切换到下一条提示语", () => {
    render(<DashboardHero />);

    completeCycle(FIRST_PROMPT);

    // 第二条开始第一个字
    tick(80);
    expect(screen.getByText(SECOND_PROMPT[0])).toBeInTheDocument();
    expect(screen.queryByText(FIRST_PROMPT)).not.toBeInTheDocument();
  });

  it("5 条提示语全部轮播完后回到第一条", () => {
    render(<DashboardHero />);

    const PROMPTS = [
      FIRST_PROMPT,
      SECOND_PROMPT,
      '拖拽文件到聊天框，说"导入知识库"',
      '对智能体说"建图"，构建知识图谱',
      '点击「<」展开左侧面板',
    ];

    for (const prompt of PROMPTS) {
      completeCycle(prompt);
    }

    // 回到第一条，开始第一个字
    tick(80);
    expect(screen.getByText(FIRST_PROMPT[0])).toBeInTheDocument();
  });
});
