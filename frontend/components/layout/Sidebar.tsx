"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import Image from "next/image";
import { Settings } from "lucide-react"

export function Sidebar() {
  const currentPath = usePathname();
  
  const routes = [
    { href: "/agent_nm", label: "笔记收集Agent" },
  ];

  return (
    <Card className="w-80 flex flex-col gap-0 p-0 rounded-none shadow-none bg-white">
      <div className="flex items-center p-6">
        <Image 
          src="/nexus-logo.png" 
          alt="Nexus Logo" 
          width={110}
          height={200}
          priority
        />
      </div>
      <CardContent className="flex-grow flex flex-col p-4">
        {routes.map((route) => {
          const isActive = currentPath === route.href;
          return (
              <Button asChild variant="ghost"
                key={route.href}
                className={cn(
                  "w-full justify-start text-sm hover:bg-sidebar-accent text-sidebar-foreground",
                  isActive && "bg-sidebar-accent"
                )}
              >
                <Link href={route.href}>{route.label}</Link>
              </Button>
          );
        })}
      </CardContent>
      <div className="p-4 flex justify-end border-t">
        <Button variant="ghost" size="icon">
          <Settings className="size-6" />
        </Button>
      </div>
    </Card>
  );
}

