import React from "react";
import ReactDOM from "react-dom/client";
import { DesignLab } from "./DesignLab.js";
import "./styles.css";

const root = document.getElementById("design-lab-root");
if (!root) throw new Error("design-lab-root element not found");

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <DesignLab />
  </React.StrictMode>,
);
