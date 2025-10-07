import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    // Change this attribute's name to your `injectionPoint`.
    // `injectionPoint` is an InjectManifest option.
    // See https://serwist.pages.dev/docs/build/configuring
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
  fallbacks: {
    entries: [
      {
        url: "/~offline",
        matcher({ request }) {
          return request.destination === "document";
        },
      },
    ],
  },
});


serwist.addEventListeners();

// Helper to open IndexedDB
function openDB() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('badgeDB', 1)
    request.onupgradeneeded = () => {
      request.result.createObjectStore('badge', { keyPath: 'id' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

// Get stored badge count
async function getBadgeCount() {
  const db = await openDB()
  return new Promise<number>((resolve, reject) => {
    const tx = db.transaction('badge', 'readonly')
    const store = tx.objectStore('badge')
    const req = store.get('count')
    req.onsuccess = () => resolve(req.result?.value || 0)
    req.onerror = () => reject(req.error)
  })
}

// Save badge count
async function setBadgeCount(count: number) {
  const db = await openDB()
  const tx = db.transaction('badge', 'readwrite')
  const store = tx.objectStore('badge')
  store.put({ id: 'count', value: count })
  await tx.oncomplete
}

// Push event with persistent badge
self.addEventListener('push', async (event) => {
  if (!event.data) return
  const data = event.data.json()

  // ✅ Read previous count
  let badgeCount = await getBadgeCount()
  badgeCount++

  // ✅ Save updated count
  await setBadgeCount(badgeCount)

  // ✅ Update app badge
  if ('setAppBadge' in navigator) {
    try {
      await navigator.setAppBadge(badgeCount)
    } catch (err) {
      console.error(err)
    }
  }

  // Show notification
  const options = {
    body: data.body,
    icon: data.icon || '/icon.png',
    badge: '/badge.png',
    data: { dateOfArrival: Date.now() },
  }
  event.waitUntil(self.registration.showNotification(data.title, options))

  // Notify all clients
  const clientsList = await self.clients.matchAll()
  clientsList.forEach(client =>
    client.postMessage({ type: 'SET_BADGE', count: badgeCount })
  )
})
