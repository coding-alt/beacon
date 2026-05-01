import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Beacon",
  description: "A focused team board for planning, tracking, and shipping work."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}

