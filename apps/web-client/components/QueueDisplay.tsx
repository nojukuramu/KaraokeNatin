import { Song } from '@karaokenatin/shared';

interface QueueDisplayProps {
    songs: Song[];
}

export default function QueueDisplay({ songs }: QueueDisplayProps) {
    if (songs.length === 0) {
        return (
            <div className="glass-card text-center py-8 text-white/60">
                <p>Queue is empty</p>
            </div>
        );
    }

    return (
        <div className="glass-card">
            <h2 className="text-xl font-bold mb-4">Queue ({songs.length})</h2>
            <div className="space-y-3">
                {songs.map((song, index) => (
                    <div
                        key={song.id}
                        className="flex items-center gap-3 bg-white/10 rounded-lg p-3"
                    >
                        <div className="text-yellow-300 font-bold text-lg w-8 text-center">
                            {index + 1}
                        </div>
                        <img
                            src={song.thumbnailUrl}
                            alt={song.title}
                            className="w-16 h-12 rounded object-cover"
                        />
                        <div className="flex-1 min-w-0">
                            <p className="font-semibold truncate">{song.title}</p>
                            <p className="text-sm text-white/70 truncate">{song.artist}</p>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
