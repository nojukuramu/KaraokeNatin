import { Song } from '@karaokenatin/shared';

interface NowPlayingProps {
    song: Song | null | undefined;
}

export default function NowPlaying({ song }: NowPlayingProps) {
    if (!song) {
        return (
            <div className="text-center py-8 text-white/60">
                <p>No song currently playing</p>
            </div>
        );
    }

    return (
        <div className="flex items-center gap-4">
            <img
                src={song.thumbnailUrl}
                alt={song.title}
                className="w-24 h-18 rounded-lg object-cover"
            />
            <div className="flex-1 min-w-0">
                <h2 className="text-xl font-bold truncate">{song.title}</h2>
                <p className="text-white/80 truncate">{song.artist}</p>
                <p className="text-sm text-white/60">
                    {Math.floor(song.duration / 60)}:{String(song.duration % 60).padStart(2, '0')}
                </p>
            </div>
        </div>
    );
}
