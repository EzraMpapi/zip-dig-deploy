import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

// The Smart Manager app is a client-only SPA (localStorage, window, browser
// APIs throughout), so it is loaded after hydration rather than during SSR.
const SmartManagerApp = lazy(() => import("@/smart/App.jsx"));

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SMART MANAGER — Business Management for Tanzania" },
      {
        name: "description",
        content:
          "SMART MANAGER: 33 business modules with TZS currency, 18% VAT, M-Pesa and TRA support for Tanzanian businesses.",
      },
      { property: "og:title", content: "SMART MANAGER — Business Management for Tanzania" },
      {
        property: "og:description",
        content:
          "Run sales, POS, inventory, finance, HR and 28 more modules in one place, built for Tanzanian businesses.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function AppFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <p className="text-sm text-muted-foreground">Loading SMART MANAGER…</p>
    </div>
  );
}

function Index() {
  return (
    <ClientOnly fallback={<AppFallback />}>
      <Suspense fallback={<AppFallback />}>
        <SmartManagerApp />
      </Suspense>
    </ClientOnly>
  );
}
