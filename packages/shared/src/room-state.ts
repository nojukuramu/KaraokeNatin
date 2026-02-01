/**
 * Core data structures for the Unified Room State
 */

export interface Song {
    id: string;
    youtubeId: string;
    title: string;
    artist: string;
    duration: number;       // seconds
    thumbnailUrl: string;
    addedBy: string;        // clientId
    addedAt: number;        // timestamp
}

export type PlayerStatus = 'idle' | 'playing' | 'paused' | 'loading' | 'error';

export interface PlayerState {
    status: PlayerStatus;
    currentSong: Song | null;
    currentTime: number;    // seconds
    duration: number;       // seconds
    volume: number;         // 0-100
    isMuted: boolean;
}

export interface ConnectedClient {
    id: string;
    displayName: string;
    connectedAt: number;
}

export interface RoomState {
    roomId: string;
    hostPeerId: string;

    // Connection state
    connectedClients: ConnectedClient[];

    // Playback state
    player: PlayerState;

    // Queue state
    queue: Song[];

    // Metadata
    createdAt: number;
    updatedAt: number;
}

/**
 * Initial state factory
 */
export function createInitialRoomState(roomId: string, hostPeerId: string): RoomState {
    const now = Date.now();
    return {
        roomId,
        hostPeerId,
        connectedClients: [],
        player: {
            status: 'idle',
            currentSong: null,
            currentTime: 0,
            duration: 0,
            volume: 80,
            isMuted: false,
        },
        queue: [],
        createdAt: now,
        updatedAt: now,
    };
}
