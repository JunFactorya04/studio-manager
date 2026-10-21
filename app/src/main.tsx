import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./theme/tokens.css";
import "./styles.css";
import "./theme/mac.css";
import "./theme/widgets.css";
import "./theme/views.css";
import "./login.css";

// macOS gets an overlay title bar, so the layout leaves room for the window buttons.
import { needsCustomControls } from "./components/WindowControls";

// Desktop app windows get a Mac-style title area: native on macOS, drawn by us on Windows.
if ((navigator.userAgent.includes("Mac") && !/iPhone|iPad/.test(navigator.userAgent)) || needsCustomControls) {
  document.documentElement.classList.add("is-mac");
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
