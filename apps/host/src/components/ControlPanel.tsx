import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import QRDisplay from './QRDisplay';
import Queue from './Queue';
import { Song } from '../hooks/useRoomState';

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
    playlist: Song[];
    connectedClients: number;
    isCollapsed: boolean;
    onToggle: () => void;
    onSearch: (query: string) => void;
    searchResults: SearchResult[];
    searching: boolean;
    onAddSong: (url: string) => void;
    isPlaying: boolean;
    currentSong: Song | null;
}

// Icons
const Icons = {
    chevronLeft: (
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"></polyline>
        </svg>
    ),
    chevronRight: (
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6"></polyline>
        </svg>
    ),
    users: (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
            <circle cx="9" cy="7" r="4"></circle>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
        </svg>
    ),
    search: (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
    ),
    plus: (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
    ),
    sun: (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="5"></circle>
            <line x1="12" y1="1" x2="12" y2="3"></line>
            <line x1="12" y1="21" x2="12" y2="23"></line>
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
            <line x1="1" y1="12" x2="3" y2="12"></line>
            <line x1="21" y1="12" x2="23" y2="12"></line>
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
        </svg>
    ),
    moon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
        </svg>
    ),
    play: (
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="none">
            <polygon points="5 3 19 12 5 21 5 3"></polygon>
        </svg>
    ),
    pause: (
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="none">
            <rect x="6" y="4" width="4" height="16"></rect>
            <rect x="14" y="4" width="4" height="16"></rect>
        </svg>
    ),
    skipForward: (
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="5 4 15 12 5 20 5 4"></polygon>
            <line x1="19" y1="5" x2="19" y2="19"></line>
        </svg>
    ),
    music: (
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 18V5l12-2v13"></path>
            <circle cx="6" cy="18" r="3"></circle>
            <circle cx="18" cy="16" r="3"></circle>
        </svg>
    ),
    trash: (
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
        </svg>
    ),
    userPlus: (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
            <circle cx="8.5" cy="7" r="4"></circle>
            <line x1="20" y1="8" x2="20" y2="14"></line>
            <line x1="23" y1="11" x2="17" y2="11"></line>
        </svg>
    ),
};

