import type { PlasmoCSConfig } from "plasmo"

export const config: PlasmoCSConfig = {
  matches: ["<all_urls>"],
  run_at: "document_start"
}

interface ParaloomAPI {
  connect: () => Promise<{ address: string; publicKey: string }>
  disconnect: () => Promise<void>
  signMessage: (message: string) => Promise<string>
  sendPrivateTransfer: (params: {
    recipient: string
    amount: number
    memo?: string
  }) => Promise<string>
  getAddress: () => Promise<string | null>
  isConnected: () => Promise<boolean>
}

const paraloomAPI: ParaloomAPI = {
  connect: async () => {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: "CONNECT_WALLET" }, (response) => {
        if (response.success) {
          resolve(response.data)
        } else {
          reject(new Error(response.error || "Failed to connect"))
        }
      })
    })
  },

  disconnect: async () => {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: "DISCONNECT_WALLET" }, () => {
        resolve()
      })
    })
  },

  signMessage: async (message: string) => {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: "SIGN_MESSAGE", message }, (response) => {
        if (response.success) {
          resolve(response.signature)
        } else {
          reject(new Error(response.error || "Failed to sign"))
        }
      })
    })
  },

  sendPrivateTransfer: async (params) => {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: "SEND_PRIVATE_TRANSFER", params }, (response) => {
        if (response.success) {
          resolve(response.txHash)
        } else {
          reject(new Error(response.error || "Transfer failed"))
        }
      })
    })
  },

  getAddress: async () => {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: "GET_ADDRESS" }, (response) => {
        resolve(response.address || null)
      })
    })
  },

  isConnected: async () => {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: "IS_CONNECTED" }, (response) => {
        resolve(response.connected || false)
      })
    })
  }
}

;(window as any).paraloom = paraloomAPI

console.log("Paraloom Wallet injected")

export {}
