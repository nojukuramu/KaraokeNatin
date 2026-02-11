import { useState, useEffect, useCallback, useRef } from 'react';
import { init, useFocusable, FocusContext } from '@noriginmedia/norigin-spatial-navigation';
import Player from './components/Player';
import ControlPanel from './components/ControlPanel';
import GuestMode from './components/GuestMode';
import ModeSelect from './components/ModeSelect';
import Library from './components/Library';
import { useRoomState } from './hooks/useRoomState';
import { usePeerHost } from './hooks/usePeerHost';
import { invoke } from '@tauri-apps/api/core';
import { startHostServer } from './lib/commands';
import { Clapperboard, SlidersHorizontal, Unplug, ArrowLeft } from 'lucide-react';

// Initialize spatial navigation for DPAD / Android TV
init({
  debug: false,
  visualDebug: false,
});

interface SearchResult {
  url: string;
  title: string;
  channel: string;
  duration: string;
  thumbnail: string;
}

type AppMode = 'select' | 'host' | 'guest' | 'library';

// ---- Host-mode wrapper (hooks only active when rendered) ----
function HostView({ onBack }: { onBack: () => void }) {
  const { roomState, loading, initializeRoom } = useRoomState();
  const { connectionUrl, connectedClients } = usePeerHost();
  const [isPanelCollapsed, setIsPanelCollapsed] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [activeTab, setActiveTab] = useState<'player' | 'controls'>('player');

  const { ref, focusKey } = useFocusable();

  useEffect(() => {
    // Start web server lazily, then initialize room
    (async () => {
      try {
        await startHostServer();
      } catch (e) {
        console.warn('[Host] startHostServer:', e);
      }
      initializeRoom();
    })();
  }, []);

  // Detect mobile/small screen
  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth <= 768 || 'ontouchstart' in window;
      setIsMobile(mobile);
      if (mobile && window.innerHeight > window.innerWidth) {
        setActiveTab('controls');
      }
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Global DPAD handler for Android TV back button
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'GoBack') {
        if (!isPanelCollapsed && !isMobile) {
          setIsPanelCollapsed(true);
          e.preventDefault();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPanelCollapsed, isMobile]);

  const handleSearch = async (query: string) => {
    setSearching(true);
    setSearchResults([]);
    try {
      const results = await invoke<SearchResult[]>('search_youtube', { query, limit: 10 });
      setSearchResults(results);
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setSearching(false);
    }
  };

  const handleAddToPlaylist = async (url: string, collectionId: string) => {
    await invoke('process_command', {
      command: {
        type: 'PLAYLIST_ADD',
        youtubeUrl: url,
        collectionId,
        addedBy: 'Host',
      },
    });
  };

  const handleTabSwitch = useCallback((tab: 'player' | 'controls') => {
    setActiveTab(tab);
  }, []);

  if (loading) {
    return (
      <div className="app-loading">
        <div className="app-loading-title">🎤 KaraokeNatin</div>
        <div className="app-loading-spinner"></div>
        <div className="app-loading-hint">Starting host…</div>
      </div>
    );
  }

  return (
    <FocusContext.Provider value={focusKey}>
      <div ref={ref} className={`app-container ${isMobile ? 'mobile' : 'desktop'}`}>
        {/* Mobile Tab Bar */}
        {isMobile && (
          <div className="mobile-tab-bar">
            <button className={`mobile-tab ${activeTab === 'player' ? 'active' : ''}`} onClick={() => handleTabSwitch('player')}>
              <Clapperboard size={16} /> Player
            </button>
            <button className={`mobile-tab ${activeTab === 'controls' ? 'active' : ''}`} onClick={() => handleTabSwitch('controls')}>
              <SlidersHorizontal size={16} /> Controls
            </button>
          </div>
        )}

        {/* Main player area */}
        <div className={`main-area ${isMobile && activeTab !== 'player' ? 'hidden-mobile' : ''}`}>
          <Player />
          <footer className="yt-footer-host">
            Videos are played via YouTube embedding. All videos are subject to YouTube's{' '}
            <a href="https://www.youtube.com/t/terms" target="_blank" rel="noopener noreferrer">Terms of Service</a>.
          </footer>
        </div>

        {/* Control panel / sidebar */}
        <div className={`panel-wrapper ${isMobile && activeTab !== 'controls' ? 'hidden-mobile' : ''}`}>
          <ControlPanel
            connectionUrl={connectionUrl}
            roomId={roomState?.roomId}
            queue={roomState?.queue || []}
            playlists={roomState?.playlists || []}
            connectedClients={connectedClients}
            isCollapsed={isMobile ? false : isPanelCollapsed}
            onToggle={() => setIsPanelCollapsed(!isPanelCollapsed)}
            onSearch={handleSearch}
            searchResults={searchResults}
            searching={searching}
            onAddToPlaylist={handleAddToPlaylist}
            isPlaying={roomState?.player.status === 'playing'}
            currentSong={roomState?.player.currentSong || null}
            isMobile={isMobile}
            onBack={onBack}
          />
        </div>
      </div>
    </FocusContext.Provider>
  );
}

