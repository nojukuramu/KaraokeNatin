/**
 * Type-guard behaviour for the P2P protocol.
 *
 * These guards are the only validation applied to messages arriving over the
 * WebRTC data channel from an untrusted guest, so their failure modes matter.
 */
import { describe, it, expect } from 'vitest';
import {
    isClientCommand,
    isClientRequest,
    isHostBroadcast,
    CLIENT_COMMAND_TYPES,
    CLIENT_REQUEST_TYPES,
    HOST_BROADCAST_TYPES,
    type ClientCommand,
    type HostBroadcast,
} from '../p2p-protocol';

describe('isClientCommand', () => {
    it('accepts every declared command type', () => {
        for (const type of CLIENT_COMMAND_TYPES) {
            expect(isClientCommand({ type }), `${type} should be accepted`).toBe(true);
        }
    });

    it('rejects requests and broadcasts', () => {
        for (const type of CLIENT_REQUEST_TYPES) {
            expect(isClientCommand({ type }), `${type} is a request, not a command`).toBe(false);
        }
        for (const type of HOST_BROADCAST_TYPES) {
            expect(isClientCommand({ type }), `${type} is a broadcast, not a command`).toBe(false);
        }
    });

    it('rejects malformed input without throwing', () => {
        const junk: unknown[] = [
            null, undefined, 0, 1, '', 'PLAY', [], {},
            { notType: 'PLAY' },
            { type: null },
            { type: 42 },
            { type: 'NOT_A_REAL_COMMAND' },
            { type: 'play' },          // case-sensitive
            { type: ' PLAY' },         // no trimming
        ];
        for (const value of junk) {
            expect(() => isClientCommand(value)).not.toThrow();
            expect(isClientCommand(value), `${JSON.stringify(value)} should be rejected`).toBe(false);
        }
    });

    it('does not inherit matches from the prototype chain', () => {
        // `'type' in data` walks the prototype chain; make sure a crafted object
        // cannot smuggle a type through it.
        const crafted = Object.create({ type: 'PLAY' });
        expect(isClientCommand(crafted)).toBe(false);
    });

    it('narrows the type for downstream consumers', () => {
        const msg: unknown = { type: 'SEEK', time: 42 };
        if (isClientCommand(msg)) {
            const cmd: ClientCommand = msg;
            expect(cmd.type).toBe('SEEK');
        } else {
            throw new Error('expected SEEK to be recognised');
        }
    });
});

describe('isClientRequest', () => {
    it('accepts SEARCH and nothing from the command union', () => {
        expect(isClientRequest({ type: 'SEARCH', query: 'test' })).toBe(true);
        for (const type of CLIENT_COMMAND_TYPES) {
            expect(isClientRequest({ type })).toBe(false);
        }
    });
});

describe('isHostBroadcast', () => {
    it('accepts every declared broadcast type', () => {
        for (const type of HOST_BROADCAST_TYPES) {
            expect(isHostBroadcast({ type }), `${type} should be accepted`).toBe(true);
        }
    });

    it('rejects client messages', () => {
        for (const type of CLIENT_COMMAND_TYPES) {
            expect(isHostBroadcast({ type })).toBe(false);
        }
    });

    it('narrows the type for downstream consumers', () => {
        const msg: unknown = { type: 'SEARCH_RESULTS', results: [] };
        if (isHostBroadcast(msg)) {
            const b: HostBroadcast = msg;
            expect(b.type).toBe('SEARCH_RESULTS');
        } else {
            throw new Error('expected SEARCH_RESULTS to be recognised');
        }
    });
});

describe('declared type lists', () => {
    it('contain no duplicates', () => {
        for (const [name, list] of [
            ['CLIENT_COMMAND_TYPES', CLIENT_COMMAND_TYPES],
            ['CLIENT_REQUEST_TYPES', CLIENT_REQUEST_TYPES],
            ['HOST_BROADCAST_TYPES', HOST_BROADCAST_TYPES],
        ] as const) {
            expect(new Set(list).size, `${name} has duplicates`).toBe(list.length);
        }
    });

    it('do not overlap with each other', () => {
        const commands = new Set<string>(CLIENT_COMMAND_TYPES);
        for (const t of CLIENT_REQUEST_TYPES) expect(commands.has(t)).toBe(false);
        for (const t of HOST_BROADCAST_TYPES) expect(commands.has(t)).toBe(false);
    });
});
