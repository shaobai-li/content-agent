"use client";

import { useEffect, useState } from "react";
import Clock, { ClockProps } from "react-clock";
import "react-clock/dist/Clock.css";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

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

        <div className="flex w-full items-center pl-14 gap-10">
          <LiveClock
            size={120}
            renderNumbers
            hourHandWidth={3}
            minuteHandWidth={2}
            secondHandWidth={1}
          />
          <div className="flex items-center gap-6">
            <span className="text-2xl font-medium text-muted-foreground">{weekday}</span>
            <span className="text-2xl text-foreground">{dateStr}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
