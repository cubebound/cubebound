import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Rendering code asks who is signed in through `loadViewer`, which is
  // `cache()`d per request. The root layout's nav asks on every page, so a page
  // calling `getCurrentUser` directly paid a second Supabase auth call and a
  // second profile query for the same answer. Server actions and the loaders
  // themselves still use it: an action is not a render, and has nothing to share.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/**/actions.ts", "src/lib/auth.ts", "src/lib/cube-request.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/lib/auth",
              importNames: ["getCurrentUser", "getAuthUser"],
              message:
                "Render paths use loadViewer() from @/lib/cube-request, which is cached per request.",
            },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Where `npm run build:isolated` puts its output, so a build run against a
    // live dev server doesn't then get linted as source.
    ".next-build/**",
  ]),
]);

export default eslintConfig;
