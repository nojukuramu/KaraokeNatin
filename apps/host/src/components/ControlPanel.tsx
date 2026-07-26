import { useState, useRef, useEffect, useCallback, useReducer, memo } from 'react';
import type { RefObject } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useFocusable, FocusContext } from '@noriginmedia/norigin-spatial-navigation';
import QRDisplay from './QRDisplay';
import Queue from './Queue';
import { Song, PlaylistCollection } from '../hooks/useRoomState';
import { setHostInputFocused } from '../hooks/useRoomState';
import { saveCollectionToFile, loadCollectionFromFile, getPlaylists, playlistAddSong, playlistCreateCollection, playlistDeleteCollection, playlistRenameCollection, playlistSetVisibility, playlistRemoveSong } from '../lib/commands';
import { addStatusReducer, initialAddStatusState } from './addStatusReducer';
import {
    ChevronLeft, ChevronRight, Users, Search, Plus, Sun, Moon,
    Play, Pause, SkipForward, Music, Trash2, UserPlus,
    Globe, Lock, Pencil, Upload, Download, ChevronDown, ArrowLeft, Star,
    Volume2, VolumeX,
} from 'lucide-react';

interface SearchResult {
    url: string;
    title: string;
    channel: string;
    duration: string;
    thumbnail: string;
}

interface ControlPanelProps {
    connectionUrl: string;
    roomId?: string;
    queue: Song[];
    playlists: PlaylistCollection[];
    connectedClients: number;
    isCollapsed: boolean;
    onToggle: () => void;
    onSearch: (query: string) => void;
    searchResults: SearchResult[];
    searching: boolean;
    onAddToPlaylist: (url: string, collectionId: string) => Promise<void>;
    isPlaying: boolean;
    currentSong: Song | null;
    /** Live player state, used by the transport controls. */
    volume?: number;
    isMuted?: boolean;
    currentTime?: number;
    duration?: number;
    isMobile?: boolean;
    onBack?: () => void;
}

/** mm:ss for the seek bar. Hours are not worth handling for karaoke tracks. */
export function formatClock(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
    const total = Math.floor(seconds);
    const m = Math.floor(total / 60);
    const sec = total % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
}

/** Focusable button wrapper for DPAD navigation */
const FocusableButton = memo(function FocusableButton({ children, onClick, className, style, title, disabled }: {
    children: React.ReactNode;
    onClick?: () => void;
    className?: string;
    style?: React.CSSProperties;
    title?: string;
    disabled?: boolean;
}) {
    const { ref, focused } = useFocusable({
        onEnterPress: () => { if (!disabled && onClick) onClick(); },
    });
    return (
        <button
            ref={ref}
            className={`${className || ''} ${focused ? 'dpad-focused' : ''}`}
            style={style}
            onClick={onClick}
            title={title}
            disabled={disabled}
            tabIndex={0}
        >
            {children}
        </button>
    );
});

/**
 * One search result row: thumbnail, title/meta, and the three "add to…"
 * actions with their collection pickers. Wrapped in React.memo so that,
 * with the handlers below all stable via useCallback, typing in the main
 * search box (searchQuery state) no longer re-renders every row — only
 * the row(s) whose own status/picker props actually changed re-render.
 *
 * Not virtualized (see T28 / REPOMAPPING.md): every button here is a
 * `useFocusable` node the D-pad must be able to reach, and search results
 * are capped by the backend search limit anyway, so the unbounded-list
 * cost this file cares about is the playlist list below, not this one.
 */
