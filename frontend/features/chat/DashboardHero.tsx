"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";

function getGreeting(h: number) {
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function useNow() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export function DashboardHero() {
  const now = useNow();

  const hours = now.getHours();
  const greeting = getGreeting(hours);
  const timeStr = now.toLocaleTimeString("en-US", { hour12: false });
  const weekday = WEEKDAYS[now.getDay()];
  const dateStr = now.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="flex h-full min-h-0 min-w-0 items-center justify-center p-8">
      <div className="flex w-full max-w-xl flex-col items-center gap-8 rounded-xl border bg-card p-10 shadow-sm">
        {/* Logo + Greeting */}
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted">
            <Sparkles className="h-6 w-6 text-foreground" />
          </div>
          <p className="text-sm font-medium text-muted-foreground">{greeting}</p>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Welcome back!
          </h1>
        </div>

        {/* Clock + Date */}
        <div className="flex w-full items-stretch gap-6">
          <div className="flex flex-1 items-center justify-center">
            <span className="font-mono text-5xl font-light tracking-wider text-foreground tabular-nums">
              {timeStr}
            </span>
          </div>
          <div className="flex w-[38.2%] flex-col items-center justify-center gap-1">
            <span className="text-sm font-medium text-muted-foreground">{weekday}</span>
            <span className="text-center text-base text-foreground">{dateStr}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
