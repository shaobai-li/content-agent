import "./globals.css";
import { Sidebar, RouteItem } from "@/components/layout/Sidebar";

const routes: RouteItem[] = [
  // {
  //   href: "/agent_nm",
  //   label: "笔记收集Agent",
  //   menuItems: [
  //     { label: "历史聊天", href: "/agent_nm/history" },
  //     { label: "笔记库", href: "/agent_nm/notes" },
  //   ],
  // },
  {
    href: "/agent_kb",
    label: "知识库Agent(POC)",
    menuItems: [
      { label: "Chat History", href: "/agent_kb/history" },
      { label: "Knowledge Base", href: "/agent_kb/knowledge" },
    ],
  },
  {
    href: "/agent_w",
    label: "内容生成Agent(POC)",
    menuItems: [
      { label: "Chat History", href: "/agent_w/history" },
      { label: "Document View", href: "/agent_w/document" },
    ],
  },
  {
    href: "/agent_c",
    label: "文字内容检测Agent(POC)",
    menuItems: [
      { label: "Chat History", href: "/agent_c/history" },
      { label: "Document View", href: "/agent_c/document" },
    ],
  },
];

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