import type { Metadata } from "next";
import "./globals.css";

/**
 * Шрифт — системный стек, а не next/font/google.
 *
 * Причина не в эстетике: next/font/google скачивает файлы шрифта во время
 * сборки. Значит, сборка требует доступа к fonts.gstatic.com — и падает
 * в контейнере без интернета, за корпоративным прокси и на VPS с закрытым
 * исходящим трафиком. Обещание «docker compose up поднимает всё» не должно
 * зависеть от доступности стороннего CDN.
 *
 * Побочно: пользователю не нужно ничего скачивать, а его IP не уходит
 * в Google при каждом открытии страницы.
 */
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
