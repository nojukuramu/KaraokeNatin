/**
 * Cross-language protocol parity.
 *
 * The wire protocol is implemented three times: the TypeScript union in
 * p2p-protocol.ts, the Rust `ClientCommand` enum in commands.rs, and the vanilla
 * JS in remote-ui/index.html. Only the first is type-checked, so the other two
 * drift silently. This suite reads the Rust source and the guest UI and asserts
 * they agree with the TypeScript definitions.
 *
 * This is the test that would have caught SEARCH/SEARCH_RESULTS travelling
 * out-of-band, and MOVE_SONG_TO_TOP/BOTTOM existing only in Rust.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    CLIENT_COMMAND_TYPES,
    CLIENT_REQUEST_TYPES,
    HOST_BROADCAST_TYPES,
} from '../p2p-protocol';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../../..');
const COMMANDS_RS = resolve(repoRoot, 'apps/host/src-tauri/src/commands.rs');
const REMOTE_UI = resolve(repoRoot, 'apps/host/src-tauri/remote-ui/index.html');

/** Extract the variant names of the Rust `pub enum ClientCommand { ... }` block. */
function rustClientCommandVariants(source: string): string[] {
    const start = source.indexOf('pub enum ClientCommand');
    expect(start, 'ClientCommand enum not found in commands.rs').toBeGreaterThan(-1);

    const open = source.indexOf('{', start);
    let depth = 0;
    let end = -1;
    for (let i = open; i < source.length; i++) {
        if (source[i] === '{') depth++;
        else if (source[i] === '}') {
            depth--;
            if (depth === 0) { end = i; break; }
        }
    }
    expect(end, 'unbalanced braces in ClientCommand enum').toBeGreaterThan(-1);

    const body = source.slice(open + 1, end);

    // Walk the top level of the enum body, collecting identifiers that start a
    // variant. Nested braces (struct-style variants) and attributes are skipped.
    const variants: string[] = [];
    let nesting = 0;
    for (const rawLine of body.split('\n')) {
        const line = rawLine.trim();
        if (nesting === 0 && line && !line.startsWith('//') && !line.startsWith('#[')) {
            const m = line.match(/^([A-Z][A-Z0-9_]*)\s*[,{]?/);
            if (m) variants.push(m[1]);
        }
        for (const ch of rawLine) {
            if (ch === '{') nesting++;
            else if (ch === '}') nesting--;
        }
    }
    return variants;
}

/** Collect `type: 'FOO'` literals the guest UI actually sends. */
function remoteUiSentTypes(source: string): string[] {
    return [...new Set(
        [...source.matchAll(/type:\s*'([A-Z][A-Z0-9_]*)'/g)].map((m) => m[1])
    )];
}

describe('Rust <-> TypeScript command parity', () => {
    const rustSource = readFileSync(COMMANDS_RS, 'utf8');
    const rustVariants = rustClientCommandVariants(rustSource);

    it('parses a plausible set of Rust variants', () => {
        // Guard against the parser silently returning nothing and the suite
        // then passing vacuously.
        expect(rustVariants.length).toBeGreaterThan(15);
        expect(rustVariants).toContain('PLAY');
        expect(rustVariants).toContain('IMPORT_COLLECTION');
    });

    it('every Rust ClientCommand variant exists in the TypeScript union', () => {
        const missing = rustVariants.filter(
            (v) => !(CLIENT_COMMAND_TYPES as readonly string[]).includes(v)
        );
        expect(missing, `Rust variants absent from ClientCommand: ${missing.join(', ')}`).toEqual([]);
    });

    it('every TypeScript ClientCommand exists as a Rust variant', () => {
        const missing = (CLIENT_COMMAND_TYPES as readonly string[]).filter(
            (t) => !rustVariants.includes(t)
        );
        expect(missing, `ClientCommand types absent from Rust: ${missing.join(', ')}`).toEqual([]);
    });

    it('client requests are deliberately absent from Rust', () => {
        // SEARCH is handled in the host frontend, not forwarded to process_command.
        // If someone adds it to the Rust enum, this test says so rather than
        // leaving two divergent handlers.
        for (const t of CLIENT_REQUEST_TYPES as readonly string[]) {
            expect(
                rustVariants.includes(t),
                `${t} is a ClientRequest but now also exists in Rust; pick one owner`
            ).toBe(false);
        }
    });
});

describe('remote-ui <-> TypeScript parity', () => {
    const html = readFileSync(REMOTE_UI, 'utf8');
    const sent = remoteUiSentTypes(html);

    // Messages the guest UI exchanges with its own host-app iframe bridge over
    // postMessage. These are not part of the P2P wire protocol.
    const BRIDGE_TYPES = new Set([
        'CREATE_LOCAL_COLLECTION',
        'ADD_TO_LOCAL_PLAYLIST',
        'REMOVE_FROM_LOCAL_PLAYLIST',
        'EXPORT_LOCAL_PLAYLIST',
        'IMPORT_LOCAL_PLAYLIST',
        'REQUEST_LOCAL_PLAYLISTS',
        'LOCAL_PLAYLISTS_UPDATED',
    ]);

    it('parses a plausible set of message types', () => {
        expect(sent.length).toBeGreaterThan(5);
    });

    it('every protocol message remote-ui sends is declared in shared types', () => {
        const known = new Set<string>([
            ...(CLIENT_COMMAND_TYPES as readonly string[]),
            ...(CLIENT_REQUEST_TYPES as readonly string[]),
            ...(HOST_BROADCAST_TYPES as readonly string[]),
        ]);
        const undeclared = sent.filter((t) => !known.has(t) && !BRIDGE_TYPES.has(t));
        expect(
            undeclared,
            `remote-ui sends message types absent from packages/shared: ${undeclared.join(', ')}`
        ).toEqual([]);
    });
});
