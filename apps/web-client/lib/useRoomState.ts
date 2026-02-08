import { create } from 'zustand';
import { RoomState, PlayerState, Song, PlaylistCollection, ClientCommand } from '@karaokenatin/shared';
import { shallow } from 'zustand/shallow';

interface RoomStore {
    roomState: RoomState | null;
    setState: (state: RoomState) => void;
    isInputFocused: boolean;
    setInputFocused: (focused: boolean) => void;
}

export const useRoomStore = create<RoomStore>((set) => ({
    roomState: null,
    setState: (state) => set({ roomState: state }),
    isInputFocused: false,
    setInputFocused: (focused) => set({ isInputFocused: focused }),
}));

// Hook for input focus state
export function useInputFocus() {
    const setInputFocused = useRoomStore((state) => state.setInputFocused);
    return setInputFocused;
}

// Separate store for command sending - never causes re-renders
interface CommandStore {
    sendCommand: ((command: ClientCommand) => void) | null;
    setSendCommand: (fn: (command: ClientCommand) => void) => void;
}

export const useCommandStore = create<CommandStore>((set) => ({
    sendCommand: null,
    setSendCommand: (fn) => set({ sendCommand: fn }),
}));

export function useRoomState() {
    const roomState = useRoomStore((state) => state.roomState);
    return { roomState };
}

// Hook to get sendCommand without subscribing to changes
export function useSendCommand() {
    return useCommandStore((state) => state.sendCommand);
}

// Selective hooks to prevent unnecessary re-renders
export function usePlayerState(): PlayerState | undefined {
    return useRoomStore(
        (state) => state.roomState?.player,
        shallow
    );
}

export function useCurrentSong(): Song | null | undefined {
    return useRoomStore(
        (state) => state.roomState?.player.currentSong,
        shallow
    );
}

export function useQueue(): Song[] {
    return useRoomStore(
        (state) => state.roomState?.queue || [],
        shallow
    );
}

export function usePlaylists(): PlaylistCollection[] {
    return useRoomStore(
        (state) => state.roomState?.playlists || [],
        shallow
    );
}
