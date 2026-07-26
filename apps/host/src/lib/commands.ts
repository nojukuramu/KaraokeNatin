import { invoke } from '@tauri-apps/api/core';
import { RoomState, ClientCommand, PlaylistCollection } from '@karaokenatin/shared';

/**
 * Tauri command wrappers for Rust backend
 */

export async function createRoom(): Promise<{ roomId: string; joinToken: string }> {
    return await invoke('create_room');
}

export async function getRoomState(): Promise<RoomState> {
    return await invoke('get_room_state');
}

export async function processCommand(command: ClientCommand): Promise<void> {
    return await invoke('process_command', { command });
}

/**
 * Mirrors `update_player_state(status, current_time, duration)` in commands.rs.
 * Tauri maps these camelCase keys onto the snake_case Rust parameters; they are
 * passed flat, not nested under a `state` object.
 */
export async function updatePlayerState(state: {
    status?: string;
    currentTime?: number;
    duration?: number;
}): Promise<void> {
    return await invoke('update_player_state', {
        status: state.status,
        currentTime: state.currentTime,
        duration: state.duration,
    });
}

export async function exportCollection(collectionId: string): Promise<string> {
    return await invoke('export_collection', { collectionId });
}

// ============================================================
// Standalone playlist commands (available in all modes)
// ============================================================

export async function getPlaylists(): Promise<PlaylistCollection[]> {
    return await invoke('get_playlists');
}

export async function playlistCreateCollection(
    name: string,
    visibility?: 'public' | 'personal',
): Promise<string> {
    return await invoke('playlist_create_collection', { name, visibility });
}

export async function playlistDeleteCollection(collectionId: string): Promise<void> {
    return await invoke('playlist_delete_collection', { collectionId });
}

export async function playlistRenameCollection(collectionId: string, name: string): Promise<void> {
    return await invoke('playlist_rename_collection', { collectionId, name });
}

export async function playlistSetVisibility(
    collectionId: string,
    visibility: 'public' | 'personal',
): Promise<void> {
    return await invoke('playlist_set_visibility', { collectionId, visibility });
}

export async function playlistAddSong(
    youtubeUrl: string,
    collectionId: string,
    addedBy?: string,
): Promise<void> {
    return await invoke('playlist_add_song', { youtubeUrl, collectionId, addedBy });
}

export async function playlistRemoveSong(collectionId: string, songId: string): Promise<void> {
    return await invoke('playlist_remove_song', { collectionId, songId });
}

export async function playlistImportCollection(data: string): Promise<string> {
    return await invoke('playlist_import_collection', { data });
}

export async function saveCollectionToFile(collectionId: string): Promise<void> {
    return await invoke('save_collection_to_file', { collectionId });
}

export async function loadCollectionFromFile(): Promise<string> {
    return await invoke('load_collection_from_file');
}

// ============================================================
// Lazy host server start
// ============================================================

export async function startHostServer(): Promise<number> {
    return await invoke('start_host_server');
}
