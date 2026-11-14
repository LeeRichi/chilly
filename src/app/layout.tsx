import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "How to Win Junction — Strategy Desk",
  description: "Research-backed Junction project strategies, reviewed and approved by your team.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
