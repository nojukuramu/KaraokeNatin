/**
 * Tauri FFI boundary parity.
 *
 * `invoke('name', {args})` is type-checked by neither tsc nor cargo, so a
 * misspelled command or a renamed parameter fails only at runtime. Three such
 * defects existed in this repo simultaneously: two commands that were never
 * registered, and two call sites passing argument names Rust does not declare.
 *
 * This suite reads the frontend and the Rust source and asserts they agree.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../../..');
const HOST_SRC = resolve(repoRoot, 'apps/host/src');
const COMMANDS_RS = resolve(repoRoot, 'apps/host/src-tauri/src/commands.rs');
const LIB_RS = resolve(repoRoot, 'apps/host/src-tauri/src/lib.rs');

function walk(dir: string): string[] {
    return readdirSync(dir).flatMap((entry) => {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) return walk(full);
        return /\.tsx?$/.test(entry) ? [full] : [];
    });
}

const frontendSources = walk(HOST_SRC).map((f) => ({ file: f, text: readFileSync(f, 'utf8') }));
const commandsRs = readFileSync(COMMANDS_RS, 'utf8');
const libRs = readFileSync(LIB_RS, 'utf8');

/** Command names registered in the `generate_handler!` macro. */
function registeredCommands(): string[] {
    const start = libRs.indexOf('generate_handler!');
    expect(start, 'generate_handler! not found in lib.rs').toBeGreaterThan(-1);
    const open = libRs.indexOf('[', start);
    const close = libRs.indexOf(']', open);
    return [...libRs.slice(open, close).matchAll(/commands::(\w+)/g)].map((m) => m[1]);
}

/** Commands defined with #[tauri::command] in commands.rs, with their parameters. */
function definedCommands(): Map<string, string[]> {
    const out = new Map<string, string[]>();
    const re = /#\[tauri::command\]\s*pub\s+(?:async\s+)?fn\s+(\w+)\s*\(([^)]*)\)/g;
    for (const m of commandsRs.matchAll(re)) {
        const [, name, rawParams] = m;
        const params = rawParams
            .split(',')
            .map((p) => p.trim())
            .filter(Boolean)
            // Drop Tauri-injected parameters; they are never sent from JS.
            .filter((p) => !/tauri::State|AppHandle|Window|WebviewWindow/.test(p))
            .map((p) => p.split(':')[0].trim())
            .filter(Boolean);
        out.set(name, params);
    }
    return out;
}

/** Every invoke() call in the frontend, with the literal arg keys it passes. */
function invokeCalls(): { file: string; command: string; args: string[] }[] {
    const calls: { file: string; command: string; args: string[] }[] = [];
    for (const { file, text } of frontendSources) {
        const re = /invoke\s*(?:<[^>]*>)?\s*\(\s*'([a-z_0-9]+)'\s*(,\s*\{)?/g;
        for (const m of text.matchAll(re)) {
            const [full, command, hasArgs] = m;
            let args: string[] = [];
            if (hasArgs) {
                // Read the balanced object literal that follows.
                const objStart = m.index! + full.length - 1;
                let depth = 0;
                let end = objStart;
                for (let i = objStart; i < text.length; i++) {
                    if (text[i] === '{') depth++;
                    else if (text[i] === '}') {
                        depth--;
                        if (depth === 0) { end = i; break; }
                    }
                }
                const body = text.slice(objStart + 1, end);
                // Top-level keys only; skip nested object contents.
                let nest = 0;
                for (const line of body.split('\n')) {
                    const trimmed = line.trim();
                    if (nest === 0) {
                        const km = trimmed.match(/^(\w+)\s*[:,]/) ?? trimmed.match(/^(\w+)\s*$/);
                        if (km) args.push(km[1]);
                    }
                    for (const ch of line) {
                        if (ch === '{' || ch === '[') nest++;
                        else if (ch === '}' || ch === ']') nest--;
                    }
                }
            }
            calls.push({ file: file.replace(repoRoot + '/', ''), command, args });
        }
    }
    return calls;
}

const registered = registeredCommands();
const defined = definedCommands();
const calls = invokeCalls();

describe('Tauri command registration', () => {
    it('parses a plausible set of commands and call sites', () => {
        expect(registered.length).toBeGreaterThan(15);
        expect(defined.size).toBeGreaterThan(15);
        expect(calls.length).toBeGreaterThan(15);
    });

    it('every #[tauri::command] is registered in generate_handler!', () => {
        const unregistered = [...defined.keys()].filter((c) => !registered.includes(c));
        expect(
            unregistered,
            `defined but not registered (they will fail at runtime): ${unregistered.join(', ')}`
        ).toEqual([]);
    });

    it('every registered command is actually defined', () => {
        const undefined_ = registered.filter((c) => !defined.has(c));
        expect(undefined_, `registered but not defined: ${undefined_.join(', ')}`).toEqual([]);
    });
});

describe('invoke() call sites', () => {
    it('every invoked command exists in the Rust backend', () => {
        const bad = calls.filter((c) => !defined.has(c.command));
        const detail = bad.map((c) => `${c.command} (${c.file})`).join(', ');
        expect(bad.map((c) => c.command), `invoked but not defined in Rust: ${detail}`).toEqual([]);
    });

    it('every argument name matches a declared Rust parameter', () => {
        const problems: string[] = [];
        for (const call of calls) {
            const params = defined.get(call.command);
            if (!params) continue; // covered by the previous test
            // Tauri maps camelCase JS keys onto snake_case Rust parameters.
            const snake = (s: string) => s.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase());
            for (const arg of call.args) {
                if (!params.includes(snake(arg)) && !params.includes(arg)) {
                    problems.push(
                        `${call.file}: invoke('${call.command}') passes '${arg}', ` +
                        `but Rust declares [${params.join(', ')}]`
                    );
                }
            }
        }
        expect(problems, problems.join('\n')).toEqual([]);
    });
});
