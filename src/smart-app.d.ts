// The Smart Manager app is plain JSX (untyped source, imported as-is).
declare module "@/smart/App.jsx" {
  import type { ComponentType } from "react";
  const App: ComponentType;
  export default App;
}
