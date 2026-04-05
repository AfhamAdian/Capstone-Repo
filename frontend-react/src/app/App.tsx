import { RouterProvider } from "react-router";
import { router } from "./routes";
import { UserProvider } from "./context/UserContext";
import { ProjectDataProvider } from "./context/ProjectDataContext";

// Main application component - Updated: 2026-02-15
export default function App() {
  return (
    <UserProvider>
      <ProjectDataProvider>
        <RouterProvider router={router} />
      </ProjectDataProvider>
    </UserProvider>
  );
}