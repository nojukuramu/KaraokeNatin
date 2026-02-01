import { invoke } from '@tauri-apps/api/core';
import { RoomState, ClientCommand } from '@karaokenatin/shared';

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

export async function fetchSongMetadata(youtubeUrl: string): Promise<{
    title: string;
    artist: string;
    duration: number;
    thumbnailUrl: string;
    youtubeId: string;
}> {
    return await invoke('fetch_song_metadata', { youtubeUrl });
}

export async function updatePlayerState(state: {
    status?: string;
    currentTime?: number;
    duration?: number;
}): Promise<void> {
    return await invoke('update_player_state', { state });
}
