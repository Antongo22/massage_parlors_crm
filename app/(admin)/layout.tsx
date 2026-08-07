import { AppShell } from "@/components/layout/app-shell";
import { requireAdmin } from "@/lib/auth-guards";
import { prisma } from "@/lib/db";
import { requireOrganization } from "@/lib/services/organization";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdmin();
  const organization = await requireOrganization();

  // Непрочитанные сообщения от клиентов: единственный счётчик, который
  // администратору нужно видеть, не заходя в раздел.
  const unread = await prisma.message.count({
    where: { senderRole: "CLIENT", readAt: null },
  });

  return (
    <AppShell
      role="ADMIN"
      organizationName={organization.name}
      userName={user.name ?? user.email}
      unreadCount={unread}
    >
      {children}
    </AppShell>
  );
}
