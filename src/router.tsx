import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

// Module-scoped singletons to keep provider identity stable across renders.
// This prevents provider churn that causes the app to unmount/remount and
// triggers repeated refetches, auth/sync restarts, and visible UI flicker.
const queryClient = new QueryClient();

const router = createRouter({
  routeTree,
  context: { queryClient },
  scrollRestoration: true,
  defaultPreloadStaleTime: 0,
});

export const getRouter = () => router;
export const getQueryClient = () => queryClient;
