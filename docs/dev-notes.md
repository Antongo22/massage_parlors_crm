# Заметки для разработчика

Мелочи, на которые уходит час, если о них не знать.

## `@emnapi/core` и `@emnapi/runtime` в devDependencies

Эти пакеты никто не импортирует. Они объявлены явно, чтобы npm не выбрасывал
их из `package-lock.json`.

Механика: они являются транзитивными зависимостями wasm-вариантов нативных
пакетов (`@tailwindcss/oxide-wasm32-wasi`, `@unrs/resolver-binding-wasm32-wasi`).
При `npm install` на macOS npm решает, что на этой платформе они не нужны,
и вычищает их из локфайла. В Linux-контейнере `npm ci` затем падает:

```
npm error `npm ci` can only install packages when your package.json and
npm error package-lock.json are in sync.
npm error Missing: @emnapi/runtime@1.11.3 from lock file
```

Симптом не связан с причиной: падает сборка Docker-образа после того, как
кто-то поставил на хосте совершенно другой пакет.

Объявление прямой зависимостью решает проблему навсегда: прямые зависимости
попадают в локфайл независимо от платформы. Стоимость — около 100 КБ чистого JS.

Не удаляйте их, не проверив `docker compose build`.

## Зависимости в dev-контейнере

`node_modules` внутри контейнера — именованный том, а не бинд с хоста: на macOS
пакеты собраны под другую платформу. Том переживает пересборку образа, поэтому
после установки нового пакета на хосте контейнер сам по себе не обновится.

Это решает `docker/dev-entrypoint.sh`: он сверяет хеш `package-lock.json`
с записанным в томе и при расхождении делает `npm ci`. Ничего вручную
запускать не нужно — достаточно `docker compose up`.

## Тип модели в Prisma 7

Сгенерированный клиент экспортирует типы моделей с суффиксом `Model`:

```ts
import type { OrganizationModel } from "@/generated/prisma/models";
```

В Prisma 6 это был просто `Organization`. При переносе кода из старых примеров
ошибка выглядит как «has no exported member named 'Organization'».

## Компоненты shadcn/ui на Base UI

Актуальный shadcn генерирует компоненты поверх Base UI, а не Radix. Вместо
`asChild` там проп `render`:

```tsx
<Button render={<Link href="/login" />}>Войти</Button>
```
