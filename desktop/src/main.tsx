import ReactDOM from "react-dom/client";
import { App } from "./App";
import "./index.css";

// Note: StrictMode is intentionally OFF. It double-mounts effects in dev,
// which tears down a freshly-acquired MediaStream between the two passes
// and breaks the gesture-bound capture handoff into RecorderShell.
ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
