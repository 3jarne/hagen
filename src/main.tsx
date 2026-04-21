import { createRoot } from "react-dom/client"
import { ThemeProvider } from "@/components/theme-provider"
import App from "@/App"
import "./index.css"

createRoot(document.getElementById("root")!).render(
  <ThemeProvider defaultTheme="system">
    <App />
  </ThemeProvider>
)
