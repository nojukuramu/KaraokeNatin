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
    | { type: 'ADD_SONG'; youtubeUrl: string; addedBy?: string }
    | { type: 'REMOVE_SONG'; songId: string }
    | { type: 'REORDER_QUEUE'; songId: string; newIndex: number }
    | { type: 'MOVE_SONG_UP'; songId: string }
    | { type: 'MOVE_SONG_DOWN'; songId: string }
    | { type: 'MOVE_SONG_TO_TOP'; songId: string }
    | { type: 'MOVE_SONG_TO_BOTTOM'; songId: string }
    | { type: 'SET_DISPLAY_NAME'; name: string }
    | { type: 'PING' }
    // Collection management commands
    | { type: 'CREATE_COLLECTION'; name: string; visibility: CollectionVisibility }
    | { type: 'DELETE_COLLECTION'; collectionId: string }
    | { type: 'RENAME_COLLECTION'; collectionId: string; name: string }
    | { type: 'SET_COLLECTION_VISIBILITY'; collectionId: string; visibility: CollectionVisibility }
    // Playlist commands (now scoped to collection)
    | { type: 'PLAYLIST_ADD'; youtubeUrl: string; collectionId: string; addedBy?: string }
    | { type: 'PLAYLIST_REMOVE'; songId: string; collectionId: string }
    | { type: 'PLAYLIST_TO_QUEUE'; songId: string; collectionId: string }
    // Import collection
    | { type: 'IMPORT_COLLECTION'; data: string };

/**
 * Search is handled by the host frontend directly (it owns the Tauri `search_youtube`
 * command) rather than being forwarded to the Rust `process_command` handler, so it
 * has no counterpart in the Rust `ClientCommand` enum. It is still part of the wire
 * protocol and belongs in this union — see `usePeerHost.ts` for the handler.
 */
export type ClientRequest =
    | { type: 'SEARCH'; query: string };

/** Every message a client may send over the data channel. */
export type ClientMessage = ClientCommand | ClientRequest;

/**
 * Broadcasts sent from Host -> Clients
 */
export type HostBroadcast =
    | { type: 'STATE_UPDATE'; state: RoomState }
    | { type: 'STATE_PATCH'; patch: Partial<RoomState> }
    | { type: 'ERROR'; code: string; message: string }
    | { type: 'PONG'; serverTime: number }
    | { type: 'SEARCH_RESULTS'; results: SearchResult[] };

/** A single YouTube search result, as returned by the host's `search_youtube`. */
export interface SearchResult {
    id: string;
    title: string;
    artist?: string;
    thumbnail?: string;
    duration?: number;
    url?: string;
}

/**
 * Type guard for client commands
 */
export const CLIENT_COMMAND_TYPES = [
    'PLAY', 'PAUSE', 'SKIP', 'SEEK', 'SET_VOLUME', 'TOGGLE_MUTE',
    'ADD_SONG', 'REMOVE_SONG', 'REORDER_QUEUE', 'MOVE_SONG_UP', 'MOVE_SONG_DOWN',
    'MOVE_SONG_TO_TOP', 'MOVE_SONG_TO_BOTTOM',
    'SET_DISPLAY_NAME', 'PING',
    'CREATE_COLLECTION', 'DELETE_COLLECTION', 'RENAME_COLLECTION', 'SET_COLLECTION_VISIBILITY',
    'PLAYLIST_ADD', 'PLAYLIST_REMOVE', 'PLAYLIST_TO_QUEUE',
    'IMPORT_COLLECTION'
] as const satisfies readonly ClientCommand['type'][];

export const CLIENT_REQUEST_TYPES = ['SEARCH'] as const satisfies readonly ClientRequest['type'][];

export const HOST_BROADCAST_TYPES = [
    'STATE_UPDATE', 'STATE_PATCH', 'ERROR', 'PONG', 'SEARCH_RESULTS'
] as const satisfies readonly HostBroadcast['type'][];

/**
 * Compile-time completeness guards.
 *
 * `satisfies` above already rejects an entry that is not a real message type.
 * These reject the opposite mistake: a union member that nobody added to the
 * runtime list. Adding a message to the union without listing it here fails
 * the build rather than silently failing the type guard at runtime.
 */
type AssertNever<T extends never> = T;
export type _CommandListComplete = AssertNever<
    Exclude<ClientCommand['type'], (typeof CLIENT_COMMAND_TYPES)[number]>
>;
export type _RequestListComplete = AssertNever<
    Exclude<ClientRequest['type'], (typeof CLIENT_REQUEST_TYPES)[number]>
>;
export type _BroadcastListComplete = AssertNever<
    Exclude<HostBroadcast['type'], (typeof HOST_BROADCAST_TYPES)[number]>
>;

/**
 * Own-property check. `'type' in data` walks the prototype chain, which lets a
 * crafted object satisfy the guard without carrying the field itself.
 */
function ownType(data: unknown): string | undefined {
    if (typeof data !== 'object' || data === null) return undefined;
    if (!Object.prototype.hasOwnProperty.call(data, 'type')) return undefined;
    const t = (data as { type: unknown }).type;
    return typeof t === 'string' ? t : undefined;
}

export function isClientCommand(data: unknown): data is ClientCommand {
    const t = ownType(data);
    return t !== undefined && (CLIENT_COMMAND_TYPES as readonly string[]).includes(t);
}

/** Type guard for non-command client requests (currently just SEARCH). */
export function isClientRequest(data: unknown): data is ClientRequest {
    const t = ownType(data);
    return t !== undefined && (CLIENT_REQUEST_TYPES as readonly string[]).includes(t);
}

/**
 * Type guard for host broadcasts
 */
export function isHostBroadcast(data: unknown): data is HostBroadcast {
    const t = ownType(data);
    return t !== undefined && (HOST_BROADCAST_TYPES as readonly string[]).includes(t);
}
