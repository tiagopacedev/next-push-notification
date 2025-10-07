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


let badgeCount = 0

self.addEventListener('push', async (event) => {
  if (!event.data) return

  const data = event.data.json()
  badgeCount++

  // ✅ Set the app badge (only works if PWA is installed)
  if ('setAppBadge' in navigator) {
    try {
      await navigator.setAppBadge(badgeCount)
    } catch (err) {
      console.error('Failed to set badge:', err)
    }
  }

  // ✅ Show notification
  const options = {
    body: data.body,
    icon: data.icon || '/icon.png',
    badge: '/badge.png',
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: '2',
    },
  }

  event.waitUntil(self.registration.showNotification(data.title, options))

  // ✅ Notify all open pages about the new badge count
  const clientsList = await self.clients.matchAll()
  clientsList.forEach(client =>
    client.postMessage({
      type: 'SET_BADGE',
      count: badgeCount,
    })
  )
})


self.addEventListener('notificationclick', function (event) {
  console.log('Notification click received.')
  event.notification.close()
  event.waitUntil(self.clients.openWindow(self.location.origin))
})