import { useEffect, useRef } from 'react';

/**
 * Hold a screen wake lock while `active` is true.
 *
 * Without this the display sleeps mid-song on Android and Android TV, which is
 * the failure users notice most: the host is deliberately unattended during a
 * party. `WAKE_LOCK` was already declared in AndroidManifest.xml but nothing
 * ever acquired one.
 *
 * The Screen Wake Lock API is not universally available (older WebViews, and it
 * requires a secure context — which for us means localhost, where the Tauri
 * webview loads the bundled frontend). Every failure path here is non-fatal: if
 * the lock cannot be taken the app carries on and the screen behaves as before.
 */
export function useWakeLock(active: boolean) {
    // Typed loosely: WakeLockSentinel is missing from some lib.dom versions.
    const sentinelRef = useRef<{ release: () => Promise<void>; released: boolean } | null>(null);

    useEffect(() => {
        let cancelled = false;

        const nav = navigator as Navigator & {
            wakeLock?: { request: (type: 'screen') => Promise<any> };
        };

        const release = async () => {
            const sentinel = sentinelRef.current;
            sentinelRef.current = null;
            if (sentinel && !sentinel.released) {
                try {
                    await sentinel.release();
                } catch {
                    // Already released, or the document lost visibility. Nothing to do.
                }
            }
        };

        const acquire = async () => {
            if (!nav.wakeLock) return;
            if (sentinelRef.current && !sentinelRef.current.released) return;
            try {
                const sentinel = await nav.wakeLock.request('screen');
                if (cancelled) {
                    // `active` flipped false (or we unmounted) while awaiting.
                    await sentinel.release().catch(() => { });
                    return;
                }
                sentinelRef.current = sentinel;
            } catch (err) {
                // Denied, unsupported, or not a secure context. Not fatal.
                console.warn('[WakeLock] Could not acquire screen wake lock:', err);
            }
        };

        // The browser drops the lock whenever the page is hidden, and does not
        // restore it on return — so re-acquire when we become visible again.
        const handleVisibility = () => {
            if (document.visibilityState === 'visible' && active) {
                void acquire();
            }
        };

        if (active) {
            void acquire();
            document.addEventListener('visibilitychange', handleVisibility);
        } else {
            void release();
        }

        return () => {
            cancelled = true;
            document.removeEventListener('visibilitychange', handleVisibility);
            void release();
        };
    }, [active]);
}
