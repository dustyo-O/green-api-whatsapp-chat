import "./index.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { useSession } from "./auth/session-store";
import { BUILD_INFO } from "./build-info";

const root = document.getElementById("root");
if (!root) throw new Error("#root element is missing from index.html");

// Once, before the first render: an effect would run twice under StrictMode, and GREEN-API
// answers two parallel checks with 429.
void useSession.getState().resume();

createRoot(root).render(
  <StrictMode>
    <App build={BUILD_INFO} />
  </StrictMode>,
);
