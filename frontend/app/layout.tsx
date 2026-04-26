import "./globals.css";
import { ClientShell } from "./client-shell";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="font-sans antialiased bg-background">
        <ClientShell>{children}</ClientShell>
      </body>
    </html>
  );
}
