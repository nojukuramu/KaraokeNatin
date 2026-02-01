import { Song } from '@karaokenatin/shared';
import { useSendCommand } from '@/lib/useRoomState';

interface PlaylistProps {
    songs: Song[];
}

export default function Playlist({ songs }: PlaylistProps) {
    const sendCommand = useSendCommand();

    const handleAddToQueue = (songId: string) => {
        if (sendCommand) {
            sendCommand({ type: 'PLAYLIST_TO_QUEUE', songId });
        }
    };

    const handleRemoveFromPlaylist = (songId: string) => {
        if (sendCommand) {
            sendCommand({ type: 'PLAYLIST_REMOVE', songId });
        }
    };

    if (songs.length === 0) {
        return (
            <div className="glass-card">
                <h2 className="text-xl font-bold mb-4">🎵 Playlist</h2>
                <p className="text-white/60 text-center py-4">
                    No songs in playlist. Add songs to your playlist from search results!
                </p>
            </div>
        );
    }

    return (
        <div className="glass-card">
            <h2 className="text-xl font-bold mb-4">🎵 Playlist ({songs.length})</h2>
            <div className="space-y-3">
                {songs.map((song, index) => (
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
                                onClick={() => handleAddToQueue(song.id)}
                                className="px-3 py-1 text-sm bg-primary-500 hover:bg-primary-600 rounded-full transition-colors"
                                title="Add to queue"
                            >
                                ➕ Queue
                            </button>
                            <button
                                onClick={() => handleRemoveFromPlaylist(song.id)}
                                className="px-3 py-1 text-sm bg-red-500/20 hover:bg-red-500/40 text-red-300 rounded-full transition-colors"
                                title="Remove from playlist"
                            >
                                ✕
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
