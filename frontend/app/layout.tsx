import "./globals.css";
import { Sidebar, RouteItem } from "@/components/layout/Sidebar";

const routes: RouteItem[] = [
  { href: "/agent_nm", label: "笔记收集Agent" },
  { href: "/agent_w", label: "内容生成Agent(POC)" },
  { href: "/agent_c", label: "文字内容检测Agent" },
  { href: "/agent_kb", label: "知识库Agent" },
];

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased bg-background">
        <div className="flex h-screen">
          <Sidebar routes={routes} />

          <div className="flex-1 flex flex-col">{children}</div>
        </div>
      </body>
    </html>
  );
}