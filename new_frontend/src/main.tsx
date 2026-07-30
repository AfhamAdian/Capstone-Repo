
  import { createRoot } from "react-dom/client";
  import App from "./app/App.tsx";
  import { WorkspaceProvider } from "./app/context/WorkspaceContext.tsx";
  import "./styles/index.css";

  createRoot(document.getElementById("root")!).render(
    <WorkspaceProvider>
      <App />
    </WorkspaceProvider>,
  );
