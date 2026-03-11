// Service Worker for AFI Browser Push Notifications
// Handles push events when the tab is closed or in background

self.addEventListener('push', (event) => {
    const data = event.data?.json() || {};
    const options = {
        body: data.body || 'New SEC filing detected',
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        tag: data.ticker || 'afi-alert',
        data: { url: data.url || '/dashboard' },
        actions: [
            { action: 'view', title: 'View Dashboard' },
            { action: 'dismiss', title: 'Dismiss' },
        ],
    };
    event.waitUntil(
        self.registration.showNotification(data.title || 'AFI Alert', options)
    );
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    if (event.action === 'view' || !event.action) {
        event.waitUntil(clients.openWindow(event.notification.data.url));
    }
});
