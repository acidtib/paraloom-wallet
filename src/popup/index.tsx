import { createRoot } from "react-dom/client"
import { App } from "~src/wallet/App"

import "~src/wallet/style.css"

const root = createRoot(document.getElementById("root")!)
root.render(<App />)
