import { useEffect, useRef, useState, useCallback } from 'react';
import { useRoomState } from '../hooks/useRoomState';
import { invoke } from '@tauri-apps/api/core';
import ScoringOverlay from './ScoringOverlay';

// YouTube IFrame API types
declare global {
    interface Window {
        onYouTubeIframeAPIReady: () => void;
        YT: any;
    }
}

interface YouTubePlayer {
    loadVideoById(videoId: string): void;
    playVideo(): void;
    pauseVideo(): void;
    stopVideo(): void;
    getCurrentTime(): number;
    getDuration(): number;
    getPlayerState(): number;
    destroy(): void;
}

interface PlayerProps {
    isFullscreen: boolean;
    onToggleFullscreen: () => void;
}

// Icons
const Icons = {
    maximize: (
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 3 21 3 21 9"></polyline>
            <polyline points="9 21 3 21 3 15"></polyline>
            <line x1="21" y1="3" x2="14" y2="10"></line>
            <line x1="3" y1="21" x2="10" y2="14"></line>
        </svg>
    ),
    minimize: (
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="4 14 10 14 10 20"></polyline>
            <polyline points="20 10 14 10 14 4"></polyline>
            <line x1="14" y1="10" x2="21" y2="3"></line>
            <line x1="3" y1="21" x2="10" y2="14"></line>
        </svg>
    ),
    music: (
        <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 18V5l12-2v13"></path>
            <circle cx="6" cy="18" r="3"></circle>
            <circle cx="18" cy="16" r="3"></circle>
        </svg>
    )
};

// Generate random score (70-100, 0.5% chance of 101)
const generateScore = (): number => {
    const perfectChance = Math.random() < 0.005; // 0.5% chance
    if (perfectChance) return 101;
    return Math.floor(Math.random() * 31) + 70; // 70-100
};