// ---- Guest-mode wrapper ----
function GuestView({ onBack }: { onBack: () => void }) {
  const [guestHostUrl, setGuestHostUrl] = useState<string | null>(null);
  const [guestIframeLoaded, setGuestIframeLoaded] = useState(false);
  const [showScanner, setShowScanner] = useState(true);
  const guestIframeRef = useRef<HTMLIFrameElement>(null);

  const handleGuestConnect = useCallback((hostUrl: string) => {
    const url = new URL(hostUrl);
    url.searchParams.set('mode', 'inapp');
    url.searchParams.set('t', Date.now().toString()); // Bust WebView cache
    setGuestHostUrl(url.toString());
    setGuestIframeLoaded(false);
    setShowScanner(false);
  }, []);

  const handleGuestDisconnect = useCallback(() => {
    setGuestHostUrl(null);
    setGuestIframeLoaded(false);
    setShowScanner(true);
  }, []);

  // Bridge for Remote UI to access Native features (My Library)
  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      // Security check: ensure message is from our iframe
      if (!guestIframeRef.current || event.source !== guestIframeRef.current.contentWindow) {
        return;
      }

      const { type, payload } = event.data;

      try {
        if (type === 'REQUEST_LOCAL_PLAYLISTS') {
          const playlists = await invoke('get_playlists');
          guestIframeRef.current.contentWindow?.postMessage({
            type: 'LOCAL_PLAYLISTS_UPDATED',
            playlists
          }, '*');
        }
        else if (type === 'CREATE_LOCAL_COLLECTION') {
          await invoke('playlist_create_collection', {
            name: payload.name,
            visibility: 'personal' // Guest collections are personal by default
          });
          // Refresh
          const playlists = await invoke('get_playlists');
          guestIframeRef.current.contentWindow?.postMessage({
            type: 'LOCAL_PLAYLISTS_UPDATED',
            playlists
          }, '*');
        }
        else if (type === 'ADD_TO_LOCAL_PLAYLIST') {
          await invoke('playlist_add_song', {
            youtubeUrl: payload.youtubeUrl,
            collectionId: payload.collectionId,
            addedBy: 'Guest' // Or user's name if we had it, but 'Guest' is safer for now
          });
          // Refresh
          const playlists = await invoke('get_playlists');
          guestIframeRef.current.contentWindow?.postMessage({
            type: 'LOCAL_PLAYLISTS_UPDATED',
            playlists
          }, '*');
          // Also send success toast trigger
          guestIframeRef.current.contentWindow?.postMessage({
            type: 'TOAST',
            message: 'Saved to library'
          }, '*');
        }
        else if (type === 'REMOVE_FROM_LOCAL_PLAYLIST') {
          await invoke('playlist_remove_song', {
            collectionId: payload.collectionId,
            songId: payload.songId
          });
          // Refresh
          const playlists = await invoke('get_playlists');
          guestIframeRef.current.contentWindow?.postMessage({
            type: 'LOCAL_PLAYLISTS_UPDATED',
            playlists
          }, '*');
        }
        else if (type === 'IMPORT_LOCAL_PLAYLIST') {
          const json = await invoke<string>('load_collection_from_file');
          if (json) {
            await invoke('playlist_import_collection', { json });
            const playlists = await invoke('get_playlists');
            guestIframeRef.current.contentWindow?.postMessage({
              type: 'LOCAL_PLAYLISTS_UPDATED',
              playlists
            }, '*');
            guestIframeRef.current.contentWindow?.postMessage({
              type: 'TOAST',
              message: 'Collection imported'
            }, '*');
          }
        }
        else if (type === 'EXPORT_LOCAL_PLAYLIST') {
          await invoke('save_collection_to_file', {
            collectionId: payload.collectionId
          });
        }
      } catch (err) {
        console.error('[GuestView] Bridge error:', err);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  return (
    <div className="guest-view">
      {guestHostUrl ? (
        <div className="guest-iframe-area">
          <div className="guest-banner">
            <span className="guest-banner-label">
              {guestIframeLoaded ? 'Connected to remote host' : 'Connecting...'}
            </span>
            <button className="btn-sm btn-secondary guest-banner-btn" onClick={handleGuestDisconnect}>
              <Unplug size={14} /> Disconnect
            </button>
          </div>
          {!guestIframeLoaded && (
            <div className="guest-iframe-loading">
              <div className="spinner" />
              <p>Loading remote control...</p>
            </div>
          )}
          <iframe
            ref={guestIframeRef}
            src={guestHostUrl}
            className="guest-inline-iframe"
            style={{ opacity: guestIframeLoaded ? 1 : 0 }}
            onLoad={() => setGuestIframeLoaded(true)}
            title="Remote Control"
            allow="microphone; camera"
          />
          <footer className="yt-footer-host">
            Videos are played via YouTube embedding. All videos are subject to YouTube's{' '}
            <a href="https://www.youtube.com/t/terms" target="_blank" rel="noopener noreferrer">Terms of Service</a>.
          </footer>
        </div>
      ) : showScanner ? (
        <div className="guest-scan-wrapper">
          <button className="mode-back-btn" onClick={onBack}>
            <ArrowLeft size={16} /> Back
          </button>
          <GuestMode
            onClose={onBack}
            onConnect={handleGuestConnect}
          />
        </div>
      ) : null}
    </div>
  );
}

// ---- Root App ----
function App() {
  const [appMode, setAppMode] = useState<AppMode>('select');

  const handleBack = useCallback(() => setAppMode('select'), []);

  if (appMode === 'select') {
    return (
      <ModeSelect
        onSelectHost={() => setAppMode('host')}
        onSelectGuest={() => setAppMode('guest')}
        onSelectLibrary={() => setAppMode('library')}
      />
    );
  }

  if (appMode === 'host') {
    return <HostView onBack={handleBack} />;
  }

  if (appMode === 'library') {
    return <Library onBack={handleBack} />;
  }

  return <GuestView onBack={handleBack} />;
}

export default App;
