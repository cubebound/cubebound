/**
 * `next build` into a scratch directory, so it cannot disturb a running dev
 * server.
 *
 * They share `.next` by default, and a build overwrites the dev server's client
 * chunks: the browser then requests `/_next/static/development/...` files that
 * no longer exist and pages stop loading, while server-rendered fetches keep
 * returning 200 and hide the damage. That is a genuinely confusing failure, so
 * the pre-deploy gate should use this rather than `npm run build` whenever
 * `npm run dev` is up.
 *
 * A wrapper rather than `NEXT_DIST_DIR=… next build` in package.json, because
 * npm runs scripts through cmd.exe on Windows, where the POSIX env-var prefix
 * is a syntax error.
 */
import { spawn } from "node:child_process";

const child = spawn(
  process.execPath,
  ["./node_modules/next/dist/bin/next", "build", ...process.argv.slice(2)],
  {
    stdio: "inherit",
    env: { ...process.env, NEXT_DIST_DIR: process.env.NEXT_DIST_DIR || ".next-build" },
  },
);

child.on("exit", (code) => process.exit(code ?? 1));
