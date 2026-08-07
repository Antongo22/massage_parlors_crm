import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

// Prisma 7 работает через driver adapter вместо Rust-движка: в образ не попадает
// бинарник, а пул соединений — обычный node-postgres.
const createClient = (url?: string) =>
  new PrismaClient({
    adapter: new PrismaPg({ connectionString: url ?? process.env.DATABASE_URL }),
  });

// В dev Next.js пересоздаёт модули при hot reload. Без кеша на globalThis
// каждый перезапуск открывал бы новый пул, и Postgres упёрся бы в max_connections.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export { createClient as createPrismaClient };
