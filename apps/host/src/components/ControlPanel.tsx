import { useState, useRef, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useFocusable, FocusContext } from '@noriginmedia/norigin-spatial-navigation';
import QRDisplay from './QRDisplay';
import Queue from './Queue';
import { Song, PlaylistCollection } from '../hooks/useRoomState';
import { setHostInputFocused } from '../hooks/useRoomState';
import { saveCollectionToFile, loadCollectionFromFile, getPlaylists, playlistAddSong, playlistCreateCollection, playlistDeleteCollection, playlistRenameCollection, playlistSetVisibility, playlistRemoveSong } from '../lib/commands';
import {
    ChevronLeft, ChevronRight, Users, Search, Plus, Sun, Moon,
    Play, Pause, SkipForward, Music, Trash2, UserPlus,
    Globe, Lock, Pencil, Upload, Download, ChevronDown, ArrowLeft, Star,
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
    isMobile?: boolean;
    onBack?: () => void;
}

/** Focusable button wrapper for DPAD navigation */
const FocusableButton = ({ children, onClick, className, style, title, disabled }: {
    children: React.ReactNode;
    onClick?: () => void;
    className?: string;
    style?: React.CSSProperties;
    title?: string;
    disabled?: boolean;
}) => {
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
};

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
    isMobile,
    onBack,
}: ControlPanelProps) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [theme, setTheme] = useState<'dark' | 'light'>('dark');
    const [showInvite, setShowInvite] = useState(false);
    // Per-result loading/success state
    const [addingToQueue, setAddingToQueue] = useState<Set<string>>(new Set());
    const [addedToQueue, setAddedToQueue] = useState<Set<string>>(new Set());
    const [addingToPlaylist, setAddingToPlaylist] = useState<Set<string>>(new Set());
    const [addedToPlaylist, setAddedToPlaylist] = useState<Set<string>>(new Set());
    // Local playlists (from PlaylistStore)
    const [localPlaylists, setLocalPlaylists] = useState<PlaylistCollection[]>([]);
    const [libraryPickerOpenFor, setLibraryPickerOpenFor] = useState<string | null>(null);
    const [addingToLibrary, setAddingToLibrary] = useState<Set<string>>(new Set());
    const [addedToLibrary, setAddedToLibrary] = useState<Set<string>>(new Set());
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

    // Load local playlists on mount
    useEffect(() => {
        loadLocalPlaylists();
    }, []);

    const loadLocalPlaylists = async () => {
        try {
            const playlists = await getPlaylists();
            setLocalPlaylists(playlists);
        } catch (error) {
            console.error('[ControlPanel] Failed to load local playlists:', error);
        }
    };

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

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        if (searchQuery.trim()) {
            // Clear previous result states
            setAddingToQueue(new Set());
            setAddedToQueue(new Set());
            setAddingToPlaylist(new Set());
            setAddedToPlaylist(new Set());
            setAddingToLibrary(new Set());
            setAddedToLibrary(new Set());
            onSearch(searchQuery);
        }
    };

    const toggleTheme = () => {
        const newTheme = theme === 'dark' ? 'light' : 'dark';
        setTheme(newTheme);
        document.documentElement.classList.toggle('light', newTheme === 'light');
    };

    const handlePlayPause = async () => {
        try {
            await invoke('process_command', {
                command: { type: isPlaying ? 'PAUSE' : 'PLAY' },
            });
        } catch (error) {
            console.error('[ControlPanel] Play/Pause failed:', error);
        }
    };

    const handleSkip = async () => {
        try {
            await invoke('process_command', {
                command: { type: 'SKIP' },
            });
        } catch (error) {
            console.error('[ControlPanel] Skip failed:', error);
        }
    };

    const handleAddToQueue = async (url: string) => {
        setAddingToQueue(prev => new Set(prev).add(url));
        try {
            await invoke('process_command', {
                command: { type: 'ADD_SONG', youtubeUrl: url, addedBy: 'Host' },
            });
            setAddedToQueue(prev => new Set(prev).add(url));
        } catch (error) {
            console.error('[ControlPanel] Add to queue failed:', error);
        } finally {
            setAddingToQueue(prev => { const s = new Set(prev); s.delete(url); return s; });
        }
    };

    const handlePickCollection = async (url: string, collectionId: string) => {
        setPickerOpenFor(null);
        setAddingToPlaylist(prev => new Set(prev).add(url));
        try {
            await onAddToPlaylist(url, collectionId);
            setAddedToPlaylist(prev => new Set(prev).add(url));
        } catch (error) {
            console.error('[ControlPanel] Add to playlist failed:', error);
        } finally {
            setAddingToPlaylist(prev => { const s = new Set(prev); s.delete(url); return s; });
        }
    };

    const handleCreateCollection = async (thenAddUrl?: string) => {
        if (!newCollectionName.trim()) return;
        try {
            const newId = await playlistCreateCollection(newCollectionName.trim(), 'personal');
            setNewCollectionName('');
            setShowNewCollection(false);
            await loadLocalPlaylists();

            if (thenAddUrl) {
                // If adding to playlist directly from search result via this creation flow
                // We'd need to know the ID. playlistCreateCollection returns ID.
                // But the picker logic for search result uses handleCreateCollection(result.url).
                // Wait, handleCreateCollection was used in the picker OLD logic.
                // My new picker uses handleCreateLibraryCollection.
                // So handleCreateCollection is used for the MAIN playlist tab "New Collection" button.
                // That button likely doesn't pass a URL.
                // If it does (e.g. from existing logic), we handle it.
                if (thenAddUrl) {
                    await playlistAddSong(thenAddUrl, newId, 'Host');
                    await loadLocalPlaylists();
                }
            }
        } catch (error) {
            console.error('[ControlPanel] Create collection failed:', error);
        }
    };

    const handlePickLibraryCollection = async (url: string, collectionId: string) => {
        setLibraryPickerOpenFor(null);
        setAddingToLibrary(prev => new Set(prev).add(url));
        try {
            await playlistAddSong(url, collectionId, 'Host');
            setAddedToLibrary(prev => new Set(prev).add(url));
            await loadLocalPlaylists();
        } catch (error) {
            console.error('[ControlPanel] Add to library failed:', error);
        } finally {
            setAddingToLibrary(prev => { const s = new Set(prev); s.delete(url); return s; });
        }
    };

    const handleCreateLibraryCollection = async (thenAddUrl?: string) => {
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
    };

    const handlePlaylistToQueue = async (collectionId: string, songId: string) => {
        try {
            await invoke('process_command', {
                command: { type: 'PLAYLIST_TO_QUEUE', songId, collectionId },
            });
        } catch (error) {
            console.error('[ControlPanel] Playlist to queue failed:', error);
        }
    };

    const handleRemoveFromPlaylist = async (collectionId: string, songId: string) => {
        try {
            await playlistRemoveSong(collectionId, songId);
            await loadLocalPlaylists();
        } catch (error) {
            console.error('[ControlPanel] Remove from playlist failed:', error);
        }
    };

    const handleDeleteCollection = async (collectionId: string) => {
        if (!confirm('Are you sure you want to delete this collection?')) return;
        try {
            await playlistDeleteCollection(collectionId);
            await loadLocalPlaylists();
            if (activeCollectionId === collectionId) {
                // Find next available collection or null
                const nextCol = localPlaylists.find(c => c.id !== collectionId);
                setActiveCollectionId(nextCol ? nextCol.id : null);
            }
        } catch (error) {
            console.error('[ControlPanel] Delete collection failed:', error);
        }
    };

    const handleRenameCollection = async (collectionId: string) => {
        if (!renameValue.trim()) { setRenamingCollectionId(null); return; }
        try {
            await playlistRenameCollection(collectionId, renameValue.trim());
            await loadLocalPlaylists();
        } catch (error) {
            console.error('[ControlPanel] Rename failed:', error);
        } finally {
            setRenamingCollectionId(null);
        }
    };

    const handleToggleVisibility = async (col: PlaylistCollection) => {
        try {
            const newVisibility = col.visibility === 'public' ? 'private' : 'public';
            await playlistSetVisibility(col.id, newVisibility === 'public' ? 'public' : 'personal'); // Assuming 'personal' matches 'private' logic but command uses 'personal'/'public'? 
            // Wait, command uses 'public' | 'personal'.
            // UI uses 'public' | 'private' sometimes?
            // Local Playlist logic uses 'public' | 'personal' usually.
            // Let's check command signature or usage.
            // playlistSetVisibility takes (id, visibility).
            // Let's assume 'personal' is correct.
            await loadLocalPlaylists();
        } catch (error) {
            console.error('[ControlPanel] Toggle visibility failed:', error);
        }
    };



    const handleSaveToFile = async (collectionId: string) => {
        try {
            await saveCollectionToFile(collectionId);
        } catch (error) {
            console.error('[ControlPanel] Save to file failed:', error);
            // invoke throws string errors from Rust, or we might catch other JS errors
            if (typeof error === 'string' && error.includes('cancelled')) return;
            alert('Failed to save file');
        }
    };

    const handleLoadFromFile = async () => {
        try {
            await loadCollectionFromFile();
            await loadLocalPlaylists();
        } catch (error) {
            console.error('[ControlPanel] Load from file failed:', error);
            if (typeof error === 'string' && error.includes('cancelled')) return;
            alert('Failed to load file');
        }
    };

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
                                {searchResults.map((result, i) => {
                                    const isQueueLoading = addingToQueue.has(result.url);
                                    const isQueueAdded = addedToQueue.has(result.url);
                                    const isPlaylistLoading = addingToPlaylist.has(result.url);
                                    const isPlaylistAdded = addedToPlaylist.has(result.url);
                                    const isLibraryLoading = addingToLibrary.has(result.url);
                                    const isLibraryAdded = addedToLibrary.has(result.url);

                                    return (
                                        <div key={i} className="search-result-item">
                                            <img
                                                src={result.thumbnail}
                                                alt=""
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
                                                        onClick={() => handleAddToQueue(result.url)}
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
                                                            onClick={() => setPickerOpenFor(pickerOpenFor === result.url ? null : result.url)}
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

                                                        {pickerOpenFor === result.url && (
                                                            <div ref={pickerRef} className="collection-picker">
                                                                <div className="collection-picker-title">Add to Collection</div>
                                                                {playlists.map(col => (
                                                                    <button
                                                                        key={col.id}
                                                                        className="collection-picker-item"
                                                                        onClick={() => handlePickCollection(result.url, col.id)}
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
                                                                            onChange={(e) => setNewCollectionName(e.target.value)}
                                                                            onFocus={() => setHostInputFocused(true)}
                                                                            onBlur={() => setHostInputFocused(false)}
                                                                            onKeyDown={(e) => {
                                                                                if (e.key === 'Enter') {
                                                                                    e.preventDefault();
                                                                                    handleCreateCollection(result.url);
                                                                                }
                                                                                e.stopPropagation();
                                                                            }}
                                                                            autoFocus
                                                                            className="collection-picker-input"
                                                                        />
                                                                        <button className="btn-sm btn-primary" onClick={() => handleCreateCollection(result.url)}>
                                                                            Create
                                                                        </button>
                                                                    </div>
                                                                ) : (
                                                                    <button
                                                                        className="collection-picker-item collection-picker-create"
                                                                        onClick={() => setShowNewCollection(true)}
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
                                                            onClick={() => setLibraryPickerOpenFor(libraryPickerOpenFor === result.url ? null : result.url)}
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

                                                        {libraryPickerOpenFor === result.url && (
                                                            <div ref={libraryPickerRef} className="collection-picker">
                                                                <div className="collection-picker-title">Save to Library</div>
                                                                {localPlaylists.map(col => (
                                                                    <button
                                                                        key={col.id}
                                                                        className="collection-picker-item"
                                                                        onClick={() => handlePickLibraryCollection(result.url, col.id)}
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
                                                                            onChange={(e) => setNewLibraryCollectionName(e.target.value)}
                                                                            onFocus={() => setHostInputFocused(true)}
                                                                            onBlur={() => setHostInputFocused(false)}
                                                                            onKeyDown={(e) => {
                                                                                if (e.key === 'Enter') {
                                                                                    e.preventDefault();
                                                                                    handleCreateLibraryCollection(result.url);
                                                                                }
                                                                                e.stopPropagation();
                                                                            }}
                                                                            autoFocus
                                                                            className="collection-picker-input"
                                                                        />
                                                                        <button className="btn-sm btn-primary" onClick={() => handleCreateLibraryCollection(result.url)}>
                                                                            Create
                                                                        </button>
                                                                    </div>
                                                                ) : (
                                                                    <button
                                                                        className="collection-picker-item collection-picker-create"
                                                                        onClick={() => setShowNewLibraryCollection(true)}
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
                                })}
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
                                    <div key={song.id} className="playlist-item">
                                        <span className="playlist-number">{i + 1}</span>
                                        <img
                                            src={song.thumbnailUrl}
                                            alt=""
                                            className="playlist-thumb"
                                        />
                                        <div className="playlist-info">
                                            <div className="playlist-title">{song.title}</div>
                                        </div>
                                        <FocusableButton
                                            className="btn-sm btn-primary"
                                            onClick={() => handlePlaylistToQueue(activeCollection.id, song.id)}
                                        >
                                            <Plus size={14} /> Queue
                                        </FocusableButton>
                                        <FocusableButton
                                            className="playlist-remove-btn"
                                            onClick={() => handleRemoveFromPlaylist(activeCollection.id, song.id)}
                                            title="Remove from playlist"
                                        >
                                            <Trash2 size={14} />
                                        </FocusableButton>
                                    </div>
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