const ControlPanel = ({
    connectionUrl,
    roomId,
    queue,
    playlist,
    connectedClients,
    isCollapsed,
    onToggle,
    onSearch,
    searchResults,
    searching,
    onAddSong,
    isPlaying,
    currentSong,
}: ControlPanelProps) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [theme, setTheme] = useState<'dark' | 'light'>('dark');
    const [showInvite, setShowInvite] = useState(false);

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        if (searchQuery.trim()) {
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

    const handlePlaylistToQueue = async (songId: string) => {
        try {
            await invoke('process_command', {
                command: { type: 'PLAYLIST_TO_QUEUE', songId },
            });
        } catch (error) {
            console.error('[ControlPanel] Playlist to queue failed:', error);
        }
    };

    const handleRemoveFromPlaylist = async (songId: string) => {
        try {
            await invoke('process_command', {
                command: { type: 'PLAYLIST_REMOVE', songId },
            });
        } catch (error) {
            console.error('[ControlPanel] Remove from playlist failed:', error);
        }
    };

    return (
        <>
            {/* Toggle Button */}
            <button
                className="panel-toggle"
                onClick={onToggle}
                style={{
                    right: isCollapsed ? '16px' : '376px',
                    transition: 'right 0.3s ease'
                }}
            >
                {isCollapsed ? Icons.chevronLeft : Icons.chevronRight}
            </button>

            {/* Panel */}
            <div className={`control-panel ${isCollapsed ? 'collapsed' : ''}`}>
                <div className="control-panel-header">
                    <span className="control-panel-title">KaraokeNatin</span>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button className="btn-icon" onClick={toggleTheme}>
                            {theme === 'dark' ? Icons.sun : Icons.moon}
                        </button>
                    </div>
                </div>

                <div className="control-panel-content">
                    {/* Invite Section */}
                    <div className="control-panel-section">
                        <button
                            onClick={() => setShowInvite(!showInvite)}
                            style={{
                                width: '100%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '8px',
                                padding: '12px',
                                background: showInvite ? 'var(--accent)' : 'var(--bg-tertiary)',
                                color: showInvite ? 'white' : 'var(--text-primary)',
                                border: 'none',
                                borderRadius: '12px',
                                cursor: 'pointer',
                                fontWeight: 600,
                                fontSize: '14px',
                                transition: 'all 0.2s'
                            }}
                        >
                            {Icons.userPlus} Invite Friends
                        </button>
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
                            <div style={{
                                background: 'var(--bg-tertiary)',
                                borderRadius: '12px',
                                padding: '12px',
                                marginBottom: '12px'
                            }}>
                                <div style={{
                                    fontSize: '14px',
                                    fontWeight: 500,
                                    marginBottom: '4px',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap'
                                }}>
                                    {currentSong.title}
                                </div>
                                <div style={{
                                    fontSize: '12px',
                                    color: 'var(--text-secondary)'
                                }}>
                                    {currentSong.artist || 'Unknown Artist'}
                                </div>
                            </div>
                        ) : (
                            <div style={{
                                background: 'var(--bg-tertiary)',
                                borderRadius: '12px',
                                padding: '16px',
                                textAlign: 'center',
                                color: 'var(--text-secondary)',
                                marginBottom: '12px'
                            }}>
                                No song playing
                            </div>
                        )}
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                            <button
                                className="btn-icon"
                                onClick={handlePlayPause}
                                style={{ background: 'var(--accent)', color: 'white' }}
                                title={isPlaying ? 'Pause' : 'Play'}
                            >
                                {isPlaying ? Icons.pause : Icons.play}
                            </button>
                            <button
                                className="btn-icon"
                                onClick={handleSkip}
                                title="Skip"
                            >
                                {Icons.skipForward}
                            </button>
                        </div>
                    </div>

                    {/* Status */}
                    <div className="control-panel-section">
                        <div className="status-item">
                            {Icons.users}
                            <span>{connectedClients} connected</span>
                        </div>
                    </div>

                    {/* Search Section */}
                    <div className="control-panel-section">
                        <div className="section-label">Add Songs</div>
                        <form onSubmit={handleSearch} className="search-container">
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <input
                                    type="text"
                                    className="search-input"
                                    placeholder="Search for songs..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                />
                                <button type="submit" className="btn-icon" style={{ flexShrink: 0 }}>
                                    {Icons.search}
                                </button>
                            </div>
                        </form>

                        {/* Search Results */}
                        {searching && (
                            <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-secondary)' }}>
                                <div className="spinner" style={{ width: 32, height: 32, margin: '0 auto 12px', border: '3px solid var(--border)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                                <p>Searching...</p>
                            </div>
                        )}

                        {!searching && searchResults.length > 0 && (
                            <div style={{ marginTop: '16px' }}>
                                {searchResults.map((result, i) => (
                                    <div key={i} style={{
                                        display: 'flex',
                                        gap: '12px',
                                        padding: '12px',
                                        background: 'var(--bg-tertiary)',
                                        borderRadius: '12px',
                                        marginBottom: '8px'
                                    }}>
                                        <img
                                            src={result.thumbnail}
                                            alt=""
                                            style={{
                                                width: '80px',
                                                height: '60px',
                                                borderRadius: '6px',
                                                objectFit: 'cover',
                                                flexShrink: 0
                                            }}
                                        />
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{
                                                fontSize: '13px',
                                                fontWeight: 500,
                                                marginBottom: '4px',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                whiteSpace: 'nowrap'
                                            }}>
                                                {result.title}
                                            </div>
                                            <div style={{
                                                fontSize: '11px',
                                                color: 'var(--text-secondary)',
                                                marginBottom: '8px'
                                            }}>
                                                {result.channel} • {result.duration}
                                            </div>
                                            <button
                                                className="btn-sm btn-primary"
                                                onClick={() => onAddSong(result.url)}
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '4px'
                                                }}
                                            >
                                                {Icons.plus} Add
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Queue Section */}
                    <div className="control-panel-section">
                        <div className="section-label">Queue ({queue.length})</div>
                        <Queue songs={queue} />
                    </div>

                    {/* Playlist Section */}
                    <div className="control-panel-section">
                        <div className="section-label">
                            {Icons.music} Playlist ({playlist.length})
                        </div>
                        {playlist.length === 0 ? (
                            <div style={{
                                background: 'var(--bg-tertiary)',
                                borderRadius: '12px',
                                padding: '24px 16px',
                                textAlign: 'center',
                                color: 'var(--text-secondary)'
                            }}>
                                <p>No songs in playlist</p>
                                <p style={{ fontSize: '12px', marginTop: '4px', color: 'var(--text-muted)' }}>
                                    Add songs from search results
                                </p>
                            </div>
                        ) : (
                            <div style={{ maxHeight: '280px', overflowY: 'auto' }}>
                                {playlist.map((song, i) => (
                                    <div key={song.id} style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '10px',
                                        padding: '8px',
                                        background: 'var(--bg-tertiary)',
                                        borderRadius: '8px',
                                        marginBottom: '4px'
                                    }}>
                                        <span style={{
                                            width: '20px',
                                            fontSize: '12px',
                                            color: 'var(--text-muted)',
                                            textAlign: 'center'
                                        }}>
                                            {i + 1}
                                        </span>
                                        <img
                                            src={song.thumbnailUrl}
                                            alt=""
                                            style={{
                                                width: '40px',
                                                height: '30px',
                                                borderRadius: '4px',
                                                objectFit: 'cover'
                                            }}
                                        />
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{
                                                fontSize: '12px',
                                                fontWeight: 500,
                                                whiteSpace: 'nowrap',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis'
                                            }}>
                                                {song.title}
                                            </div>
                                        </div>
                                        <button
                                            className="btn-sm btn-primary"
                                            onClick={() => handlePlaylistToQueue(song.id)}
                                            style={{ padding: '4px 8px', fontSize: '11px' }}
                                        >
                                            {Icons.plus} Queue
                                        </button>
                                        <button
                                            onClick={() => handleRemoveFromPlaylist(song.id)}
                                            style={{
                                                background: 'transparent',
                                                border: 'none',
                                                color: 'var(--text-secondary)',
                                                cursor: 'pointer',
                                                padding: '4px'
                                            }}
                                            title="Remove from playlist"
                                        >
                                            {Icons.trash}
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <style>{`
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
                .btn-sm {
                    padding: 6px 12px;
                    border-radius: 9999px;
                    border: none;
                    font-size: 12px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s;
                }
                .btn-primary {
                    background: var(--accent);
                    color: white;
                }
                .btn-primary:hover {
                    background: var(--accent-hover);
                }
            `}</style>
        </>
    );
};

export default ControlPanel;
