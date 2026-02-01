import { Song } from '@karaokenatin/shared';

interface QueueProps {
    songs: Song[];
}

const Queue = ({ songs }: QueueProps) => {
    if (songs.length === 0) {
        return (
            <div className="queue-display p-6 bg-white/10 rounded-lg">
                <h2 className="text-xl font-bold mb-4 text-white">Queue</h2>
                <div className="text-center text-white/60 py-8">
                    <p>No songs in queue</p>
                    <p className="text-sm mt-2">Add songs from your remote control</p>
                </div>
            </div>
        );
    }

    return (
        <div className="queue-display p-6 bg-white/10 rounded-lg">
            <h2 className="text-xl font-bold mb-4 text-white">
                Queue ({songs.length})
            </h2>

            <div className="space-y-3 max-h-96 overflow-y-auto">
                {songs.map((song, index) => (
                    <div
                        key={song.id}
                        className="flex items-center gap-3 p-3 bg-white/5 rounded-lg hover:bg-white/10 transition-colors"
                    >
                        <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center bg-white/10 rounded-full">
                            <span className="text-sm font-bold text-white">{index + 1}</span>
                        </div>

                        <img
                            src={song.thumbnailUrl}
                            alt={song.title}
                            className="w-16 h-12 object-cover rounded flex-shrink-0"
                        />

                        <div className="flex-1 min-w-0">
                            <div className="text-white font-semibold truncate">
                                {song.title}
                            </div>
                            <div className="text-white/60 text-sm truncate">
                                {song.artist}
                            </div>
                        </div>

                        <div className="text-white/60 text-sm flex-shrink-0">
                            {formatDuration(song.duration)}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

function formatDuration(seconds: number): string {
    if (seconds === 0) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export default Queue;
