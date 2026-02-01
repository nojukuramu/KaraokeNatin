import { useState } from 'react';
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
    connectedClients: number;
    isCollapsed: boolean;
    onToggle: () => void;
    onSearch: (query: string) => void;
    searchResults: SearchResult[];
    searching: boolean;
    onAddSong: (url: string) => void;
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
};

const ControlPanel = ({
    connectionUrl,
    roomId,
    queue,
    connectedClients,
    isCollapsed,
    onToggle,
    onSearch,
    searchResults,
    searching,
    onAddSong,
}: ControlPanelProps) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [theme, setTheme] = useState<'dark' | 'light'>('dark');

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
                    {/* Status */}
                    <div className="control-panel-section">
                        <div className="status-item">
                            {Icons.users}
                            <span>{connectedClients} connected</span>
                        </div>
                    </div>

                    {/* QR Code Section */}
                    <div className="control-panel-section">
                        <div className="section-label">Join Session</div>
                        <QRDisplay url={connectionUrl} roomId={roomId ?? null} />
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
