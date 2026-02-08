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

export type CollectionVisibility = 'public' | 'personal';

export interface PlaylistCollection {
    id: string;
    name: string;
    visibility: CollectionVisibility;
    songs: Song[];
    createdAt: number;
    updatedAt: number;
}

/** Portable format for sharing collections */
export interface ExportedCollection {
    karaokenatin: string;  // version, e.g. "1.0"
    collection: {
        name: string;
        visibility: CollectionVisibility;
        songs: Song[];
    };
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

    // Playlist collections (replaces flat playlist)
    playlists: PlaylistCollection[];

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
        playlists: [],
        createdAt: now,
        updatedAt: now,
    };
}
