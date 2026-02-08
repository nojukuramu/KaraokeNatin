/**
 * P2P WebRTC DataChannel Protocol Definitions
 */

import { RoomState, CollectionVisibility } from './room-state';

/**
 * Commands sent from Client -> Host
 */
export type ClientCommand =
    | { type: 'PLAY' }
    | { type: 'PAUSE' }
    | { type: 'SKIP' }
    | { type: 'SEEK'; time: number }
    | { type: 'SET_VOLUME'; volume: number }
    | { type: 'TOGGLE_MUTE' }
    | { type: 'ADD_SONG'; youtubeUrl: string }
    | { type: 'REMOVE_SONG'; songId: string }
    | { type: 'REORDER_QUEUE'; songId: string; newIndex: number }
    | { type: 'MOVE_SONG_UP'; songId: string }
    | { type: 'MOVE_SONG_DOWN'; songId: string }
    | { type: 'SET_DISPLAY_NAME'; name: string }
    | { type: 'PING' }
    // Collection management commands
    | { type: 'CREATE_COLLECTION'; name: string; visibility: CollectionVisibility }
    | { type: 'DELETE_COLLECTION'; collectionId: string }
    | { type: 'RENAME_COLLECTION'; collectionId: string; name: string }
    | { type: 'SET_COLLECTION_VISIBILITY'; collectionId: string; visibility: CollectionVisibility }
    // Playlist commands (now scoped to collection)
    | { type: 'PLAYLIST_ADD'; youtubeUrl: string; collectionId: string }
    | { type: 'PLAYLIST_REMOVE'; songId: string; collectionId: string }
    | { type: 'PLAYLIST_TO_QUEUE'; songId: string; collectionId: string }
    // Import collection 
    | { type: 'IMPORT_COLLECTION'; data: string };

/**
 * Broadcasts sent from Host -> Clients
 */
export type HostBroadcast =
    | { type: 'STATE_UPDATE'; state: RoomState }
    | { type: 'STATE_PATCH'; patch: Partial<RoomState> }
    | { type: 'ERROR'; code: string; message: string }
    | { type: 'PONG'; serverTime: number };

/**
 * Type guard for client commands
 */
export function isClientCommand(data: unknown): data is ClientCommand {
    if (typeof data !== 'object' || data === null || !('type' in data)) {
        return false;
    }
    const validTypes = [
        'PLAY', 'PAUSE', 'SKIP', 'SEEK', 'SET_VOLUME', 'TOGGLE_MUTE',
        'ADD_SONG', 'REMOVE_SONG', 'REORDER_QUEUE', 'MOVE_SONG_UP', 'MOVE_SONG_DOWN',
        'SET_DISPLAY_NAME', 'PING',
        'CREATE_COLLECTION', 'DELETE_COLLECTION', 'RENAME_COLLECTION', 'SET_COLLECTION_VISIBILITY',
        'PLAYLIST_ADD', 'PLAYLIST_REMOVE', 'PLAYLIST_TO_QUEUE',
        'IMPORT_COLLECTION'
    ];
    return validTypes.includes((data as any).type);
}

/**
 * Type guard for host broadcasts
 */
export function isHostBroadcast(data: unknown): data is HostBroadcast {
    if (typeof data !== 'object' || data === null || !('type' in data)) {
        return false;
    }
    const validTypes = ['STATE_UPDATE', 'STATE_PATCH', 'ERROR', 'PONG'];
    return validTypes.includes((data as any).type);
}
