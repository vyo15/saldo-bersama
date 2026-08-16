import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import App from "./app/App.jsx";
import AppProviders from "./app/AppProviders.jsx";
import { initializeTheme } from "./app/ThemeContext.jsx";
import AppErrorBoundary from "./components/feedback/AppErrorBoundary.jsx";
import { registerServiceWorker } from "./services/serviceWorker.js";
import "@fontsource-variable/manrope/wght.css";
import "./styles/tokens.css";
import "./styles/reset.css";
import "./styles/app.css";
import "./styles/components.css";
import "./styles/pages.css";
import "./styles/responsive.css";

initializeTheme();
registerServiceWorker().catch(() => {});

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <AppErrorBoundary>
      <BrowserRouter>
        <AppProviders><App /></AppProviders>
      </BrowserRouter>
    </AppErrorBoundary>
  </StrictMode>,
);
