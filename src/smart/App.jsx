import {} from "lucide-react";
import { ErrorBoundary } from "./app/ErrorBoundary.jsx";
import { SmartManager } from "./app/Shell.jsx";
import { AppLock, GlobalStyles } from "./components/ui.jsx";
// Runtime client init: configure Supabase and global client services.
import "./lib/startup.jsx";

export default function App() {
  return (
    <>
      <GlobalStyles />
      <ErrorBoundary>
        <AppLock>
          <SmartManager />
        </AppLock>
      </ErrorBoundary>
    </>
  );
}
