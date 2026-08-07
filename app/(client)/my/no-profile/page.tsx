import { UserX } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { getSessionUser } from "@/lib/auth-guards";

export const dynamic = "force-dynamic";

export default async function NoProfilePage() {
  const user = await getSessionUser();

  return (
    <Card className="mx-auto max-w-lg">
      <CardContent className="space-y-3 py-10 text-center">
        <UserX className="text-muted-foreground mx-auto size-10" />
        <h1 className="text-lg font-semibold">Карточка клиента не найдена</h1>
        <p className="text-muted-foreground text-sm">
          Вы вошли под адресом <span className="text-foreground">{user?.email}</span>, но карточки
          с этим email в салоне нет. Свяжитесь с администратором — он добавит адрес в вашу карточку,
          и кабинет откроется автоматически.
        </p>
      </CardContent>
    </Card>
  );
}
