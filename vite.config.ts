import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  resolve: {
    tsconfigPaths: true, // Vite ina uwezo wa kusoma tsconfig paths
  },
  // Ikiwa unatumia TanStack Start, ongeza plugin yake:
  // ... other configs
});
