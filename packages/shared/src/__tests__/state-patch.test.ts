/**
 * STATE_PATCH merge semantics.
 *
 * The host sends STATE_PATCH for player progress ticks rather than resending
 * the whole room several times a minute. A wrong merge here does not throw —
 * it silently desyncs every guest, which is the worst failure shape available.
 * These tests pin the contract both the host (usePeerHost) and the guest
 * (remote-ui/index.html) implement.
 */
import { describe, it, expect } from 'vitest';
import type { RoomState, PlayerState } from '../room-state';
import type { HostBroadcast } from '../p2p-protocol';
import { isHostBroadcast } from '../p2p-protocol';

/** The merge both clients perform. Shallow by design — see below. */
function applyPatch(state: RoomState, patch: Partial<RoomState>): RoomState {
    return { ...state, ...patch };
}

function player(overrides: Partial<PlayerState> = {}): PlayerState {
    return {
        status: 'playing',
        currentSong: null,
        currentTime: 0,
        duration: 200,
        volume: 80,
        isMuted: false,
        ...overrides,
    };
}

function baseState(): RoomState {
    return {
        roomId: 'room-1',
        hostPeerId: 'peer-host',
        player: player(),
        queue: [
            {
                id: 'song-1',
                youtubeId: 'abc',
                title: 'A Song',
                artist: 'An Artist',
                duration: 200,
                thumbnailUrl: 't',
                addedBy: 'Guest',
                addedAt: 0,
            },
        ],
        playlists: [
            { id: 'c1', name: 'Party', visibility: 'public', songs: [], createdAt: 0, updatedAt: 0 },
        ],
        connectedClients: [],
        createdAt: 0,
        updatedAt: 0,
    };
}

describe('STATE_PATCH merge', () => {
    it('replaces the player subtree', () => {
        const before = baseState();
        const after = applyPatch(before, { player: player({ currentTime: 42 }) });

        expect(after.player.currentTime).toBe(42);
        expect(after.player.status).toBe('playing');
    });

    it('leaves untouched top-level keys alone', () => {
        // This is the property that makes patching player-only safe: a tick
        // must never disturb the queue or collections.
        const before = baseState();
        const after = applyPatch(before, { player: player({ currentTime: 99 }) });

        expect(after.queue).toBe(before.queue);
        expect(after.playlists).toBe(before.playlists);
        expect(after.roomId).toBe('room-1');
    });

    it('does not mutate the previous state object', () => {
        // React and the guest renderer both rely on identity changing to know
        // something happened; mutating in place would break both.
        const before = baseState();
        const snapshot = JSON.stringify(before);
        const after = applyPatch(before, { player: player({ currentTime: 7 }) });

        expect(JSON.stringify(before)).toBe(snapshot);
        expect(after).not.toBe(before);
    });

    it('is shallow — a partial player object would drop sibling fields', () => {
        // Documents why the host sends the *whole* player subtree rather than
        // just the changed field. If someone later patches with a fragment,
        // this is the failure they will get.
        const before = baseState();
        const after = applyPatch(before, {
            player: { currentTime: 5 } as unknown as PlayerState,
        });

        expect(after.player.status).toBeUndefined();
        expect(after.player.volume).toBeUndefined();
    });

    it('an empty patch is a no-op', () => {
        const before = baseState();
        const after = applyPatch(before, {});
        expect(after).toEqual(before);
    });

    it('can patch several top-level keys at once', () => {
        const before = baseState();
        const after = applyPatch(before, { queue: [], player: player({ status: 'paused' }) });

        expect(after.queue).toEqual([]);
        expect(after.player.status).toBe('paused');
        expect(after.playlists).toBe(before.playlists);
    });
});

describe('STATE_PATCH as a protocol message', () => {
    it('is recognised by the host-broadcast guard', () => {
        const msg: HostBroadcast = { type: 'STATE_PATCH', patch: { player: player() } };
        expect(isHostBroadcast(msg)).toBe(true);
    });

    it('is distinguishable from a full update', () => {
        const patch: HostBroadcast = { type: 'STATE_PATCH', patch: {} };
        const full: HostBroadcast = { type: 'STATE_UPDATE', state: baseState() };

        expect(patch.type).not.toBe(full.type);
        // Consumers branch on `type`; both must survive the guard so neither is
        // silently dropped.
        expect(isHostBroadcast(patch) && isHostBroadcast(full)).toBe(true);
    });
});
