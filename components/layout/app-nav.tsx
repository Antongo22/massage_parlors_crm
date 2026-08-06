"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  LayoutDashboard,
  MessageSquare,
  Settings,
  Sparkles,
  Ticket,
  Users,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";

const ADMIN_LINKS = [
  { href: "/dashboard", label: "Дашборд", icon: LayoutDashboard },
  { href: "/calendar", label: "Календарь", icon: CalendarDays },
  { href: "/clients", label: "Клиенты", icon: Users },
  { href: "/services", label: "Услуги", icon: Sparkles },
  { href: "/subscriptions", label: "Абонементы", icon: Ticket },
  { href: "/finance", label: "Финансы", icon: Wallet },
  { href: "/chat", label: "Чат", icon: MessageSquare },
  { href: "/settings", label: "Настройки", icon: Settings },
];

const CLIENT_LINKS = [
  { href: "/my", label: "Мои записи", icon: CalendarDays },
  { href: "/my/subscriptions", label: "Абонементы", icon: Ticket },
  { href: "/my/chat", label: "Чат с салоном", icon: MessageSquare },
];

export function AppNav({
  role,
  unreadCount = 0,
}: {
  role: "ADMIN" | "CLIENT";
  unreadCount?: number;
}) {
  const pathname = usePathname();
  const links = role === "ADMIN" ? ADMIN_LINKS : CLIENT_LINKS;

  return (
    <nav className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
      {links.map((link) => {
        // Точное совпадение для корневых путей, префикс — для вложенных:
        // иначе «Мои записи» подсвечивались бы на всех страницах кабинета.
        const active =
          link.href === "/my" || link.href === "/dashboard"
            ? pathname === link.href
            : pathname.startsWith(link.href);

        const showBadge = link.href.includes("chat") && unreadCount > 0;

        return (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
              active
                ? "bg-primary/10 text-primary font-medium"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
            aria-current={active ? "page" : undefined}
          >
            <link.icon className="size-4 shrink-0" />
            <span>{link.label}</span>
            {showBadge && (
              <span className="bg-primary text-primary-foreground ml-auto rounded-full px-1.5 py-0.5 text-[11px] leading-none">
                {unreadCount}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
