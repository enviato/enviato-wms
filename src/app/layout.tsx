import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ENVIATO — Package Forwarding Platform",
  description: "Multi-tenant warehouse management and package forwarding",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white antialiased">{children}</body>
    </html>
  );
}
