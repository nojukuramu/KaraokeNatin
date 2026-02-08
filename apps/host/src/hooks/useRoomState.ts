import { useState, useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { RoomState, Song, PlaylistCollection } from '@karaokenatin/shared';
import { createRoom, getRoomState } from '../lib/commands';

// Re-export types for components
export type { Song, RoomState, PlaylistCollection };

// Global ref to track if any input is focused (prevents re-renders while typing)
let _isInputFocused = false;
let _pendingState: RoomState | null = null;

export function setHostInputFocused(focused: boolean) {
    _isInputFocused = focused;
    // When unfocusing, flush any pending state
    if (!focused && _pendingState && _flushCallback) {
        _flushCallback(_pendingState);
        _pendingState = null;
    }
}

let _flushCallback: ((state: RoomState) => void) | null = null;

/**
 * Hook to manage room state from Rust backend
 */
export function useRoomState() {
    const [roomState, setRoomState] = useState<RoomState | null>(null);
    const [loading, setLoading] = useState(true);

    // Register the flush callback
    useEffect(() => {
        _flushCallback = setRoomState;
        return () => { _flushCallback = null; };
    }, []);

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
            if (_isInputFocused) {
                // Defer update to avoid re-rendering while user is typing
                _pendingState = event.payload;
            } else {
                setRoomState(event.payload);
            }
        });

        return () => {
            unlisten.then((fn) => fn());
        };
    }, []);

    return { roomState, loading, initializeRoom };
}
