"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

/**
 * The last-resort boundary: a crash in the root layout itself.
 *
 * `error.tsx` renders *inside* the layout, so it can't catch one. This replaces
 * the whole document, which is why it ships its own `<html>` and inline styles
 * — the layout that would have provided them is the thing that failed, and a
 * stylesheet reference could be the failure.
 */
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#09090b",
          color: "#fafafa",
          fontFamily: "system-ui, sans-serif",
          textAlign: "center",
        }}
      >
        <div style={{ padding: 24 }}>
          <h1 style={{ fontSize: 24, fontWeight: 600 }}>Something broke</h1>
          <p style={{ color: "#a1a1aa" }}>
            cubebound.gg failed to load. Reloading usually works.
          </p>
          {error.digest && (
            <p style={{ color: "#71717a", fontFamily: "monospace", fontSize: 12 }}>
              {error.digest}
            </p>
          )}
          {/* A plain anchor on purpose: next/link navigates client-side through
              the router that just failed, so it would re-enter the broken tree.
              A full document load is the recovery. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/" style={{ color: "#ff6a2b" }}>
            Back to cubebound.gg
          </a>
        </div>
      </body>
    </html>
  );
}
