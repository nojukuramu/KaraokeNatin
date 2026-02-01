import { create } from 'zustand';
import { RoomState } from '@karaokenatin/shared';

interface RoomStore {
    roomState: RoomState | null;
    setState: (state: RoomState) => void;
}

export const useRoomStore = create<RoomStore>((set) => ({
    roomState: null,
    setState: (state) => set({ roomState: state }),
}));

export function useRoomState() {
    const roomState = useRoomStore((state) => state.roomState);
    return { roomState };
}
