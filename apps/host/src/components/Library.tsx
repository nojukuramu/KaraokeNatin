import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { List, type RowComponentProps } from 'react-window';
import { ArrowLeft, Sun, Moon, Search, Plus, Music, Trash2, Pencil, Globe, Lock, Upload, ChevronDown } from 'lucide-react';
import { PlaylistCollection, Song } from '../hooks/useRoomState';
import {
    getPlaylists,
    playlistCreateCollection,
    playlistDeleteCollection,
    playlistRenameCollection,
    playlistSetVisibility,
    playlistAddSong,
    playlistRemoveSong,
    saveCollectionToFile,
    loadCollectionFromFile
} from '../lib/commands';
import { setHostInputFocused } from '../hooks/useRoomState';

interface SearchResult {
    url: string;
    title: string;
    channel: string;
    duration: string;
    thumbnail: string;
}

interface LibraryProps {
    onBack: () => void;
}

// Library collections are unbounded (a user can accumulate hundreds of
// songs), so the song list is virtualized with react-window: only rows
// scrolled into view exist in the DOM. This page has no D-pad wiring
// (no useFocusable calls anywhere in this file) — it's the mouse/touch
// management screen, not a TV surface — so windowing carries none of the
// spatial-navigation focus risk that keeps ControlPanel.tsx and Queue.tsx
// unvirtualized. See REPOMAPPING.md / task.md T28 for that distinction.
const PLAYLIST_ROW_HEIGHT = 46; // matches .playlist-item (padding + 30px thumb) + margin-bottom
const PLAYLIST_LIST_HEIGHT = 280; // matches the old .playlist-list max-height

interface PlaylistRowData {
    songs: Song[];
    onRemove: (songId: string) => void;
}

function PlaylistSongRow({ index, style, songs, onRemove }: RowComponentProps<PlaylistRowData>) {
    const song = songs[index];
    return (
        <div style={style} className="playlist-item">
            <span className="playlist-number">{index + 1}</span>
            <img src={song.thumbnailUrl} alt="" loading="lazy" decoding="async" width={40} height={30} className="playlist-thumb" />
            <div className="playlist-info">
                <div className="playlist-title">{song.title}</div>
            </div>
            <button
                className="playlist-remove-btn"
                onClick={() => onRemove(song.id)}
                title="Remove from library"
            >
                <Trash2 size={14} />
            </button>
        </div>
    );
}

/**
 * Standalone Library Management Page
 * Allows managing personal song collections with full organization features
 * Can search for songs even without an active session
 */
