import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

// eslint-config-next 16 отдаёт готовый flat config, поэтому мост FlatCompat
// не нужен (и с ним конфиг всё равно падает на циклической ссылке в схеме).
//
// ESLint зафиксирован на 9.x: eslint-plugin-react, который тянет за собой
// eslint-config-next, использует удалённый в 10.x context.getFilename и падает
// на первом же .tsx. Поднимать до 10 — после обновления плагина.
const config = [
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "generated/**",
      "playwright-report/**",
      "test-results/**",
    ],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
];

export default config;
