import { App } from "~src/wallet/App"

import "~src/wallet/style.css"

// The popup CSS assumes a fixed 380x600 window; see "sidepanel-mode" in style.css.
document.body.classList.add("sidepanel-mode")

export default function SidePanel() {
  return <App />
}
