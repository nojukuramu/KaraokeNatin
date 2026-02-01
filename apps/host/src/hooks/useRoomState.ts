import { useState, useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { RoomState, Song } from '@karaokenatin/shared';
import { createRoom, getRoomState } from '../lib/commands';

// Re-export types for components
export type { Song, RoomState };


/**
 * Hook to manage room state from Rust backend
 */
export function useRoomState() {
    const [roomState, setRoomState] = useState<RoomState | null>(null);
    const [loading, setLoading] = useState(true);

    const initializeRoom = async () => {
        try {
            // Create room in Rust backend
            await createRoom();
            // Fetch initial state
            const state = await getRoomState();
            setRoomState(state);
        } catch (error) {
            console.error('[useRoomState] Failed to initialize room:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        // Subscribe to room state updates from Rust
        const unlisten = listen<RoomState>('room_state_updated', (event) => {
            setRoomState(event.payload);
        });

        return () => {
            unlisten.then((fn) => fn());
        };
    }, []);

    return { roomState, loading, initializeRoom };
}
