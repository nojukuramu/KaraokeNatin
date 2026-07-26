import { useEffect, useRef, useState, useCallback } from 'react';
import { useRoomState } from '../hooks/useRoomState';
import { useMicCoverage, coverageToScore } from '../hooks/useMicCoverage';
import { useWakeLock } from '../hooks/useWakeLock';
import { invoke } from '@tauri-apps/api/core';
import { useFocusable, FocusContext } from '@noriginmedia/norigin-spatial-navigation';
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
    // Transport controls driven by SET_VOLUME / TOGGLE_MUTE / SEEK.
    setVolume(volume: number): void;
    getVolume(): number;
    mute(): void;
    unMute(): void;
    isMuted(): boolean;
    seekTo(seconds: number, allowSeekAhead: boolean): void;
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

const Player = () => {
    const playerRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const ytPlayerRef = useRef<YouTubePlayer | null>(null);
    const timePollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const { roomState } = useRoomState();

    // Keep the display awake while a song is playing. The host is typically
    // unattended on a TV, so letting the screen sleep mid-song is a real
    // failure rather than a nicety.
    useWakeLock(roomState?.player.status === 'playing');
    const [isAPIReady, setIsAPIReady] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const currentSongRef = useRef(roomState?.player.currentSong);
    const [showScoring, setShowScoring] = useState(false);
    const [currentScore, setCurrentScore] = useState(0);
    const [lastSongTitle, setLastSongTitle] = useState('');

    // Real scoring: coverage of the song's runtime with mic-level input.
    // start()/stop() are referentially stable across renders (see the hook),
    // so it's safe to call them from refs/closures captured at various times.
    const { start: micStart, stop: micStop } = useMicCoverage();
    // Whether we've already attempted to start mic capture for the *current*
    // song (guards against re-starting on every PLAYING transition, e.g.
    // after a buffering pause/resume).
    const micAttemptedRef = useRef(false);
    // Whether mic capture actually succeeded for the current song (permission
    // granted, device available). Only true between a successful start() and
    // the next stop()/song change.
    const micActiveRef = useRef(false);

    const { ref: focusRef, focusKey } = useFocusable();


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
        // Check if YT API is fully loaded (YT exists AND YT.Player is a constructor)
        if (window.YT && typeof window.YT.Player === 'function') {
            setIsAPIReady(true);
            return;
        }

        // If YT exists but Player isn't ready, wait for it
        if (window.YT) {
            const checkPlayer = setInterval(() => {
                if (typeof window.YT.Player === 'function') {
                    clearInterval(checkPlayer);
                    setIsAPIReady(true);
                }
            }, 100);
            // Timeout after 10 seconds
            setTimeout(() => clearInterval(checkPlayer), 10000);
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
            if (timePollingRef.current) {
                clearInterval(timePollingRef.current);
                timePollingRef.current = null;
            }
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
                // Start mic coverage tracking the first time this song
                // actually starts playing (not on every PLAYING transition,
                // e.g. resuming after a buffering pause). Permission is
                // only ever prompted here — never at app launch.
                if (!micAttemptedRef.current) {
                    micAttemptedRef.current = true;
                    void micStart().then((started) => {
                        micActiveRef.current = started;
                    });
                }
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
        // Clear any existing interval to prevent leaks
        if (timePollingRef.current) {
            clearInterval(timePollingRef.current);
            timePollingRef.current = null;
        }
        let lastBroadcastTime = 0;
        timePollingRef.current = setInterval(() => {
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

    // Handle song ended - show scoring (real mic-coverage score) then skip.
    // Mic failures must never block the queue: if capture never started for
    // this song (denied, unavailable, errored), skip straight to the next
    // song instead of showing a score.
    const handleSongEnded = useCallback(async () => {
        // Save the song title before it changes
        const songTitle = roomState?.player.currentSong?.title || '';
        setLastSongTitle(songTitle);

        const wasTracking = micActiveRef.current;
        micAttemptedRef.current = false;
        micActiveRef.current = false;

        if (!wasTracking) {
            try {
                await invoke('process_command', {
                    command: { type: 'SKIP' },
                });
            } catch (error) {
                console.error('[Player] Failed to skip song:', error);
            }
            return;
        }

        try {
            const coverage = await micStop();
            setCurrentScore(coverageToScore(coverage));
            setShowScoring(true);
        } catch (error) {
            console.error('[Player] Failed to read mic coverage, skipping score:', error);
            try {
                await invoke('process_command', {
                    command: { type: 'SKIP' },
                });
            } catch (skipError) {
                console.error('[Player] Failed to skip song:', skipError);
            }
        }
    }, [roomState?.player.currentSong?.title, micStop]);

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

            // A new song is loading. If mic capture from the previous song
            // is still running (e.g. it was manually skipped before
            // handleSongEnded ever fired), tear it down now so the mic
            // indicator doesn't leak into the next song.
            if (micAttemptedRef.current) {
                micAttemptedRef.current = false;
                micActiveRef.current = false;
                void micStop();
            }

            if (ytPlayerRef.current) {
                console.log('[Player] Loading video:', currentSong.youtubeId);
                // loadVideoById auto-plays by default in YouTube API
                ytPlayerRef.current.loadVideoById(currentSong.youtubeId);
            }
        } else if (!currentSong && currentSongRef.current) {
            // Song was removed (queue empty after skip) - stop the player
            currentSongRef.current = null;
            if (micAttemptedRef.current) {
                micAttemptedRef.current = false;
                micActiveRef.current = false;
                void micStop();
            }
            if (ytPlayerRef.current) {
                console.log('[Player] Stopping video - no current song');
                ytPlayerRef.current.stopVideo();
            }
        }
    }, [roomState?.player.currentSong, micStop]);

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

    // Apply volume and mute from room state.
    //
    // SET_VOLUME and TOGGLE_MUTE already updated RoomState in Rust, but nothing
    // ever pushed those values into the YouTube player, so the commands were
    // inert end to end. This is the half that makes them audible.
    const volume = roomState?.player.volume;
    const isMuted = roomState?.player.isMuted;

    useEffect(() => {
        const player = ytPlayerRef.current;
        if (!player || volume === undefined) return;
        try {
            player.setVolume(Math.max(0, Math.min(100, volume)));
        } catch (e) {
            console.warn('[Player] setVolume failed:', e);
        }
    }, [volume, isAPIReady]);

    useEffect(() => {
        const player = ytPlayerRef.current;
        if (!player || isMuted === undefined) return;
        try {
            if (isMuted) player.mute();
            else player.unMute();
        } catch (e) {
            console.warn('[Player] mute toggle failed:', e);
        }
    }, [isMuted, isAPIReady]);

    // Apply externally requested seeks.
    //
    // currentTime is bidirectional: the player reports progress into it every
    // second, and SEEK writes into it. Reacting to every change would fight our
    // own reporting, so only a divergence larger than normal playback drift is
    // treated as a real seek request.
    const stateTime = roomState?.player.currentTime;
    const SEEK_EPSILON_SECONDS = 2.5;

    useEffect(() => {
        const player = ytPlayerRef.current;
        if (!player || stateTime === undefined) return;
        try {
            const actual = player.getCurrentTime?.();
            if (typeof actual !== 'number') return;
            if (Math.abs(actual - stateTime) > SEEK_EPSILON_SECONDS) {
                player.seekTo(stateTime, true);
            }
        } catch (e) {
            console.warn('[Player] seek failed:', e);
        }
    }, [stateTime]);

    const currentSong = roomState?.player.currentSong;


    const playerContent = (
        <div
            style={{ position: 'relative', width: '100%', height: '100%' }}
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
                    {/* Overlay idle message on top when no song */}
                </>
            )}
        </div>
    );

    // Single render - container handles fullscreen
    return (
        <FocusContext.Provider value={focusKey}>
            <div
                ref={(node: HTMLDivElement | null) => {
                    containerRef.current = node;
                    if (focusRef && 'current' in focusRef) {
                        (focusRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
                    }
                }}
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
                    tabIndex={0}
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
                    <div className="player-song-info">
                        <h3 className="player-song-title">{currentSong.title}</h3>
                        <p className="player-song-meta">
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
        </FocusContext.Provider>
    );
};

export default Player;
