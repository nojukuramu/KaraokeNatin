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
    ),
    play: (
        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="currentColor" stroke="none">
            <polygon points="5 3 19 12 5 21 5 3"></polygon>
        </svg>
    ),
    pause: (
        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="currentColor" stroke="none">
            <rect x="6" y="4" width="4" height="16"></rect>
            <rect x="14" y="4" width="4" height="16"></rect>
        </svg>
    ),
    skipForward: (
        <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="5 4 15 12 5 20 5 4"></polygon>
            <line x1="19" y1="5" x2="19" y2="19"></line>
        </svg>
    )
};

// Generate random score (70-100, 0.5% chance of 101)
const generateScore = (): number => {
    const perfectChance = Math.random() < 0.005; // 0.5% chance
    if (perfectChance) return 101;
    return Math.floor(Math.random() * 31) + 70; // 70-100
};

const Player = () => {
    const playerRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const ytPlayerRef = useRef<YouTubePlayer | null>(null);
    const { roomState } = useRoomState();
    const [isAPIReady, setIsAPIReady] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const currentSongRef = useRef(roomState?.player.currentSong);
    const [showScoring, setShowScoring] = useState(false);
    const [currentScore, setCurrentScore] = useState(0);
    const [lastSongTitle, setLastSongTitle] = useState('');
    const [showControls, setShowControls] = useState(false);

    // Handle fullscreen change events
    useEffect(() => {
        const handleFullscreenChange = () => {
            setIsFullscreen(!!document.fullscreenElement);
        };

        document.addEventListener('fullscreenchange', handleFullscreenChange);
        return () => {
            document.removeEventListener('fullscreenchange', handleFullscreenChange);
        };
    }, []);

    // Custom control handlers
    const handlePlayPause = useCallback(async () => {
        const isPlaying = roomState?.player.status === 'playing';
        try {
            await invoke('process_command', {
                command: { type: isPlaying ? 'PAUSE' : 'PLAY' },
            });
        } catch (error) {
            console.error('[Player] Failed to toggle play/pause:', error);
        }
    }, [roomState?.player.status]);

    const handleSkip = useCallback(async () => {
        try {
            await invoke('process_command', {
                command: { type: 'SKIP' },
            });
        } catch (error) {
            console.error('[Player] Failed to skip:', error);
        }
    }, []);

    // Toggle true browser fullscreen
    const toggleFullscreen = useCallback(async () => {
        try {
            if (!document.fullscreenElement) {
                await containerRef.current?.requestFullscreen();
            } else {
                await document.exitFullscreen();
            }
        } catch (error) {
            console.error('[Player] Fullscreen error:', error);
        }
    }, []);

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
                controls: 0,
                modestbranding: 1,
                rel: 0,
                disablekb: 1,
                iv_load_policy: 3,
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
            case window.YT.PlayerState.CUED:
                // Video is ready, auto-play it
                console.log('[Player] Video cued, starting playback');
                ytPlayerRef.current?.playVideo();
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

    // Poll current time - throttle broadcasts to reduce network traffic
    const startTimePolling = () => {
        let lastBroadcastTime = 0;
        setInterval(() => {
            if (ytPlayerRef.current) {
                try {
                    const currentTime = ytPlayerRef.current.getCurrentTime();
                    const duration = ytPlayerRef.current.getDuration();
                    if (currentTime > 0) {
                        const now = Date.now();
                        // Only broadcast time updates every 5 seconds to reduce traffic
                        if (now - lastBroadcastTime >= 5000) {
                            lastBroadcastTime = now;
                            updatePlayerState(undefined, currentTime, duration);
                        }
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
    const handleScoringComplete = useCallback(async () => {
        setShowScoring(false);
        try {
            await invoke('process_command', {
                command: { type: 'SKIP' },
            });
        } catch (error) {
            console.error('[Player] Failed to skip song:', error);
        }
    }, []);

    // Load new song when current song changes
    useEffect(() => {
        const currentSong = roomState?.player.currentSong;

        if (currentSong && currentSong.id !== currentSongRef.current?.id) {
            currentSongRef.current = currentSong;

            if (ytPlayerRef.current) {
                console.log('[Player] Loading video:', currentSong.youtubeId);
                // loadVideoById auto-plays by default in YouTube API
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
    const isPlaying = roomState?.player.status === 'playing';

    const playerContent = (
        <div
            style={{ position: 'relative', width: '100%', height: '100%' }}
            onMouseEnter={() => setShowControls(true)}
            onMouseLeave={() => setShowControls(false)}
        >
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
                    {/* Custom controls overlay */}
                    {currentSong && (
                        <div className={`player-controls-overlay ${showControls ? 'visible' : ''}`}>
                            <div className="player-controls-bar">
                                <button
                                    className="player-control-btn player-control-btn-primary"
                                    onClick={handlePlayPause}
                                    title={isPlaying ? 'Pause' : 'Play'}
                                >
                                    {isPlaying ? Icons.pause : Icons.play}
                                </button>
                                <button
                                    className="player-control-btn"
                                    onClick={handleSkip}
                                    title="Skip"
                                >
                                    {Icons.skipForward}
                                </button>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );

    // Single render - container handles fullscreen
    return (
        <div
            ref={containerRef}
            className="player-container"
            style={isFullscreen ? {
                width: '100vw',
                height: '100vh',
                background: '#000',
                display: 'flex',
                flexDirection: 'column'
            } : undefined}
        >
            <button
                className="btn-icon btn-fullscreen"
                onClick={toggleFullscreen}
                title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
                style={isFullscreen ? {
                    position: 'absolute',
                    top: 16,
                    right: 16,
                    zIndex: 100
                } : undefined}
            >
                {isFullscreen ? Icons.minimize : Icons.maximize}
            </button>

            <div className="player-inner" style={isFullscreen ? { flex: 1 } : undefined}>
                {playerContent}
            </div>

            {currentSong && !isFullscreen && (
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
