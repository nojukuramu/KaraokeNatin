import { describe, it, expect } from 'vitest';
import { addStatusReducer, initialAddStatusState, type AddStatusState } from '../addStatusReducer';

const url = 'https://youtube.com/watch?v=abc';
const otherUrl = 'https://youtube.com/watch?v=xyz';

describe('addStatusReducer', () => {
    it('starts empty', () => {
        expect(initialAddStatusState.addingToQueue.size).toBe(0);
        expect(initialAddStatusState.addedToQueue.size).toBe(0);
        expect(initialAddStatusState.addingToPlaylist.size).toBe(0);
        expect(initialAddStatusState.addedToPlaylist.size).toBe(0);
        expect(initialAddStatusState.addingToLibrary.size).toBe(0);
        expect(initialAddStatusState.addedToLibrary.size).toBe(0);
    });

    it('START marks only the targeted set as in-flight', () => {
        const state = addStatusReducer(initialAddStatusState, { type: 'START', target: 'queue', url });
        expect(state.addingToQueue.has(url)).toBe(true);
        expect(state.addedToQueue.has(url)).toBe(false);
        // The other four sets are untouched.
        expect(state.addingToPlaylist.size).toBe(0);
        expect(state.addingToLibrary.size).toBe(0);
        expect(state.addedToPlaylist.size).toBe(0);
        expect(state.addedToLibrary.size).toBe(0);
    });

    it('SETTLE with success=true moves a url from adding to added', () => {
        let state = addStatusReducer(initialAddStatusState, { type: 'START', target: 'library', url });
        state = addStatusReducer(state, { type: 'SETTLE', target: 'library', url, success: true });
        expect(state.addingToLibrary.has(url)).toBe(false);
        expect(state.addedToLibrary.has(url)).toBe(true);
    });

    it('SETTLE with success=false clears the in-flight flag without marking added', () => {
        let state = addStatusReducer(initialAddStatusState, { type: 'START', target: 'playlist', url });
        state = addStatusReducer(state, { type: 'SETTLE', target: 'playlist', url, success: false });
        expect(state.addingToPlaylist.has(url)).toBe(false);
        expect(state.addedToPlaylist.has(url)).toBe(false);
    });

    it('the three targets are independent for the same url', () => {
        let state = initialAddStatusState;
        state = addStatusReducer(state, { type: 'START', target: 'queue', url });
        state = addStatusReducer(state, { type: 'START', target: 'playlist', url });
        state = addStatusReducer(state, { type: 'SETTLE', target: 'queue', url, success: true });

        expect(state.addedToQueue.has(url)).toBe(true);
        // Playlist add for the same url is still in flight and not added.
        expect(state.addingToPlaylist.has(url)).toBe(true);
        expect(state.addedToPlaylist.has(url)).toBe(false);
    });

    it('tracks multiple urls independently within one target', () => {
        let state = addStatusReducer(initialAddStatusState, { type: 'START', target: 'queue', url });
        state = addStatusReducer(state, { type: 'START', target: 'queue', url: otherUrl });
        state = addStatusReducer(state, { type: 'SETTLE', target: 'queue', url, success: true });

        expect(state.addedToQueue.has(url)).toBe(true);
        expect(state.addingToQueue.has(otherUrl)).toBe(true);
        expect(state.addedToQueue.has(otherUrl)).toBe(false);
    });

    it('RESET clears all six sets regardless of prior state', () => {
        let state = addStatusReducer(initialAddStatusState, { type: 'START', target: 'queue', url });
        state = addStatusReducer(state, { type: 'SETTLE', target: 'queue', url, success: true });
        state = addStatusReducer(state, { type: 'START', target: 'library', url: otherUrl });

        state = addStatusReducer(state, { type: 'RESET' });

        expect(state).toEqual(initialAddStatusState);
    });

    it('is referentially stable (no-op) when nothing actually changes', () => {
        // Settling a url that was never started should not allocate new Sets.
        const state: AddStatusState = initialAddStatusState;
        const next = addStatusReducer(state, { type: 'SETTLE', target: 'queue', url, success: false });
        expect(next).toBe(state);
    });

    it('does not mutate the previous state object (immutability)', () => {
        const before = initialAddStatusState;
        const beforeQueueSet = before.addingToQueue;
        addStatusReducer(before, { type: 'START', target: 'queue', url });
        expect(before.addingToQueue).toBe(beforeQueueSet);
        expect(before.addingToQueue.has(url)).toBe(false);
    });
});
