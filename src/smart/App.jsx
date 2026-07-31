import { ErrorBoundary } from "./app/ErrorBoundary.jsx";
import { SmartManager } from "./app/Shell.jsx";
import { AppLock, GlobalStyles } from "./components/ui.jsx";

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
