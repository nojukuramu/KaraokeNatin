/**
 * ControlPanel tracks three independent "add this search result to X"
 * actions (queue, playlist, library), each with its own in-flight and
 * settled indicator. That used to be six parallel `useState<Set<string>>`
 * hooks (addingToQueue/addedToQueue/addingToPlaylist/addedToPlaylist/
 * addingToLibrary/addedToLibrary) updated in lockstep from three near-
 * identical try/catch/finally handlers. Consolidated here into one
 * reducer so the six-way duplication lives in one place and is testable
 * without mounting a component.
 */

export type AddTarget = 'queue' | 'playlist' | 'library';

export interface AddStatusState {
    addingToQueue: Set<string>;
    addedToQueue: Set<string>;
    addingToPlaylist: Set<string>;
    addedToPlaylist: Set<string>;
    addingToLibrary: Set<string>;
    addedToLibrary: Set<string>;
}

export type AddStatusAction =
    /** A url has started an add-to-<target> request. */
    | { type: 'START'; target: AddTarget; url: string }
    /** The in-flight request for a url finished; marks it added on success. */
    | { type: 'SETTLE'; target: AddTarget; url: string; success: boolean }
    /** New search results arrived — clear all per-result status. */
    | { type: 'RESET' };

export const initialAddStatusState: AddStatusState = {
    addingToQueue: new Set(),
    addedToQueue: new Set(),
    addingToPlaylist: new Set(),
    addedToPlaylist: new Set(),
    addingToLibrary: new Set(),
    addedToLibrary: new Set(),
};

const ADDING_KEY: Record<AddTarget, 'addingToQueue' | 'addingToPlaylist' | 'addingToLibrary'> = {
    queue: 'addingToQueue',
    playlist: 'addingToPlaylist',
    library: 'addingToLibrary',
};

const ADDED_KEY: Record<AddTarget, 'addedToQueue' | 'addedToPlaylist' | 'addedToLibrary'> = {
    queue: 'addedToQueue',
    playlist: 'addedToPlaylist',
    library: 'addedToLibrary',
};

function withValue(set: Set<string>, url: string): Set<string> {
    if (set.has(url)) return set;
    const next = new Set(set);
    next.add(url);
    return next;
}

function withoutValue(set: Set<string>, url: string): Set<string> {
    if (!set.has(url)) return set;
    const next = new Set(set);
    next.delete(url);
    return next;
}

export function addStatusReducer(state: AddStatusState, action: AddStatusAction): AddStatusState {
    switch (action.type) {
        case 'START': {
            const key = ADDING_KEY[action.target];
            const next = withValue(state[key], action.url);
            if (next === state[key]) return state;
            return { ...state, [key]: next };
        }
        case 'SETTLE': {
            const addingKey = ADDING_KEY[action.target];
            const addedKey = ADDED_KEY[action.target];
            const nextAdding = withoutValue(state[addingKey], action.url);
            const nextAdded = action.success ? withValue(state[addedKey], action.url) : state[addedKey];
            if (nextAdding === state[addingKey] && nextAdded === state[addedKey]) return state;
            return { ...state, [addingKey]: nextAdding, [addedKey]: nextAdded };
        }
        case 'RESET':
            return initialAddStatusState;
        default:
            return state;
    }
}
