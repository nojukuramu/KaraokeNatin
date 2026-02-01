import { useState, useEffect } from 'react';
import Player from './components/Player';
import ControlPanel from './components/ControlPanel';
import { useRoomState } from './hooks/useRoomState';
import { usePeerHost } from './hooks/usePeerHost';
import { invoke } from '@tauri-apps/api/core';

interface SearchResult {
  url: string;
  title: string;
  channel: string;
  duration: string;
  thumbnail: string;
}

function App() {
  const { roomState, initializeRoom } = useRoomState();
  const { connectionUrl, connectedClients } = usePeerHost();
  const [isPanelCollapsed, setIsPanelCollapsed] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    // Initialize room on mount
    initializeRoom();
  }, []);

  const handleSearch = async (query: string) => {
    setSearching(true);
    setSearchResults([]);
    try {
      const results = await invoke<SearchResult[]>('search_youtube', { query, limit: 10 });
      console.log('Search results:', results);
      setSearchResults(results);
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setSearching(false);
    }
  };

  const handleAddSong = async (url: string) => {
    try {
      await invoke('process_command', {
        command: {
          type: 'ADD_SONG',
          youtubeUrl: url,
          addedBy: 'Host'
        }
      });
      console.log('Song added');
    } catch (error) {
      console.error('Failed to add song:', error);
    }
  };

  return (
    <div className="app-container">
      <div className="main-area">
        <Player />
      </div>

      <ControlPanel
        connectionUrl={connectionUrl}
        roomId={roomState?.roomId}
        queue={roomState?.queue || []}
        playlist={roomState?.playlist || []}
        connectedClients={connectedClients}
        isCollapsed={isPanelCollapsed}
        onToggle={() => setIsPanelCollapsed(!isPanelCollapsed)}
        onSearch={handleSearch}
        searchResults={searchResults}
        searching={searching}
        onAddSong={handleAddSong}
        isPlaying={roomState?.player.status === 'playing'}
        currentSong={roomState?.player.currentSong || null}
      />
    </div>
  );
}

export default App;
