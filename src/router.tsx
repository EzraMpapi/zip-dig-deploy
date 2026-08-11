import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

// Create singletons at module scope so router and QueryClient identities
// remain stable across renders. This prevents provider trees from
// unmounting/remounting which causes flicker and infinite re-renders.

const queryClient = new QueryClient();

const router = createRouter({
  routeTree,
  context: { queryClient },
  scrollRestoration: true,
  defaultPreloadStaleTime: 0,
});

export const getRouter = () => router;
export const getQueryClient = () => queryClient;
