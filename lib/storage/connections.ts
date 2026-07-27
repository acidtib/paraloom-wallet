// Per-site connection permissions ("trusted apps"), like Phantom's connected
// sites list. An origin is added here only after the user explicitly approves a
// connection request, and removed when they disconnect — so a revoked site is
// prompted again on its next connect().
const CONNECTIONS_KEY = "paraloom_connections"

export async function getApprovedOrigins(): Promise<string[]> {
  const result = await chrome.storage.local.get(CONNECTIONS_KEY)
  const list = result[CONNECTIONS_KEY] as string[] | undefined
  return Array.isArray(list) ? list : []
}

export async function isOriginApproved(origin: string): Promise<boolean> {
  return (await getApprovedOrigins()).includes(origin)
}

export async function addApprovedOrigin(origin: string): Promise<void> {
  const list = await getApprovedOrigins()
  if (!list.includes(origin)) {
    list.push(origin)
    await chrome.storage.local.set({ [CONNECTIONS_KEY]: list })
  }
}

export async function removeApprovedOrigin(origin: string): Promise<void> {
  const list = (await getApprovedOrigins()).filter((o) => o !== origin)
  await chrome.storage.local.set({ [CONNECTIONS_KEY]: list })
}
