import "./globals.css";
import { Sidebar, RouteItem } from "@/components/layout/Sidebar";
import { agentRegistry } from "@/entities/agent/agent.registry";

// 从 agent registry 生成路由配置
const routes: RouteItem[] = Object.values(agentRegistry).map((agent) => ({
  href: `/agent/${agent.id}`,
  label: `${agent.name}`,
}));

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="font-sans antialiased bg-background">
        <div className="flex h-screen">
          <Sidebar routes={routes} />

          <div className="flex-1 flex flex-col">{children}</div>
        </div>
      </body>
    </html>
  );
}