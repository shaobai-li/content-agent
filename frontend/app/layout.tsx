import "./globals.css";
import { Sidebar } from "@/app-shell/Sidebar";
import { getSidebarRoutes } from "@/app-shell/navigation";

const routes = getSidebarRoutes();

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