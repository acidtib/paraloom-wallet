import type { PlasmoCSConfig } from "plasmo"

const DEV_MATCHES =
  process.env.NODE_ENV === "development"
    ? ["http://localhost/*", "http://127.0.0.1/*"]
    : []

// Runs in the ISOLATED world (has chrome.*). It bridges window.paraloom calls
// posted from the page's MAIN world (inpage.ts) to the background service
// worker, then posts the background's reply back to the page.
export const config: PlasmoCSConfig = {
  matches: ["https://*.paraloom.io/*", "https://paraloom.io/*", ...DEV_MATCHES],
  run_at: "document_start"
}

const REQ = "paraloom:request"
const RES = "paraloom:response"

window.addEventListener("message", (event: MessageEvent) => {
  if (event.source !== window) return
  const data = event.data
  if (!data || data.channel !== REQ || typeof data.id !== "number") return

  const reply = (result?: unknown, error?: string) => {
    window.postMessage({ channel: RES, id: data.id, result, error }, event.origin || "*")
  }

  try {
    chrome.runtime.sendMessage(
      { type: data.type, ...(data.payload || {}) },
      (response) => {
        const err = chrome.runtime.lastError
        if (err) reply(undefined, err.message)
        else reply(response)
      }
    )
  } catch (e) {
    reply(undefined, e instanceof Error ? e.message : String(e))
  }
})

export {}
