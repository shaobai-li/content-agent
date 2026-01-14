import "./globals.css";
import { Sidebar } from "@/components/layout/Sidebar";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased bg-background">
        <div className="flex h-screen">
          <Sidebar />

          <div className="flex-1 flex flex-col">{children}</div>
        </div>
      </body>
    </html>
  );
}