const SearchResultRow = memo(function SearchResultRow({
    result,
    isQueueLoading,
    isQueueAdded,
    isPlaylistLoading,
    isPlaylistAdded,
    isLibraryLoading,
    isLibraryAdded,
    playlists,
    localPlaylists,
    pickerOpen,
    libraryPickerOpen,
    pickerRef,
    libraryPickerRef,
    showNewCollection,
    newCollectionName,
    showNewLibraryCollection,
    newLibraryCollectionName,
    onAddToQueue,
    onTogglePicker,
    onToggleLibraryPicker,
    onPickCollection,
    onPickLibraryCollection,
    onShowNewCollection,
    onNewCollectionNameChange,
    onCreateCollection,
    onShowNewLibraryCollection,
    onNewLibraryCollectionNameChange,
    onCreateLibraryCollection,
}: {
    result: SearchResult;
    isQueueLoading: boolean;
    isQueueAdded: boolean;
    isPlaylistLoading: boolean;
    isPlaylistAdded: boolean;
    isLibraryLoading: boolean;
    isLibraryAdded: boolean;
    playlists: PlaylistCollection[];
    localPlaylists: PlaylistCollection[];
    pickerOpen: boolean;
    libraryPickerOpen: boolean;
    pickerRef: RefObject<HTMLDivElement>;
    libraryPickerRef: RefObject<HTMLDivElement>;
    showNewCollection: boolean;
    newCollectionName: string;
    showNewLibraryCollection: boolean;
    newLibraryCollectionName: string;
    onAddToQueue: (url: string) => void;
    onTogglePicker: (url: string) => void;
    onToggleLibraryPicker: (url: string) => void;
    onPickCollection: (url: string, collectionId: string) => void;
    onPickLibraryCollection: (url: string, collectionId: string) => void;
    onShowNewCollection: () => void;
    onNewCollectionNameChange: (value: string) => void;
    onCreateCollection: (url: string) => void;
    onShowNewLibraryCollection: () => void;
    onNewLibraryCollectionNameChange: (value: string) => void;
    onCreateLibraryCollection: (url: string) => void;
}) {
    return (
        <div className="search-result-item">
            <img
                src={result.thumbnail}
                alt=""
                loading="lazy"
                decoding="async"
                width={72}
                height={54}
                className="search-result-thumb"
            />
            <div className="search-result-info">
                <div className="search-result-title">{result.title}</div>
                <div className="search-result-meta">
                    {result.channel} • {result.duration}
                </div>
                <div className="search-result-actions">
                    {/* Add to Queue button */}
                    <FocusableButton
                        className={`btn-sm ${isQueueAdded ? 'btn-success' : 'btn-primary'}`}
                        onClick={() => onAddToQueue(result.url)}
                        disabled={isQueueLoading}
                    >
                        {isQueueLoading ? (
                            <><span className="spinner-tiny"></span> Adding...</>
                        ) : isQueueAdded ? (
                            <>✓ Queued</>
                        ) : (
                            <><Plus size={14} /> Queue</>
                        )}
                    </FocusableButton>

                    {/* Add to Playlist button with picker */}
                    <div className="playlist-picker-wrapper" style={{ position: 'relative' }}>
                        <FocusableButton
                            className={`btn-sm ${isPlaylistAdded ? 'btn-success' : 'btn-secondary'}`}
                            onClick={() => onTogglePicker(result.url)}
                            disabled={isPlaylistLoading}
                        >
                            {isPlaylistLoading ? (
                                <><span className="spinner-tiny"></span> Adding...</>
                            ) : isPlaylistAdded ? (
                                <>✓ Saved</>
                            ) : (
                                <><Music size={14} /> Playlist <ChevronDown size={12} /></>
                            )}
                        </FocusableButton>

                        {pickerOpen && (
                            <div ref={pickerRef} className="collection-picker">
                                <div className="collection-picker-title">Add to Collection</div>
                                {playlists.map(col => (
                                    <button
                                        key={col.id}
                                        className="collection-picker-item"
                                        onClick={() => onPickCollection(result.url, col.id)}
                                    >
                                        <span className={`visibility-dot ${col.visibility}`}></span>
                                        {col.name}
                                        <span className="collection-picker-count">{col.songs.length}</span>
                                    </button>
                                ))}
                                <div className="collection-picker-divider"></div>
                                {showNewCollection ? (
                                    <div className="collection-picker-new">
                                        <input
                                            type="text"
                                            placeholder="Collection name..."
                                            value={newCollectionName}
                                            onChange={(e) => onNewCollectionNameChange(e.target.value)}
                                            onFocus={() => setHostInputFocused(true)}
                                            onBlur={() => setHostInputFocused(false)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    e.preventDefault();
                                                    onCreateCollection(result.url);
                                                }
                                                e.stopPropagation();
                                            }}
                                            autoFocus
                                            className="collection-picker-input"
                                        />
                                        <button className="btn-sm btn-primary" onClick={() => onCreateCollection(result.url)}>
                                            Create
                                        </button>
                                    </div>
                                ) : (
                                    <button
                                        className="collection-picker-item collection-picker-create"
                                        onClick={onShowNewCollection}
                                    >
                                        <Plus size={14} /> New Collection
                                    </button>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Add to Library button with picker */}
                    <div className="playlist-picker-wrapper" style={{ position: 'relative' }}>
                        <FocusableButton
                            className={`btn-sm ${isLibraryAdded ? 'btn-success' : 'btn-secondary'}`}
                            onClick={() => onToggleLibraryPicker(result.url)}
                            disabled={isLibraryLoading}
                        >
                            {isLibraryLoading ? (
                                <><span className="spinner-tiny"></span> Saving...</>
                            ) : isLibraryAdded ? (
                                <>✓ In Library</>
                            ) : (
                                <><Star size={14} /> Library <ChevronDown size={12} /></>
                            )}
                        </FocusableButton>

                        {libraryPickerOpen && (
                            <div ref={libraryPickerRef} className="collection-picker">
                                <div className="collection-picker-title">Save to Library</div>
                                {localPlaylists.map(col => (
                                    <button
                                        key={col.id}
                                        className="collection-picker-item"
                                        onClick={() => onPickLibraryCollection(result.url, col.id)}
                                    >
                                        <span className={`visibility-dot ${col.visibility}`}></span>
                                        {col.name}
                                        <span className="collection-picker-count">{col.songs.length}</span>
                                    </button>
                                ))}
                                <div className="collection-picker-divider"></div>
                                {showNewLibraryCollection ? (
                                    <div className="collection-picker-new">
                                        <input
                                            type="text"
                                            placeholder="Collection name..."
                                            value={newLibraryCollectionName}
                                            onChange={(e) => onNewLibraryCollectionNameChange(e.target.value)}
                                            onFocus={() => setHostInputFocused(true)}
                                            onBlur={() => setHostInputFocused(false)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    e.preventDefault();
                                                    onCreateLibraryCollection(result.url);
                                                }
                                                e.stopPropagation();
                                            }}
                                            autoFocus
                                            className="collection-picker-input"
                                        />
                                        <button className="btn-sm btn-primary" onClick={() => onCreateLibraryCollection(result.url)}>
                                            Create
                                        </button>
                                    </div>
                                ) : (
                                    <button
                                        className="collection-picker-item collection-picker-create"
                                        onClick={onShowNewLibraryCollection}
                                    >
                                        <Plus size={14} /> New Collection
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
});

/**
 * One playlist-collection song row: thumbnail, title, queue/remove
 * actions. Memoized for the same reason as SearchResultRow — this list
 * is not virtualized. Its rows participate in D-pad navigation
 * (`useFocusable` inside FocusableButton, registered with
 * norigin-spatial-navigation), and react-window unmounts rows outside
 * the rendered window; that would deregister their focus nodes and break
 * D-pad traversal past the window edge. See T28 in task.md and
 * REPOMAPPING.md for the fuller reasoning — this component stays
 * unvirtualized on purpose, and React.memo + stable callbacks is the
 * next-best win available without touching focus behavior.
 */
const PlaylistSongRow = memo(function PlaylistSongRow({
    song,
    index,
    onAddToQueue,
    onRemove,
}: {
    song: Song;
    index: number;
    onAddToQueue: (songId: string) => void;
    onRemove: (songId: string) => void;
}) {
    return (
        <div className="playlist-item">
            <span className="playlist-number">{index + 1}</span>
            <img
                src={song.thumbnailUrl}
                alt=""
                loading="lazy"
                decoding="async"
                width={40}
                height={30}
                className="playlist-thumb"
            />
            <div className="playlist-info">
                <div className="playlist-title">{song.title}</div>
            </div>
            <FocusableButton
                className="btn-sm btn-primary"
                onClick={() => onAddToQueue(song.id)}
            >
                <Plus size={14} /> Queue
            </FocusableButton>
            <FocusableButton
                className="playlist-remove-btn"
                onClick={() => onRemove(song.id)}
                title="Remove from playlist"
            >
                <Trash2 size={14} />
            </FocusableButton>
        </div>
    );
});

const ControlPanel = ({
    connectionUrl,
    roomId,
    queue,
    playlists,
    connectedClients,
    isCollapsed,
    onToggle,
    onSearch,
    searchResults,
    searching,
    onAddToPlaylist,
    isPlaying,
    currentSong,
    volume = 80,
    isMuted = false,
    currentTime = 0,
    duration = 0,
    isMobile,
    onBack,
}: ControlPanelProps) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [theme, setTheme] = useState<'dark' | 'light'>('dark');
    const [showInvite, setShowInvite] = useState(false);
    // Per-result loading/success state for the three "add to…" actions.
    // Was six parallel useState<Set<string>> hooks; consolidated into one
    // reducer (see addStatusReducer.ts) so the near-identical
    // start/settle/reset transitions live in one tested place.
    const [addStatus, dispatchAddStatus] = useReducer(addStatusReducer, initialAddStatusState);
    // Local playlists (from PlaylistStore)
    const [localPlaylists, setLocalPlaylists] = useState<PlaylistCollection[]>([]);
    const [libraryPickerOpenFor, setLibraryPickerOpenFor] = useState<string | null>(null);
    // Collection picker state
    const [pickerOpenFor, setPickerOpenFor] = useState<string | null>(null);
    const pickerRef = useRef<HTMLDivElement>(null);
    const libraryPickerRef = useRef<HTMLDivElement>(null);
    // New collection form
    const [showNewCollection, setShowNewCollection] = useState(false);
    const [newCollectionName, setNewCollectionName] = useState('');
    const [showNewLibraryCollection, setShowNewLibraryCollection] = useState(false);
    const [newLibraryCollectionName, setNewLibraryCollectionName] = useState('');
    // Active collection tab in playlist section
    const [activeCollectionId, setActiveCollectionId] = useState<string | null>(null);
    // Collection management
    const [renamingCollectionId, setRenamingCollectionId] = useState<string | null>(null);
    const [renameValue, setRenameValue] = useState('');

    const { ref, focusKey } = useFocusable();

    const loadLocalPlaylists = useCallback(async () => {
        try {
            const playlists = await getPlaylists();
            setLocalPlaylists(playlists);
        } catch (error) {
            console.error('[ControlPanel] Failed to load local playlists:', error);
        }
    }, []);

    // Load local playlists on mount
    useEffect(() => {
        loadLocalPlaylists();
    }, [loadLocalPlaylists]);

    // Close picker on outside click
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
                setPickerOpenFor(null);
                setShowNewCollection(false);
            }
            if (libraryPickerRef.current && !libraryPickerRef.current.contains(e.target as Node)) {
                setLibraryPickerOpenFor(null);
                setShowNewLibraryCollection(false);
            }
        };
        if (pickerOpenFor || libraryPickerOpenFor) {
            document.addEventListener('mousedown', handleClickOutside);
            return () => document.removeEventListener('mousedown', handleClickOutside);
        }
    }, [pickerOpenFor, libraryPickerOpenFor]);

    // Set active collection to first one when local playlists load
    useEffect(() => {
        if (!activeCollectionId && localPlaylists.length > 0) {
            setActiveCollectionId(localPlaylists[0].id);
        }
    }, [localPlaylists, activeCollectionId]);

    const handleSearch = useCallback((e: React.FormEvent) => {
        e.preventDefault();
        if (searchQuery.trim()) {
            dispatchAddStatus({ type: 'RESET' });
            onSearch(searchQuery);
        }
    }, [searchQuery, onSearch]);

    // Sliders need to feel responsive, but authoritative state arrives
    // asynchronously from Rust. Track the in-flight value locally and drop it
    // once the real state catches up.
    const [pendingVolume, setPendingVolume] = useState<number | null>(null);
    const [pendingSeek, setPendingSeek] = useState<number | null>(null);

    useEffect(() => {
        if (pendingVolume !== null && pendingVolume === volume) setPendingVolume(null);
    }, [volume, pendingVolume]);

    const shownVolume = pendingVolume ?? volume;
    const shownTime = pendingSeek ?? currentTime;

    const toggleTheme = useCallback(() => {
        setTheme(prev => {
            const newTheme = prev === 'dark' ? 'light' : 'dark';
            document.documentElement.classList.toggle('light', newTheme === 'light');
            return newTheme;
        });
    }, []);

    const handlePlayPause = useCallback(async () => {
        try {
            await invoke('process_command', {
                command: { type: isPlaying ? 'PAUSE' : 'PLAY' },
            });
        } catch (error) {
            console.error('[ControlPanel] Play/Pause failed:', error);
        }
    }, [isPlaying]);

    const handleSkip = useCallback(async () => {
        try {
            await invoke('process_command', {
                command: { type: 'SKIP' },
            });
        } catch (error) {
            console.error('[ControlPanel] Skip failed:', error);
        }
    }, []);

    // SET_VOLUME / TOGGLE_MUTE / SEEK have existed end to end in the protocol
    // and the Rust command enum since the start, with no UI to reach them.
    const handleVolumeChange = useCallback(async (next: number) => {
        const clamped = Math.max(0, Math.min(100, Math.round(next)));
        setPendingVolume(clamped);
        try {
            await invoke('process_command', {
                command: { type: 'SET_VOLUME', volume: clamped },
            });
        } catch (error) {
            console.error('[ControlPanel] Volume change failed:', error);
        }
    }, []);

    const handleToggleMute = useCallback(async () => {
        try {
            await invoke('process_command', { command: { type: 'TOGGLE_MUTE' } });
        } catch (error) {
            console.error('[ControlPanel] Mute toggle failed:', error);
        }
    }, []);

    const handleSeek = useCallback(async (seconds: number) => {
        setPendingSeek(null);
        try {
            await invoke('process_command', {
                command: { type: 'SEEK', time: Math.max(0, seconds) },
            });
        } catch (error) {
            console.error('[ControlPanel] Seek failed:', error);
        }
    }, []);

    const handleAddToQueue = useCallback(async (url: string) => {
        dispatchAddStatus({ type: 'START', target: 'queue', url });
        let success = false;
        try {
            await invoke('process_command', {
                command: { type: 'ADD_SONG', youtubeUrl: url, addedBy: 'Host' },
            });
            success = true;
        } catch (error) {
            console.error('[ControlPanel] Add to queue failed:', error);
        } finally {
            dispatchAddStatus({ type: 'SETTLE', target: 'queue', url, success });
        }
    }, []);

    const handlePickCollection = useCallback(async (url: string, collectionId: string) => {
        setPickerOpenFor(null);
        dispatchAddStatus({ type: 'START', target: 'playlist', url });
        let success = false;
        try {
            await onAddToPlaylist(url, collectionId);
            success = true;
        } catch (error) {
            console.error('[ControlPanel] Add to playlist failed:', error);
        } finally {
            dispatchAddStatus({ type: 'SETTLE', target: 'playlist', url, success });
        }
    }, [onAddToPlaylist]);

    const handlePickLibraryCollection = useCallback(async (url: string, collectionId: string) => {
        setLibraryPickerOpenFor(null);
        dispatchAddStatus({ type: 'START', target: 'library', url });
        let success = false;
        try {
            await playlistAddSong(url, collectionId, 'Host');
            success = true;
            await loadLocalPlaylists();
        } catch (error) {
            console.error('[ControlPanel] Add to library failed:', error);
        } finally {
            dispatchAddStatus({ type: 'SETTLE', target: 'library', url, success });
        }
    }, [loadLocalPlaylists]);

    // Used by the main "Playlists" section's own "New Collection" button
    // (no thenAddUrl). handleCreateLibraryCollection below is the one the
    // search-result pickers use.
    const handleCreateCollection = useCallback(async (thenAddUrl?: string) => {
        if (!newCollectionName.trim()) return;
        try {
            const newId = await playlistCreateCollection(newCollectionName.trim(), 'personal');
            setNewCollectionName('');
            setShowNewCollection(false);
            await loadLocalPlaylists();

            if (thenAddUrl) {
                await playlistAddSong(thenAddUrl, newId, 'Host');
                await loadLocalPlaylists();
            }
        } catch (error) {
            console.error('[ControlPanel] Create collection failed:', error);
        }
    }, [newCollectionName, loadLocalPlaylists]);

    const handleCreateLibraryCollection = useCallback(async (thenAddUrl?: string) => {
        if (!newLibraryCollectionName.trim()) return;
        try {
            const newId = await playlistCreateCollection(newLibraryCollectionName.trim(), 'personal');
            setNewLibraryCollectionName('');
            setShowNewLibraryCollection(false);
            await loadLocalPlaylists();

            // If we were adding a song, add it to the new collection
            if (thenAddUrl) {
                await handlePickLibraryCollection(thenAddUrl, newId);
            }
            setLibraryPickerOpenFor(null);
        } catch (error) {
            console.error('[ControlPanel] Create library collection failed:', error);
        }
    }, [newLibraryCollectionName, loadLocalPlaylists, handlePickLibraryCollection]);

    const handlePlaylistToQueue = useCallback(async (collectionId: string, songId: string) => {
        try {
            await invoke('process_command', {
                command: { type: 'PLAYLIST_TO_QUEUE', songId, collectionId },
            });
        } catch (error) {
            console.error('[ControlPanel] Playlist to queue failed:', error);
        }
    }, []);

    const handleRemoveFromPlaylist = useCallback(async (collectionId: string, songId: string) => {
        try {
            await playlistRemoveSong(collectionId, songId);
            await loadLocalPlaylists();
        } catch (error) {
            console.error('[ControlPanel] Remove from playlist failed:', error);
        }
    }, [loadLocalPlaylists]);

    const handleDeleteCollection = useCallback(async (collectionId: string) => {
        if (!confirm('Are you sure you want to delete this collection?')) return;
        try {
            await playlistDeleteCollection(collectionId);
            await loadLocalPlaylists();
            setActiveCollectionId(prev => {
                if (prev !== collectionId) return prev;
                const nextCol = localPlaylists.find(c => c.id !== collectionId);
                return nextCol ? nextCol.id : null;
            });
        } catch (error) {
            console.error('[ControlPanel] Delete collection failed:', error);
        }
    }, [loadLocalPlaylists, localPlaylists]);

    const handleRenameCollection = useCallback(async (collectionId: string) => {
        if (!renameValue.trim()) { setRenamingCollectionId(null); return; }
        try {
            await playlistRenameCollection(collectionId, renameValue.trim());
            await loadLocalPlaylists();
        } catch (error) {
            console.error('[ControlPanel] Rename failed:', error);
        } finally {
            setRenamingCollectionId(null);
        }
    }, [renameValue, loadLocalPlaylists]);

    const handleToggleVisibility = useCallback(async (col: PlaylistCollection) => {
        try {
            const newVisibility = col.visibility === 'public' ? 'private' : 'public';
            // playlistSetVisibility's own type is 'public' | 'personal'; 'private'
            // in the UI maps to 'personal' on the wire.
            await playlistSetVisibility(col.id, newVisibility === 'public' ? 'public' : 'personal');
            await loadLocalPlaylists();
        } catch (error) {
            console.error('[ControlPanel] Toggle visibility failed:', error);
        }
    }, [loadLocalPlaylists]);

    const handleSaveToFile = useCallback(async (collectionId: string) => {
        try {
            await saveCollectionToFile(collectionId);
        } catch (error) {
            console.error('[ControlPanel] Save to file failed:', error);
            // invoke throws string errors from Rust, or we might catch other JS errors
            if (typeof error === 'string' && error.includes('cancelled')) return;
            alert('Failed to save file');
        }
    }, []);

    const handleLoadFromFile = useCallback(async () => {
        try {
            await loadCollectionFromFile();
            await loadLocalPlaylists();
        } catch (error) {
            console.error('[ControlPanel] Load from file failed:', error);
            if (typeof error === 'string' && error.includes('cancelled')) return;
            alert('Failed to load file');
        }
    }, [loadLocalPlaylists]);

    // Stable per-row callbacks for the search-result list. Using functional
    // state updates (prev => ...) instead of closing over pickerOpenFor /
    // libraryPickerOpenFor keeps these callback identities fixed across
    // renders, which is what lets SearchResultRow's React.memo actually
    // skip re-rendering rows whose own props didn't change.
    const handleTogglePicker = useCallback((url: string) => {
        setPickerOpenFor(prev => (prev === url ? null : url));
    }, []);

    const handleToggleLibraryPicker = useCallback((url: string) => {
        setLibraryPickerOpenFor(prev => (prev === url ? null : url));
    }, []);

    const handleShowNewCollection = useCallback(() => {
        setShowNewCollection(true);
    }, []);

    const handleShowNewLibraryCollection = useCallback(() => {
        setShowNewLibraryCollection(true);
    }, []);

    const activeCollection = localPlaylists.find(c => c.id === activeCollectionId);
    const totalSongs = localPlaylists.reduce((sum, c) => sum + c.songs.length, 0);

    return (
        <FocusContext.Provider value={focusKey}>
            {/* Toggle Button (desktop only) */}
            {!isMobile && (
                <button
                    className="panel-toggle"
                    onClick={onToggle}
                    style={{
                        right: isCollapsed ? '0px' : 'var(--panel-width)',
                        transition: 'right 0.3s ease'
                    }}
                    tabIndex={0}
                >
                    {isCollapsed ? <ChevronLeft size={20} /> : <ChevronRight size={20} />}
                </button>
            )}

            {/* Panel */}
            <div ref={ref} className={`control-panel ${isCollapsed ? 'collapsed' : ''} ${isMobile ? 'control-panel-mobile' : ''}`}>
                <div className="control-panel-header">
                    <span className="control-panel-title">KaraokeNatin</span>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        {onBack && (
                            <FocusableButton className="btn-icon" onClick={onBack} title="Back to mode selection">
                                <ArrowLeft size={18} />
                            </FocusableButton>
                        )}
                        <FocusableButton className="btn-icon" onClick={toggleTheme}>
                            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
                        </FocusableButton>
                    </div>
                </div>

                <div className="control-panel-content">
                    {/* Invite Section */}
                    <div className="control-panel-section">
                        <FocusableButton
                            onClick={() => setShowInvite(!showInvite)}
                            className="invite-btn"
                            style={{
                                background: showInvite ? 'var(--accent)' : 'var(--bg-tertiary)',
                                color: showInvite ? 'white' : 'var(--text-primary)',
                            }}
                        >
                            <UserPlus size={18} /> Invite Friends
                        </FocusableButton>
                        {showInvite && (
                            <div style={{ marginTop: '12px' }}>
                                <QRDisplay url={connectionUrl} roomId={roomId ?? null} />
                            </div>
                        )}
                    </div>

                    {/* Player Controls */}
                    <div className="control-panel-section">
                        <div className="section-label">Now Playing</div>
                        {currentSong ? (
                            <div className="now-playing-card">
                                <div className="now-playing-title">{currentSong.title}</div>
                                <div className="now-playing-artist">
                                    {currentSong.artist || 'Unknown Artist'}
                                </div>
                            </div>
                        ) : (
                            <div className="now-playing-empty">No song playing</div>
                        )}
                        <div className="player-controls-row">
                            <FocusableButton
                                className="btn-icon btn-accent"
                                onClick={handlePlayPause}
                                title={isPlaying ? 'Pause' : 'Play'}
                            >
                                {isPlaying ? <Pause size={20} /> : <Play size={20} />}
                            </FocusableButton>
                            <FocusableButton
                                className="btn-icon"
                                onClick={handleSkip}
                                title="Skip"
                            >
                                <SkipForward size={20} />
                            </FocusableButton>
                            <FocusableButton
                                className="btn-icon"
                                onClick={handleToggleMute}
                                title={isMuted ? 'Unmute' : 'Mute'}
                            >
                                {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
                            </FocusableButton>
                        </div>

                        {/* Seek bar. Hidden with no song loaded, since seeking
                            nothing is meaningless and the control would just
                            absorb D-pad focus. */}
                        {currentSong && duration > 0 && (
                            <div className="player-seek-row">
                                <span className="player-time">{formatClock(shownTime)}</span>
                                <input
                                    type="range"
                                    className="player-seek"
                                    min={0}
                                    max={Math.max(1, Math.floor(duration))}
                                    value={Math.min(shownTime, duration)}
                                    aria-label="Seek"
                                    onChange={(e) => setPendingSeek(Number(e.target.value))}
                                    onMouseUp={(e) => handleSeek(Number((e.target as HTMLInputElement).value))}
                                    onTouchEnd={(e) => handleSeek(Number((e.target as HTMLInputElement).value))}
                                    onKeyUp={(e) => {
                                        // D-pad / arrow keys commit on release.
                                        if (e.key.startsWith('Arrow')) {
                                            handleSeek(Number((e.target as HTMLInputElement).value));
                                        }
                                    }}
                                />
                                <span className="player-time">{formatClock(duration)}</span>
                            </div>
                        )}

                        <div className="player-volume-row">
                            <Volume2 size={16} className="player-volume-icon" />
                            <input
                                type="range"
                                className="player-volume"
                                min={0}
                                max={100}
                                step={5}
                                value={isMuted ? 0 : shownVolume}
                                aria-label="Volume"
                                onChange={(e) => handleVolumeChange(Number(e.target.value))}
                            />
                            <span className="player-volume-value">
                                {isMuted ? 'Muted' : `${shownVolume}%`}
                            </span>
                        </div>
                    </div>

                    {/* Status */}
                    <div className="control-panel-section">
                        <div className="status-item">
                            <Users size={16} />
                            <span>{connectedClients} connected</span>
                        </div>
                    </div>

                    {/* Search Section */}
                    <div className="control-panel-section">
                        <div className="section-label">Add Songs</div>
                        <form onSubmit={handleSearch} className="search-container">
                            <div className="search-row">
                                <input
                                    type="text"
                                    className="search-input"
                                    placeholder="Search for songs..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    onFocus={() => setHostInputFocused(true)}
                                    onBlur={() => setHostInputFocused(false)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            if (searchQuery.trim()) {
                                                onSearch(searchQuery);
                                            }
                                        }
                                    }}
                                    tabIndex={0}
                                />
                                <FocusableButton className="btn-icon search-btn" onClick={() => handleSearch({ preventDefault: () => { } } as React.FormEvent)}>
                                    <Search size={18} />
                                </FocusableButton>
                            </div>
                        </form>

                        {/* Search Results */}
                        {searching && (
                            <div className="search-loading">
                                <div className="spinner"></div>
                                <p>Searching...</p>
                            </div>
                        )}

                        {!searching && searchResults.length > 0 && (
                            <div className="search-results">
                                {searchResults.map((result) => (
                                    <SearchResultRow
                                        key={result.url}
                                        result={result}
                                        isQueueLoading={addStatus.addingToQueue.has(result.url)}
                                        isQueueAdded={addStatus.addedToQueue.has(result.url)}
                                        isPlaylistLoading={addStatus.addingToPlaylist.has(result.url)}
                                        isPlaylistAdded={addStatus.addedToPlaylist.has(result.url)}
                                        isLibraryLoading={addStatus.addingToLibrary.has(result.url)}
                                        isLibraryAdded={addStatus.addedToLibrary.has(result.url)}
                                        playlists={playlists}
                                        localPlaylists={localPlaylists}
                                        pickerOpen={pickerOpenFor === result.url}
                                        libraryPickerOpen={libraryPickerOpenFor === result.url}
                                        pickerRef={pickerRef}
                                        libraryPickerRef={libraryPickerRef}
                                        showNewCollection={showNewCollection}
                                        newCollectionName={newCollectionName}
                                        showNewLibraryCollection={showNewLibraryCollection}
                                        newLibraryCollectionName={newLibraryCollectionName}
                                        onAddToQueue={handleAddToQueue}
                                        onTogglePicker={handleTogglePicker}
                                        onToggleLibraryPicker={handleToggleLibraryPicker}
                                        onPickCollection={handlePickCollection}
                                        onPickLibraryCollection={handlePickLibraryCollection}
                                        onShowNewCollection={handleShowNewCollection}
                                        onNewCollectionNameChange={setNewCollectionName}
                                        onCreateCollection={handleCreateCollection}
                                        onShowNewLibraryCollection={handleShowNewLibraryCollection}
                                        onNewLibraryCollectionNameChange={setNewLibraryCollectionName}
                                        onCreateLibraryCollection={handleCreateLibraryCollection}
                                    />
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Queue Section */}
                    <div className="control-panel-section">
                        <div className="section-label">Queue ({queue.length})</div>
                        <Queue songs={queue} />
                    </div>

                    {/* Playlist Collections Section */}
                    <div className="control-panel-section">
                        <div className="section-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span><Music size={16} style={{ display: 'inline', verticalAlign: '-2px' }} /> Playlists ({totalSongs})</span>
                            <div style={{ display: 'flex', gap: '4px' }}>
                                <FocusableButton
                                    className="btn-sm btn-secondary"
                                    onClick={handleLoadFromFile}
                                    title="Import playlist file"
                                >
                                    <Download size={13} /> Import
                                </FocusableButton>
                            </div>
                        </div>

                        {/* Collection Tabs */}
                        {localPlaylists.length > 0 && (
                            <div className="collection-tabs">
                                {localPlaylists.map(col => (
                                    <button
                                        key={col.id}
                                        className={`collection-tab ${activeCollectionId === col.id ? 'active' : ''}`}
                                        onClick={() => setActiveCollectionId(col.id)}
                                        title={`${col.name} (${col.visibility})`}
                                    >
                                        <span className={`visibility-dot ${col.visibility}`}></span>
                                        {renamingCollectionId === col.id ? (
                                            <input
                                                className="collection-rename-input"
                                                value={renameValue}
                                                onChange={(e) => setRenameValue(e.target.value)}
                                                onFocus={() => setHostInputFocused(true)}
                                                onBlur={() => { setHostInputFocused(false); handleRenameCollection(col.id); }}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') handleRenameCollection(col.id);
                                                    if (e.key === 'Escape') setRenamingCollectionId(null);
                                                    e.stopPropagation();
                                                }}
                                                autoFocus
                                                onClick={(e) => e.stopPropagation()}
                                            />
                                        ) : (
                                            <span>{col.name} ({col.songs.length})</span>
                                        )}
                                    </button>
                                ))}
                                <button
                                    className="collection-tab collection-tab-add"
                                    onClick={() => {
                                        invoke('process_command', {
                                            command: { type: 'CREATE_COLLECTION', name: 'New Collection', visibility: 'public' },
                                        });
                                    }}
                                    title="Create new collection"
                                >
                                    <Plus size={14} />
                                </button>
                            </div>
                        )}

                        {/* Collection Actions */}
                        {activeCollection && (
                            <div className="collection-actions-bar">
                                <FocusableButton
                                    className="btn-sm btn-secondary"
                                    onClick={() => handleToggleVisibility(activeCollection)}
                                    title={activeCollection.visibility === 'public' ? 'Make personal' : 'Make public'}
                                >
                                    {activeCollection.visibility === 'public' ? <><Globe size={13} /> Public</> : <><Lock size={13} /> Personal</>}
                                </FocusableButton>
                                <FocusableButton
                                    className="btn-sm btn-secondary"
                                    onClick={() => {
                                        setRenamingCollectionId(activeCollection.id);
                                        setRenameValue(activeCollection.name);
                                    }}
                                    title="Rename"
                                >
                                    <Pencil size={13} />
                                </FocusableButton>
                                <FocusableButton
                                    className="btn-sm btn-secondary"
                                    onClick={() => handleSaveToFile(activeCollection.id)}
                                    title="Export to file"
                                >
                                    <Upload size={13} /> Export
                                </FocusableButton>
                                {playlists.length > 1 && (
                                    <FocusableButton
                                        className="btn-sm btn-danger-text"
                                        onClick={() => {
                                            if (confirm(`Delete "${activeCollection.name}"?`)) {
                                                handleDeleteCollection(activeCollection.id);
                                            }
                                        }}
                                        title="Delete collection"
                                    >
                                        <Trash2 size={13} />
                                    </FocusableButton>
                                )}
                            </div>
                        )}

                        {/* Active collection songs */}
                        {!activeCollection || activeCollection.songs.length === 0 ? (
                            <div className="playlist-empty">
                                <p>{localPlaylists.length === 0 ? 'No collections yet' : 'No songs in this collection'}</p>
                                <p className="playlist-empty-hint">Add songs from search results</p>
                            </div>
                        ) : (
                            <div className="playlist-list">
                                {activeCollection.songs.map((song, i) => (
                                    <PlaylistSongRow
                                        key={song.id}
                                        song={song}
                                        index={i}
                                        onAddToQueue={(songId) => handlePlaylistToQueue(activeCollection.id, songId)}
                                        onRemove={(songId) => handleRemoveFromPlaylist(activeCollection.id, songId)}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </FocusContext.Provider >
    );
};

export default ControlPanel;
