import Link from "next/link";
import { LogOut } from "lucide-react";
import { AppNav } from "@/components/layout/app-nav";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/auth";

export function AppShell({
  role,
  organizationName,
  userName,
  unreadCount,
  children,
}: {
  role: "ADMIN" | "CLIENT";
  organizationName: string;
  userName: string;
  unreadCount?: number;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh md:flex">
      <aside className="bg-card md:border-border flex flex-col gap-4 border-b p-4 md:h-dvh md:w-60 md:shrink-0 md:border-r md:border-b-0">
        <Link href={role === "ADMIN" ? "/dashboard" : "/my"} className="px-3 py-1">
          <span className="block truncate font-semibold">{organizationName}</span>
          <span className="text-muted-foreground block truncate text-xs">
            {role === "ADMIN" ? "Администратор" : "Личный кабинет"}
          </span>
        </Link>

        <AppNav role={role} unreadCount={unreadCount} />

        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/login" });
          }}
          className="mt-auto hidden md:block"
        >
          <div className="text-muted-foreground truncate px-3 pb-2 text-xs">{userName}</div>
          <Button type="submit" variant="ghost" size="sm" className="w-full justify-start gap-2">
            <LogOut className="size-4" />
            Выйти
          </Button>
        </form>
      </aside>

      <main className="min-w-0 flex-1 p-4 md:p-8">{children}</main>
    </div>
  );
}
