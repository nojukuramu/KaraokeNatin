import { useState, useRef, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useFocusable, FocusContext } from '@noriginmedia/norigin-spatial-navigation';
import QRDisplay from './QRDisplay';
import Queue from './Queue';
import { Song, PlaylistCollection } from '../hooks/useRoomState';
import { setHostInputFocused } from '../hooks/useRoomState';
import { exportCollection } from '../lib/commands';
import {
    ChevronLeft, ChevronRight, Users, Search, Plus, Sun, Moon,
    Play, Pause, SkipForward, Music, Trash2, UserPlus,
    Globe, Lock, Pencil, Upload, Download, ChevronDown, ArrowLeft,
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
    // Collection picker state
    const [pickerOpenFor, setPickerOpenFor] = useState<string | null>(null);
    const pickerRef = useRef<HTMLDivElement>(null);
    // New collection form
    const [showNewCollection, setShowNewCollection] = useState(false);
    const [newCollectionName, setNewCollectionName] = useState('');
    // Active collection tab in playlist section
    const [activeCollectionId, setActiveCollectionId] = useState<string | null>(null);
    // Collection management
    const [renamingCollectionId, setRenamingCollectionId] = useState<string | null>(null);
    const [renameValue, setRenameValue] = useState('');

    const { ref, focusKey } = useFocusable();

    // Close picker on outside click
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
                setPickerOpenFor(null);
                setShowNewCollection(false);
            }
        };
        if (pickerOpenFor) {
            document.addEventListener('mousedown', handleClickOutside);
            return () => document.removeEventListener('mousedown', handleClickOutside);
        }
    }, [pickerOpenFor]);

    // Set active collection to first one when playlists load
    useEffect(() => {
        if (!activeCollectionId && playlists.length > 0) {
            setActiveCollectionId(playlists[0].id);
        }
    }, [playlists, activeCollectionId]);

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        if (searchQuery.trim()) {
            // Clear previous result states
            setAddingToQueue(new Set());
            setAddedToQueue(new Set());
            setAddingToPlaylist(new Set());
            setAddedToPlaylist(new Set());
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
            await invoke('process_command', {
                command: { type: 'CREATE_COLLECTION', name: newCollectionName.trim(), visibility: 'public' },
            });
            setNewCollectionName('');
            setShowNewCollection(false);
            // If we were adding a song, we need to wait for state update to get the new ID.
            // For simplicity, close picker - user can re-click.
            if (thenAddUrl) setPickerOpenFor(null);
        } catch (error) {
            console.error('[ControlPanel] Create collection failed:', error);
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
            await invoke('process_command', {
                command: { type: 'PLAYLIST_REMOVE', songId, collectionId },
            });
        } catch (error) {
            console.error('[ControlPanel] Remove from playlist failed:', error);
        }
    };

    const handleDeleteCollection = async (collectionId: string) => {
        try {
            await invoke('process_command', {
                command: { type: 'DELETE_COLLECTION', collectionId },
            });
            if (activeCollectionId === collectionId) {
                setActiveCollectionId(playlists.find(c => c.id !== collectionId)?.id ?? null);
            }
        } catch (error) {
            console.error('[ControlPanel] Delete collection failed:', error);
        }
    };

    const handleRenameCollection = async (collectionId: string) => {
        if (!renameValue.trim()) { setRenamingCollectionId(null); return; }
        try {
            await invoke('process_command', {
                command: { type: 'RENAME_COLLECTION', collectionId, name: renameValue.trim() },
            });
        } catch (error) {
            console.error('[ControlPanel] Rename failed:', error);
        } finally {
            setRenamingCollectionId(null);
        }
    };

    const handleToggleVisibility = async (col: PlaylistCollection) => {
        try {
            await invoke('process_command', {
                command: {
                    type: 'SET_COLLECTION_VISIBILITY',
                    collectionId: col.id,
                    visibility: col.visibility === 'public' ? 'personal' : 'public',
                },
            });
        } catch (error) {
            console.error('[ControlPanel] Toggle visibility failed:', error);
        }
    };

    const handleExportCollection = async (collectionId: string) => {
        try {
            const json = await exportCollection(collectionId);
            await navigator.clipboard.writeText(json);
            alert('Collection copied to clipboard!');
        } catch (error) {
            console.error('[ControlPanel] Export failed:', error);
            alert('Export failed');
        }
    };

    const handleImportCollection = async () => {
        try {
            const text = await navigator.clipboard.readText();
            await invoke('process_command', {
                command: { type: 'IMPORT_COLLECTION', data: text },
            });
        } catch (error) {
            console.error('[ControlPanel] Import failed:', error);
            alert('Import failed. Make sure you have a valid collection JSON in your clipboard.');
        }
    };

    const activeCollection = playlists.find(c => c.id === activeCollectionId);
    const totalSongs = playlists.reduce((sum, c) => sum + c.songs.length, 0);

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
                                <FocusableButton className="btn-icon search-btn" onClick={() => handleSearch({ preventDefault: () => {} } as React.FormEvent)}>
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
                                    onClick={handleImportCollection}
                                    title="Import collection from clipboard"
                                >
                                    <Download size={13} /> Import
                                </FocusableButton>
                            </div>
                        </div>

                        {/* Collection Tabs */}
                        {playlists.length > 0 && (
                            <div className="collection-tabs">
                                {playlists.map(col => (
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
                                    onClick={() => handleExportCollection(activeCollection.id)}
                                    title="Export to clipboard"
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
                                <p>{playlists.length === 0 ? 'No collections yet' : 'No songs in this collection'}</p>
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
        </FocusContext.Provider>
    );
};

export default ControlPanel;
