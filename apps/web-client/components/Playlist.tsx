import { useState } from 'react';
import { PlaylistCollection } from '@karaokenatin/shared';
import { useSendCommand } from '@/lib/useRoomState';

interface PlaylistProps {
    collections: PlaylistCollection[];
}

export default function Playlist({ collections }: PlaylistProps) {
    const sendCommand = useSendCommand();
    const [activeIdx, setActiveIdx] = useState(0);

    const handleAddToQueue = (collectionId: string, songId: string) => {
        if (sendCommand) {
            sendCommand({ type: 'PLAYLIST_TO_QUEUE', songId, collectionId });
        }
    };

    const handleRemoveFromPlaylist = (collectionId: string, songId: string) => {
        if (sendCommand) {
            sendCommand({ type: 'PLAYLIST_REMOVE', songId, collectionId });
        }
    };

    const totalSongs = collections.reduce((sum, c) => sum + c.songs.length, 0);

    if (collections.length === 0) {
        return (
            <div className="glass-card">
                <h2 className="text-xl font-bold mb-4">🎵 Playlists</h2>
                <p className="text-white/60 text-center py-4">
                    No playlists available yet.
                </p>
            </div>
        );
    }

    const active = collections[activeIdx] || collections[0];

    return (
        <div className="glass-card">
            <h2 className="text-xl font-bold mb-4">🎵 Playlists ({totalSongs})</h2>
            
            {/* Collection tabs */}
            <div className="flex gap-2 overflow-x-auto pb-3 mb-3">
                {collections.map((col, i) => (
                    <button
                        key={col.id}
                        onClick={() => setActiveIdx(i)}
                        className={`px-3 py-1.5 rounded-full text-sm whitespace-nowrap transition-colors ${
                            i === activeIdx
                                ? 'bg-primary-500 text-white'
                                : 'bg-white/10 text-white/70 hover:bg-white/20'
                        }`}
                    >
                        {col.visibility === 'public' ? '🌐' : '🔒'} {col.name} ({col.songs.length})
                    </button>
                ))}
            </div>

            {/* Songs in active collection */}
            {active.songs.length === 0 ? (
                <p className="text-white/60 text-center py-4">
                    No songs in &quot;{active.name}&quot;
                </p>
            ) : (
                <div className="space-y-3">
                    {active.songs.map((song, index) => (
                        <div
                            key={song.id}
                            className="flex items-center gap-3 p-3 bg-white/10 rounded-lg"
                        >
                            <span className="text-white/50 w-6 text-center">{index + 1}</span>
                            <img
                                src={song.thumbnailUrl || `https://i.ytimg.com/vi/${song.youtubeId}/mqdefault.jpg`}
                                alt={song.title}
                                className="w-16 h-12 object-cover rounded"
                            />
                            <div className="flex-1 min-w-0">
                                <p className="font-medium truncate">{song.title}</p>
                                <p className="text-sm text-white/60 truncate">{song.artist}</p>
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => handleAddToQueue(active.id, song.id)}
                                    className="px-3 py-1 text-sm bg-primary-500 hover:bg-primary-600 rounded-full transition-colors"
                                    title="Add to queue"
                                >
                                    ➕ Queue
                                </button>
                                <button
                                    onClick={() => handleRemoveFromPlaylist(active.id, song.id)}
                                    className="px-3 py-1 text-sm bg-red-500/20 hover:bg-red-500/40 text-red-300 rounded-full transition-colors"
                                    title="Remove from playlist"
                                >
                                    ✕
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