const Player = ({ isFullscreen, onToggleFullscreen }: PlayerProps) => {
    const playerRef = useRef<HTMLDivElement>(null);
    const ytPlayerRef = useRef<YouTubePlayer | null>(null);
    const { roomState } = useRoomState();
    const [isAPIReady, setIsAPIReady] = useState(false);
    const currentSongRef = useRef(roomState?.player.currentSong);
    const [showScoring, setShowScoring] = useState(false);
    const [currentScore, setCurrentScore] = useState(0);
    const [lastSongTitle, setLastSongTitle] = useState('');

    // Load YouTube IFrame API
    useEffect(() => {
        if (window.YT) {
            setIsAPIReady(true);
            return;
        }

        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        const firstScriptTag = document.getElementsByTagName('script')[0];
        firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);

        window.onYouTubeIframeAPIReady = () => {
            setIsAPIReady(true);
        };
    }, []);

    // Initialize player when API is ready
    useEffect(() => {
        if (!isAPIReady || !playerRef.current || ytPlayerRef.current) return;

        ytPlayerRef.current = new window.YT.Player(playerRef.current, {
            height: '100%',
            width: '100%',
            playerVars: {
                autoplay: 0,
                controls: 1,
                modestbranding: 1,
                rel: 0,
            },
            events: {
                onReady: handlePlayerReady,
                onStateChange: handlePlayerStateChange,
            },
        }) as unknown as YouTubePlayer;

        return () => {
            ytPlayerRef.current?.destroy();
            ytPlayerRef.current = null;
        };
    }, [isAPIReady]);

    // Handle player ready
    const handlePlayerReady = () => {
        console.log('[Player] YouTube player ready');
        startTimePolling();
    };

    // Handle player state changes
    const handlePlayerStateChange = (event: any) => {
        const state = event.data;
        let status = 'idle';

        switch (state) {
            case window.YT.PlayerState.PLAYING:
                status = 'playing';
                break;
            case window.YT.PlayerState.PAUSED:
                status = 'paused';
                break;
            case window.YT.PlayerState.BUFFERING:
                status = 'loading';
                break;
            case window.YT.PlayerState.ENDED:
                status = 'idle';
                // Show scoring overlay before skipping
                handleSongEnded();
                break;
        }

        updatePlayerState(status);
    };

    // Update player state in Rust backend
    const updatePlayerState = async (status?: string, currentTime?: number, duration?: number) => {
        try {
            await invoke('update_player_state', {
                status: status || undefined,
                currentTime: currentTime !== undefined ? currentTime : undefined,
                duration: duration !== undefined ? duration : undefined,
            });
        } catch (error) {
            console.error('[Player] Failed to update player state:', error);
        }
    };

    // Poll current time
    const startTimePolling = () => {
        setInterval(() => {
            if (ytPlayerRef.current) {
                try {
                    const currentTime = ytPlayerRef.current.getCurrentTime();
                    const duration = ytPlayerRef.current.getDuration();
                    if (currentTime > 0) {
                        updatePlayerState(undefined, currentTime, duration);
                    }
                } catch (error) {
                    // Player might not be ready yet
                }
            }
        }, 1000);
    };

    // Handle song ended - show scoring then skip
    const handleSongEnded = useCallback(async () => {
        // Save the song title before it changes
        const songTitle = roomState?.player.currentSong?.title || '';
        setLastSongTitle(songTitle);

        // Generate and show score
        const score = generateScore();
        setCurrentScore(score);
        setShowScoring(true);
    }, [roomState?.player.currentSong?.title]);

    // Called when scoring animation completes
    const handleScoringComplete = async () => {
        setShowScoring(false);
        try {
            await invoke('process_command', {
                command: { type: 'SKIP' },
            });
        } catch (error) {
            console.error('[Player] Failed to skip song:', error);
        }
    };

    // Load new song when current song changes
    useEffect(() => {
        const currentSong = roomState?.player.currentSong;

        if (currentSong && currentSong.id !== currentSongRef.current?.id) {
            currentSongRef.current = currentSong;

            if (ytPlayerRef.current) {
                console.log('[Player] Loading video:', currentSong.youtubeId);
                ytPlayerRef.current.loadVideoById(currentSong.youtubeId);
            }
        } else if (!currentSong && currentSongRef.current) {
            // Song was removed (queue empty after skip) - stop the player
            currentSongRef.current = null;
            if (ytPlayerRef.current) {
                console.log('[Player] Stopping video - no current song');
                ytPlayerRef.current.stopVideo();
            }
        }
    }, [roomState?.player.currentSong]);

    // Handle player status changes from room state
    useEffect(() => {
        if (!ytPlayerRef.current) return;

        const status = roomState?.player.status;

        if (status === 'playing') {
            ytPlayerRef.current.playVideo();
        } else if (status === 'paused') {
            ytPlayerRef.current.pauseVideo();
        }
    }, [roomState?.player.status]);

    const currentSong = roomState?.player.currentSong;

    const playerContent = (
        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
            {!isAPIReady ? (
                <div className="player-idle">
                    <div className="spinner" style={{ width: 40, height: 40 }}></div>
                    <span>Loading player...</span>
                </div>
            ) : (
                <>
                    {/* Always render player div at full size */}
                    <div 
                        ref={playerRef} 
                        style={{ 
                            width: '100%', 
                            height: '100%',
                            position: 'absolute',
                            top: 0,
                            left: 0
                        }} 
                    />
                    {/* Overlay idle message on top when no song */}
                    {!currentSong && (
                        <div className="player-idle" style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: '100%',
                            height: '100%',
                            zIndex: 10,
                            background: 'var(--bg-primary, #000)'
                        }}>
                            <div className="player-idle-icon">{Icons.music}</div>
                            <div className="player-idle-text">No song playing</div>
                            <p style={{ color: 'var(--text-muted)', marginTop: 8 }}>
                                Add songs from the remote or control panel
                            </p>
                        </div>
                    )}
                </>
            )}
        </div>
    );

    // Fullscreen mode
    if (isFullscreen) {
        return (
            <>
                <div className="fullscreen-overlay">
                    <div className="fullscreen-player">
                        {playerContent}
                    </div>
                    <div className="fullscreen-controls">
                        <button className="btn-icon" onClick={onToggleFullscreen}>
                            {Icons.minimize}
                        </button>
                    </div>
                </div>

                {showScoring && (
                    <ScoringOverlay
                        score={currentScore}
                        onComplete={handleScoringComplete}
                        songTitle={lastSongTitle}
                    />
                )}
            </>
        );
    }

    // Normal mode
    return (
        <div className="player-container">
            <button
                className="btn-icon btn-fullscreen"
                onClick={onToggleFullscreen}
                title="Enter fullscreen"
            >
                {Icons.maximize}
            </button>

            <div className="player-inner">
                {playerContent}
            </div>

            {currentSong && (
                <div style={{
                    padding: '16px 20px',
                    background: 'var(--bg-secondary)',
                    borderTop: '1px solid var(--border)'
                }}>
                    <h3 style={{ fontSize: 18, fontWeight: 600 }}>
                        {currentSong.title}
                    </h3>
                    <p style={{ color: 'var(--text-secondary)', marginTop: 4 }}>
                        {currentSong.artist || 'Unknown Artist'} • Added by {currentSong.addedBy}
                    </p>
                </div>
            )}

            {showScoring && (
                <ScoringOverlay
                    score={currentScore}
                    onComplete={handleScoringComplete}
                    songTitle={lastSongTitle}
                />
            )}
        </div>
    );
};

export default Player;
