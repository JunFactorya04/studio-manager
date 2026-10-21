import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";
import "./login.css";

// macOS gets an overlay title bar, so the layout leaves room for the window buttons.
if (navigator.userAgent.includes("Mac") && !/iPhone|iPad/.test(navigator.userAgent)) {
  document.documentElement.classList.add("is-mac");
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
