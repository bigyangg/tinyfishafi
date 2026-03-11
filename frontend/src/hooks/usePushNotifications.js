import { useCallback } from "react";

/**
 * Hook for browser push notifications.
 * Shows native OS notifications when new signals arrive while tab is not focused.
 */
export function usePushNotifications() {
    // Request permission — should be called from a user interaction (click)
    const requestPermission = useCallback(async () => {
        if (!("Notification" in window)) return false;
        if (Notification.permission === "granted") return true;
        if (Notification.permission === "denied") return false;

        const permission = await Notification.requestPermission();
        if (permission === "granted") {
            // Register service worker for background push
            if ("serviceWorker" in navigator) {
                try {
                    await navigator.serviceWorker.register("/sw.js");
                } catch (err) {
                    console.warn("[PUSH] SW registration failed:", err);
                }
            }
            return true;
        }
        return false;
    }, []);

    // Show local notification for a new signal (only when tab is not visible)
    const notifyNewSignal = useCallback((signal) => {
        if (typeof Notification === "undefined") return;
        if (Notification.permission !== "granted") return;
        if (document.visibilityState === "visible") return; // Don't notify if tab is active

        const sigEmoji = { Positive: "\u{1F7E2}", Risk: "\u{1F534}", Neutral: "\u26AA" }[signal.signal || signal.classification] || "\u26AA";
        const summary = signal.summary || "";

        try {
            new Notification(`${sigEmoji} ${signal.ticker} \u2014 ${signal.signal || signal.classification}`, {
                body: summary.slice(0, 120) + (summary.length > 120 ? "\u2026" : ""),
                icon: "/favicon.ico",
                tag: signal.ticker, // Replaces previous notification for same ticker
                silent: (signal.signal || signal.classification) === "Neutral",
            });
        } catch (err) {
            console.warn("[PUSH] Notification failed:", err);
        }
    }, []);

    return { requestPermission, notifyNewSignal };
}
