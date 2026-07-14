"use client";

import { useEffect, useState } from "react";
import Clock, { ClockProps } from "react-clock";
import "react-clock/dist/Clock.css";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const PROMPTS = [
  '点击「⋯」→ Management 新建智能体',
  '左下角头像 → Settings 配置 API Key',
  '拖拽文件到聊天框，说"导入知识库"',
  '对智能体说"建图"，构建知识图谱',
  '点击「<」展开左侧面板',
];

type Phase = "typing" | "pausing" | "deleting";

function LiveClock(props: Omit<ClockProps, "value">) {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return <Clock value={now} {...props} />;
}

export function DashboardHero() {
  const now = new Date();
  const weekday = WEEKDAYS[now.getDay()];
  const monthDay = now.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
  });
  const yearStr = now.toLocaleDateString("en-US", {
    year: "numeric",
  });

  const [promptIndex, setPromptIndex] = useState(0);
  const [displayText, setDisplayText] = useState("");
  const [phase, setPhase] = useState<Phase>("typing");

  useEffect(() => {
    const currentPrompt = PROMPTS[promptIndex];

    if (phase === "typing") {
      if (displayText.length < currentPrompt.length) {
        const id = setTimeout(() => {
          setDisplayText((prev) => currentPrompt.slice(0, prev.length + 1));
        }, 80);
        return () => clearTimeout(id);
      }
      setPhase("pausing");
      return;
    }

    if (phase === "pausing") {
      const id = setTimeout(() => {
        setPhase("deleting");
      }, 3000);
      return () => clearTimeout(id);
    }

    if (phase === "deleting") {
      if (displayText.length > 0) {
        const id = setTimeout(() => {
          setDisplayText((prev) => prev.slice(0, -1));
        }, 40);
        return () => clearTimeout(id);
      }
      setPromptIndex((prev) => (prev + 1) % PROMPTS.length);
      setPhase("typing");
    }
  }, [phase, displayText, promptIndex]);

  return (
    <div className="flex flex-1 min-h-0 min-w-0 items-center justify-center">
      <div className="flex w-full max-w-md flex-col rounded-xl bg-card p-6 shadow-md border aspect-[5/3]">
        <div className="flex w-full flex-col gap-1">
          <h1 className="w-full text-center text-xl text-muted-foreground">
            Welcome back!
          </h1>
          <div role="status" aria-atomic="true" className="flex items-center justify-center h-9">
            <span aria-live="polite" className="text-center text-lg text-foreground/80 font-normal tracking-normal">
              {displayText}
              <span
                className={`inline-flex ml-0.5 w-[2px] h-[1em] bg-foreground/60 ${phase === "pausing" ? "" : "animate-pulse"}`}
              >
                &nbsp;
              </span>
            </span>
          </div>
        </div>

        <hr className="my-5 w-full border-border" />

        <div className="flex w-full flex-row items-center justify-center gap-10">
          <LiveClock
            size={120}
            renderNumbers
            hourHandWidth={3}
            minuteHandWidth={2}
            secondHandWidth={1}
          />
          <span className="text-2xl font-medium text-muted-foreground">{weekday}</span>
          <div className="flex flex-col items-center leading-tight">
            <span className="text-2xl text-foreground">{monthDay}</span>
            <span className="text-2xl text-foreground">{yearStr}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
