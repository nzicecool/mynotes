import { createRoot } from "react-dom/client";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import "./styles.css";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <ThemeProvider defaultTheme="dark" switchable={false}>
    <TooltipProvider delayDuration={350}>
      <App />
      <Toaster theme="dark" />
    </TooltipProvider>
  </ThemeProvider>,
);
