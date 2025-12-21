"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function Sidebar() {
  const pathname = usePathname();
  
  const routes = [
    { href: "/agent1", label: "机器人1" },
    { href: "/agent2", label: "机器人2" },
    { href: "/agent3", label: "机器人3" },
  ];

  return (
    <Card className="w-80 rounded-none border-0 shadow-none bg-sidebar">
      <CardContent className="p-4 flex flex-col gap-1">
        {routes.map((route) => {
          const isActive = pathname === route.href;
          return (
            <Link key={route.href} href={route.href}>
              <Button
                variant="ghost"
                className={cn(
                  "w-full justify-start text-lg h-10 hover:bg-sidebar-accent",
                  isActive && "bg-sidebar-accent"
                )}
              >
                {route.label}
              </Button>
            </Link>
          );
        })}
      </CardContent>
    </Card>
  );
}

