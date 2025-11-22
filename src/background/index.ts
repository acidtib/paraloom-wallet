import { getAutoLockMinutes, isWalletLocked, setLockState } from "~lib/storage/secure"

let lockTimer: NodeJS.Timeout | null = null
let lastActivity = Date.now()

chrome.runtime.onInstalled.addListener(() => {
  console.log("Paraloom Wallet installed")
  startAutoLockTimer()
})

chrome.runtime.onStartup.addListener(() => {
  console.log("Paraloom Wallet started")
  startAutoLockTimer()
})

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "ACTIVITY") {
    lastActivity = Date.now()
    sendResponse({ success: true })
  }

  if (message.type === "GET_WALLET_STATE") {
    isWalletLocked().then((locked) => {
      sendResponse({ locked })
    })
    return true
  }

  if (message.type === "LOCK_WALLET") {
    setLockState(true).then(() => {
      sendResponse({ success: true })
    })
    return true
  }

  return false
})

async function startAutoLockTimer() {
  const minutes = await getAutoLockMinutes()
  const interval = minutes * 60 * 1000

  if (lockTimer) {
    clearInterval(lockTimer)
  }

  lockTimer = setInterval(async () => {
    const locked = await isWalletLocked()
    if (!locked) {
      const timeSinceActivity = Date.now() - lastActivity
      if (timeSinceActivity >= interval) {
        await setLockState(true)
        console.log("Auto-locked wallet due to inactivity")
      }
    }
  }, 60000)
}

export {}
