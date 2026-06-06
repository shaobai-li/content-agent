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
  const monthDay = now.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
  });
  const yearStr = now.toLocaleDateString("en-US", {
    year: "numeric",
  });

  return (
    <div className="flex flex-1 min-h-0 min-w-0 items-center justify-center">
      <div className="flex w-full max-w-md flex-col rounded-xl bg-card p-6 shadow-md border aspect-[5/3]">
        <div className="flex w-full flex-col gap-1">
          <h1 className="w-full text-center text-xl text-muted-foreground">
            Welcome back!
          </h1>
          <p className="w-full text-center text-3xl font-semibold tracking-tight text-foreground">
            Your adventure starts now.
          </p>
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
