import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";

// Restore the path that triggered the GitHub Pages 404 -> 404.html redirect,
// so client-side routing sees the real URL (e.g. /master-markdown-guide#best-practices).
try {
  const redirect = sessionStorage.getItem("blog-spa-redirect");
  if (redirect) {
    sessionStorage.removeItem("blog-spa-redirect");
    window.history.replaceState(null, "", redirect);
  }
} catch {
  /* ignore */
}

import { BrowserRouter, Routes, Route } from "react-router-dom";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/:slug" element={<App />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
