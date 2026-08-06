import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CRM массажного салона",
  description: "Записи, клиенты, абонементы и финансы частного массажного салона",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
