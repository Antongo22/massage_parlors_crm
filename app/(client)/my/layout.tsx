import { AppShell } from "@/components/layout/app-shell";
import { getCurrentClient, requireUser } from "@/lib/auth-guards";
import { prisma } from "@/lib/db";
import { requireOrganization } from "@/lib/services/organization";

export const dynamic = "force-dynamic";

export default async function ClientLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const organization = await requireOrganization();

  // Администратор, зашедший в кабинет, увидит его как есть: отдельная логика
  // «просмотр от имени клиента» здесь не нужна, а запрещать бессмысленно.
  const client = await getCurrentClient();

  const unread = client
    ? await prisma.message.count({
        where: {
          senderRole: "ADMIN",
          readAt: null,
          conversation: { clientId: client.id },
        },
      })
    : 0;

  return (
    <AppShell
      role="CLIENT"
      organizationName={organization.name}
      userName={user.name ?? user.email}
      unreadCount={unread}
    >
      {children}
    </AppShell>
  );
}
