import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './styles/theme.css'
import './styles/screens.css'
import AuthProvider from './context/AuthContext.jsx'
import { i18nReady } from "./i18n.js";

// Render once the chosen language is loaded, so the first screen is already in that language.
// If loading fails the site still renders, in English.
i18nReady.catch(() => {}).finally(() => {
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <AuthProvider>
        <App />
      </AuthProvider>
    </StrictMode>
  )
});

// Offline support for the poll-day screen (production builds; set VITE_SW=on to try it in development).
if ("serviceWorker" in navigator && (import.meta.env.PROD || import.meta.env.VITE_SW === "on")) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
}
