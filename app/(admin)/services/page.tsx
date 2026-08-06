import { Plus } from "lucide-react";
import { ServiceDialog } from "@/components/services/service-dialog";
import { ServiceRow } from "@/components/services/service-row";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guards";
import { requireOrganization } from "@/lib/services/organization";

export const dynamic = "force-dynamic";

export default async function ServicesPage() {
  await requireAdmin();
  const organization = await requireOrganization();

  const categories = await prisma.serviceCategory.findMany({
    orderBy: { sortOrder: "asc" },
    include: { services: { orderBy: { name: "asc" } } },
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Каталог услуг</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Длительность влияет на сетку записи, цена фиксируется в момент записи снимком.
          </p>
        </div>

        <ServiceDialog
          categories={categories.map((c) => ({ id: c.id, name: c.name }))}
          trigger={
            <Button>
              <Plus className="size-4" />
              Добавить услугу
            </Button>
          }
        />
      </header>

      {categories.length === 0 && (
        <Card>
          <CardContent className="text-muted-foreground py-12 text-center text-sm">
            Категорий пока нет. Создайте услугу — категорию можно будет добавить в той же форме.
          </CardContent>
        </Card>
      )}

      {categories.map((category) => (
        <Card key={category.id}>
          <CardHeader>
            <CardTitle>{category.name}</CardTitle>
          </CardHeader>
          <CardContent>
            {category.services.length === 0 ? (
              <p className="text-muted-foreground py-6 text-center text-sm">
                В категории нет услуг
              </p>
            ) : (
              <ul className="divide-border divide-y">
                {category.services.map((service) => (
                  <ServiceRow
                    key={service.id}
                    service={{
                      id: service.id,
                      name: service.name,
                      description: service.description,
                      durationMinutes: service.durationMinutes,
                      priceMinor: service.priceMinor,
                      isActive: service.isActive,
                      categoryId: service.categoryId,
                    }}
                    currency={organization.currency}
                    categories={categories.map((c) => ({ id: c.id, name: c.name }))}
                  />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