export default function Library({ onBack }: LibraryProps) {
    const [theme, setTheme] = useState<'dark' | 'light'>('dark');
    const [collections, setCollections] = useState<PlaylistCollection[]>([]);
    const [activeCollectionId, setActiveCollectionId] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
    const [searching, setSearching] = useState(false);

    // Collection management
    const [newCollectionName, setNewCollectionName] = useState('');
    const [showNewCollection, setShowNewCollection] = useState(false);
    const [renamingCollectionId, setRenamingCollectionId] = useState<string | null>(null);
    const [renameValue, setRenameValue] = useState('');

    // Dropdown state for search results
    const [pickerOpenFor, setPickerOpenFor] = useState<string | null>(null);
    const [showNewCollectionInPicker, setShowNewCollectionInPicker] = useState(false);
    const [newCollectionNameInPicker, setNewCollectionNameInPicker] = useState('');

    // Loading states
    const [addingToLibrary, setAddingToLibrary] = useState<Set<string>>(new Set());
    const [addedToLibrary, setAddedToLibrary] = useState<Set<string>>(new Set());

    // Load collections on mount
    useEffect(() => {
        loadCollections();
    }, []);

    const loadCollections = async () => {
        try {
            const playlists = await getPlaylists();
            setCollections(playlists);
            if (!activeCollectionId && playlists.length > 0) {
                setActiveCollectionId(playlists[0].id);
            }
        } catch (error) {
            console.error('[Library] Failed to load collections:', error);
        }
    };

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!searchQuery.trim()) return;

        setSearching(true);
        setSearchResults([]);
        setAddedToLibrary(new Set());

        try {
            const results = await invoke<SearchResult[]>('search_youtube', {
                query: searchQuery.trim(),
                limit: 10
            });
            setSearchResults(results);
        } catch (error) {
            console.error('[Library] Search failed:', error);
        } finally {
            setSearching(false);
        }
    };

    const handleCreateCollection = async () => {
        if (!newCollectionName.trim()) return;
        try {
            await playlistCreateCollection(newCollectionName.trim(), 'personal');
            setNewCollectionName('');
            setShowNewCollection(false);
            await loadCollections();
        } catch (error) {
            console.error('[Library] Create collection failed:', error);
        }
    };

    const handleCreateCollectionInPicker = async (thenAddUrl?: string) => {
        if (!newCollectionNameInPicker.trim()) return;
        try {
            const newId = await playlistCreateCollection(newCollectionNameInPicker.trim(), 'personal');
            setNewCollectionNameInPicker('');
            setShowNewCollectionInPicker(false);
            await loadCollections();

            // If we were adding a song, add it to the new collection
            if (thenAddUrl) {
                await handlePickCollection(thenAddUrl, newId);
            }
            setPickerOpenFor(null);
        } catch (error) {
            console.error('[Library] Create collection in picker failed:', error);
        }
    };

    const handleDeleteCollection = async (collectionId: string) => {
        const collection = collections.find(c => c.id === collectionId);
        if (!collection) return;

        if (!confirm(`Delete "${collection.name}"?`)) return;

        try {
            await playlistDeleteCollection(collectionId);
            if (activeCollectionId === collectionId) {
                setActiveCollectionId(collections.find(c => c.id !== collectionId)?.id ?? null);
            }
            await loadCollections();
        } catch (error) {
            console.error('[Library] Delete collection failed:', error);
        }
    };

    const handleRenameCollection = async (collectionId: string) => {
        if (!renameValue.trim()) {
            setRenamingCollectionId(null);
            return;
        }
        try {
            await playlistRenameCollection(collectionId, renameValue.trim());
            await loadCollections();
        } catch (error) {
            console.error('[Library] Rename failed:', error);
        } finally {
            setRenamingCollectionId(null);
        }
    };

    const handleToggleVisibility = async (collection: PlaylistCollection) => {
        try {
            const newVis = collection.visibility === 'public' ? 'personal' : 'public';
            await playlistSetVisibility(collection.id, newVis);
            await loadCollections();
        } catch (error) {
            console.error('[Library] Toggle visibility failed:', error);
        }
    };

    const handlePickCollection = async (url: string, collectionId: string) => {
        setPickerOpenFor(null);
        setAddingToLibrary(prev => new Set(prev).add(url));
        try {
            await playlistAddSong(url, collectionId, 'Library');
            setAddedToLibrary(prev => new Set(prev).add(url));
            await loadCollections();
        } catch (error) {
            console.error('[Library] Add to library failed:', error);
        } finally {
            setAddingToLibrary(prev => { const s = new Set(prev); s.delete(url); return s; });
        }
    };

    const handleRemoveFromLibrary = async (collectionId: string, songId: string) => {
        try {
            await playlistRemoveSong(collectionId, songId);
            await loadCollections();
        } catch (error) {
            console.error('[Library] Remove from library failed:', error);
        }
    };

    // Stable per-collection callback so react-window's rowProps identity
    // only changes when the active collection actually changes.
    const handleRemoveFromActiveCollection = useCallback((songId: string) => {
        if (activeCollectionId) {
            handleRemoveFromLibrary(activeCollectionId, songId);
        }
    }, [activeCollectionId]);



    const handleSaveToFile = async (collectionId: string) => {
        try {
            await saveCollectionToFile(collectionId);
        } catch (error) {
            console.error('[Library] Save to file failed:', error);
            if (typeof error === 'string' && error.includes('cancelled')) return;
            alert('Failed to save file');
        }
    };

    const handleLoadFromFile = async () => {
        try {
            await loadCollectionFromFile();
            await loadCollections();
        } catch (error) {
            console.error('[Library] Load from file failed:', error);
            if (typeof error === 'string' && error.includes('cancelled')) return;
            alert('Failed to load file');
        }
    };

    const toggleTheme = () => {
        const newTheme = theme === 'dark' ? 'light' : 'dark';
        setTheme(newTheme);
        document.documentElement.classList.toggle('light', newTheme === 'light');
    };

    const activeCollection = collections.find(c => c.id === activeCollectionId);
    const totalSongs = collections.reduce((sum, c) => sum + c.songs.length, 0);

    return (
        <div className="library-page">
            {/* Header */}
            <div className="library-header">
                <button className="btn-icon" onClick={onBack} title="Back to mode selection">
                    <ArrowLeft size={18} />
                </button>
                <h1 className="library-title">My Library</h1>
                <button className="btn-icon" onClick={toggleTheme}>
                    {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
                </button>
            </div>

            {/* Search Bar */}
            <div className="library-search">
                <form onSubmit={handleSearch} className="search-row">
                    <input
                        type="text"
                        className="search-input"
                        placeholder="Search for songs..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onFocus={() => setHostInputFocused(true)}
                        onBlur={() => setHostInputFocused(false)}
                    />
                    <button type="submit" className="btn-icon" title="Search">
                        <Search size={18} />
                    </button>
                </form>
            </div>

            <div className="library-content">
                {/* Search Results */}
                {searching && (
                    <div className="search-loading">
                        <div className="spinner"></div>
                        <p>Searching...</p>
                    </div>
                )}

                {!searching && searchResults.length > 0 && (
                    <div className="library-section">
                        <div className="section-label">Search Results</div>
                        <div className="search-results">
                            {searchResults.map((result) => {
                                const isLoading = addingToLibrary.has(result.url);
                                const isAdded = addedToLibrary.has(result.url);

                                return (
                                    <div key={result.url} className="search-result-item">
                                        <img src={result.thumbnail} alt="" loading="lazy" decoding="async" width={72} height={54} className="search-result-thumb" />
                                        <div className="search-result-info">
                                            <div className="search-result-title">{result.title}</div>
                                            <div className="search-result-meta">
                                                {result.channel} • {result.duration}
                                            </div>
                                            <div className="search-result-actions">
                                                <div className="playlist-picker-wrapper" style={{ position: 'relative' }}>
                                                    <button
                                                        className={`btn-sm ${isAdded ? 'btn-success' : 'btn-primary'}`}
                                                        onClick={() => setPickerOpenFor(pickerOpenFor === result.url ? null : result.url)}
                                                        disabled={isLoading}
                                                    >
                                                        {isLoading ? (
                                                            <>Saving...</>
                                                        ) : isAdded ? (
                                                            <>✓ Saved</>
                                                        ) : (
                                                            <>
                                                                <Plus size={14} /> Add to Library <ChevronDown size={12} />
                                                            </>
                                                        )}
                                                    </button>

                                                    {pickerOpenFor === result.url && (
                                                        <div className="collection-picker">
                                                            <div className="collection-picker-title">Add to Collection</div>
                                                            {collections.map(col => (
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
                                                            {showNewCollectionInPicker ? (
                                                                <div className="collection-picker-new">
                                                                    <input
                                                                        type="text"
                                                                        placeholder="Collection name..."
                                                                        value={newCollectionNameInPicker}
                                                                        onChange={(e) => setNewCollectionNameInPicker(e.target.value)}
                                                                        onFocus={() => setHostInputFocused(true)}
                                                                        onBlur={() => setHostInputFocused(false)}
                                                                        onKeyDown={(e) => {
                                                                            if (e.key === 'Enter') {
                                                                                e.preventDefault();
                                                                                handleCreateCollectionInPicker(result.url);
                                                                            }
                                                                            e.stopPropagation();
                                                                        }}
                                                                        autoFocus
                                                                        className="collection-picker-input"
                                                                    />
                                                                    <button
                                                                        className="btn-sm btn-primary"
                                                                        onClick={() => handleCreateCollectionInPicker(result.url)}
                                                                    >
                                                                        Create
                                                                    </button>
                                                                </div>
                                                            ) : (
                                                                <button
                                                                    className="collection-picker-item collection-picker-create"
                                                                    onClick={() => setShowNewCollectionInPicker(true)}
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
                    </div>
                )}

                {/* Collections Management */}
                <div className="library-section">
                    <div className="section-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span><Music size={16} style={{ display: 'inline', verticalAlign: '-2px' }} /> Collections ({totalSongs} songs)</span>
                        <div style={{ display: 'flex', gap: '4px' }}>
                            <button
                                className="btn-sm btn-secondary"
                                onClick={handleLoadFromFile}
                                title="Import from file"
                            >
                                <Upload size={14} style={{ display: 'inline', verticalAlign: '-2px', marginRight: '4px' }} /> Import
                            </button>
                        </div>
                    </div>

                    {/* Collection Tabs */}
                    <div className="collection-tabs">
                        {collections.map(col => (
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
                            onClick={() => setShowNewCollection(true)}
                            title="Create new collection"
                        >
                            <Plus size={14} />
                        </button>
                    </div>

                    {/* New Collection Form */}
                    {showNewCollection && (
                        <div className="library-new-collection">
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
                                        handleCreateCollection();
                                    }
                                    if (e.key === 'Escape') {
                                        setShowNewCollection(false);
                                        setNewCollectionName('');
                                    }
                                }}
                                autoFocus
                                className="search-input"
                                style={{ marginBottom: '8px' }}
                            />
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <button className="btn-primary" onClick={handleCreateCollection}>
                                    Create
                                </button>
                                <button
                                    className="btn-secondary"
                                    onClick={() => {
                                        setShowNewCollection(false);
                                        setNewCollectionName('');
                                    }}
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Collection Actions */}
                    {activeCollection && (
                        <div className="collection-actions-bar">
                            <button
                                className="btn-sm btn-secondary"
                                onClick={() => handleToggleVisibility(activeCollection)}
                                title={activeCollection.visibility === 'public' ? 'Make personal' : 'Make public'}
                            >
                                {activeCollection.visibility === 'public' ? (
                                    <><Globe size={13} /> Public</>
                                ) : (
                                    <><Lock size={13} /> Personal</>
                                )}
                            </button>
                            <button
                                className="btn-sm btn-secondary"
                                onClick={() => {
                                    setRenamingCollectionId(activeCollection.id);
                                    setRenameValue(activeCollection.name);
                                }}
                                title="Rename"
                            >
                                <Pencil size={13} />
                            </button>
                            <button
                                className="btn-sm btn-secondary"
                                onClick={() => handleSaveToFile(activeCollection.id)}
                                title="Export to file"
                            >
                                <Upload size={13} /> Export
                            </button>
                            {collections.length > 1 && (
                                <button
                                    className="btn-sm btn-danger-text"
                                    onClick={() => handleDeleteCollection(activeCollection.id)}
                                    title="Delete collection"
                                >
                                    <Trash2 size={13} />
                                </button>
                            )}
                        </div>
                    )}

                    {/* Songs in Active Collection */}
                    {!activeCollection || activeCollection.songs.length === 0 ? (
                        <div className="playlist-empty">
                            <p>{collections.length === 0 ? 'No collections yet' : 'No songs in this collection'}</p>
                            <p className="playlist-empty-hint">{collections.length === 0 ? 'Create your first collection above' : 'Add songs from search results'}</p>
                        </div>
                    ) : (
                        <List
                            className="playlist-list"
                            style={{ height: PLAYLIST_LIST_HEIGHT }}
                            rowComponent={PlaylistSongRow}
                            rowCount={activeCollection.songs.length}
                            rowHeight={PLAYLIST_ROW_HEIGHT}
                            rowProps={{ songs: activeCollection.songs, onRemove: handleRemoveFromActiveCollection }}
                            rowKey={(index, data) => data.songs[index].id}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}
