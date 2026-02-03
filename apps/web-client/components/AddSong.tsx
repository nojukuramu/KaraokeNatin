import { useState } from 'react';
import { useSendCommand, useInputFocus } from '@/lib/useRoomState';

export default function AddSong() {
    const [youtubeUrl, setYoutubeUrl] = useState('');
    const [isAdding, setIsAdding] = useState(false);
    const [addedType, setAddedType] = useState<'queue' | 'playlist' | null>(null);
    const sendCommand = useSendCommand();
    const setInputFocused = useInputFocus();

    const handleAddToQueue = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!youtubeUrl.trim() || !sendCommand) return;

        setIsAdding(true);
        setInputFocused(false);
        try {
            sendCommand({ type: 'ADD_SONG', youtubeUrl: youtubeUrl.trim() });
            setYoutubeUrl('');
            setAddedType('queue');
        } finally {
            setTimeout(() => {
                setIsAdding(false);
                setAddedType(null);
            }, 1500);
        }
    };

    const handleAddToPlaylist = async () => {
        if (!youtubeUrl.trim() || !sendCommand) return;

        setIsAdding(true);
        setInputFocused(false);
        try {
            sendCommand({ type: 'PLAYLIST_ADD', youtubeUrl: youtubeUrl.trim() });
            setYoutubeUrl('');
            setAddedType('playlist');
        } finally {
            setTimeout(() => {
                setIsAdding(false);
                setAddedType(null);
            }, 1500);
        }
    };

    return (
        <div className="glass-card">
            <h2 className="text-xl font-bold mb-4">Add Song</h2>

            <form onSubmit={handleAddToQueue} className="space-y-3">
                <input
                    type="text"
                    value={youtubeUrl}
                    onChange={(e) => setYoutubeUrl(e.target.value)}
                    onFocus={() => setInputFocused(true)}
                    onBlur={() => setInputFocused(false)}
                    placeholder="Paste YouTube URL or Video ID"
                    className="w-full px-4 py-3 rounded-lg bg-white/20 backdrop-blur border border-white/30 focus:outline-none focus:ring-2 focus:ring-primary-500 text-white placeholder-white/50"
                />

                <div className="flex gap-3">
                    <button
                        type="submit"
                        disabled={isAdding || !youtubeUrl.trim()}
                        className="btn-primary flex-1 disabled:opacity-50 disabled:cursor-not-allowed min-h-[48px]"
                    >
                        <span className="inline-flex items-center justify-center gap-2">
                            {addedType === 'queue' ? (
                                <>✓ Added to Queue!</>
                            ) : isAdding ? (
                                <>
                                    <span className="inline-block animate-spin h-4 w-4 border-2 border-white/30 border-t-white rounded-full"></span>
                                    Adding...
                                </>
                            ) : (
                                <>➕ Add to Queue</>
                            )}
                        </span>
                    </button>
                    <button
                        type="button"
                        onClick={handleAddToPlaylist}
                        disabled={isAdding || !youtubeUrl.trim()}
                        className="px-4 py-3 rounded-lg bg-white/20 hover:bg-white/30 border border-white/30 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[48px] flex items-center justify-center"
                    >
                        {addedType === 'playlist' ? '✓ Added!' : '🎵 Playlist'}
                    </button>
                </div>
            </form>

            <div className="mt-4 text-xs text-white/60">
                <p>Supported formats:</p>
                <ul className="list-disc list-inside mt-1 space-y-1">
                    <li>https://www.youtube.com/watch?v=VIDEO_ID</li>
                    <li>https://youtu.be/VIDEO_ID</li>
                    <li>VIDEO_ID</li>
                </ul>
            </div>
        </div>
    );
}
