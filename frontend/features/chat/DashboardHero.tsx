"use client";

import { useEffect, useState } from "react";
import Clock from "react-clock";
import "react-clock/dist/Clock.css";

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

  const weekday = WEEKDAYS[now.getDay()];
  const dateStr = now.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="flex flex-1 min-h-0 min-w-0 items-center justify-center p-12">
      <div className="flex w-full max-w-2xl flex-col rounded-xl border bg-card p-14 shadow-sm">
        <div className="flex w-full flex-col gap-3">
          <h1 className="w-full text-center text-xl text-muted-foreground">
            Welcome back!
          </h1>
          <p className="w-full text-center text-4xl font-semibold tracking-tight text-foreground">
            Your adventure starts now.
          </p>
        </div>

        <hr className="my-10 w-full border-border" />

        <div className="flex w-full items-center justify-center gap-8">
          <Clock
            value={now}
            size={120}
            renderNumbers
            hourHandWidth={3}
            minuteHandWidth={2}
            secondHandWidth={1}
          />
          <div className="flex items-center gap-2">
            <span className="text-base font-medium text-muted-foreground">{weekday}</span>
            <span className="text-lg text-foreground">{dateStr}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
