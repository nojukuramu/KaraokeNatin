import { useState } from 'react';
import { PlaylistCollection } from '@karaokenatin/shared';
import { useSendCommand, useInputFocus, usePlaylists } from '@/lib/useRoomState';

export default function AddSong() {
    const [youtubeUrl, setYoutubeUrl] = useState('');
    const [isAdding, setIsAdding] = useState(false);
    const [addedType, setAddedType] = useState<'queue' | 'playlist' | null>(null);
    const [showCollectionPicker, setShowCollectionPicker] = useState(false);
    const sendCommand = useSendCommand();
    const setInputFocused = useInputFocus();
    const collections = usePlaylists();

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

    const handleAddToCollection = (collectionId: string) => {
        if (!youtubeUrl.trim() || !sendCommand) return;

        setIsAdding(true);
        setInputFocused(false);
        setShowCollectionPicker(false);
        try {
            sendCommand({ type: 'PLAYLIST_ADD', youtubeUrl: youtubeUrl.trim(), collectionId });
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
                        className="btn-primary flex-1 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap overflow-hidden"
                    >
                        {addedType === 'queue' ? '✓ Added!' : isAdding ? 'Adding...' : '➕ Add to Queue'}
                    </button>
                    <div className="relative">
                        <button
                            type="button"
                            onClick={() => setShowCollectionPicker(!showCollectionPicker)}
                            disabled={isAdding || !youtubeUrl.trim()}
                            className="px-4 py-3 rounded-lg bg-white/20 hover:bg-white/30 border border-white/30 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap overflow-hidden"
                        >
                            {addedType === 'playlist' ? '✓ Added!' : '🎵 Playlist ▾'}
                        </button>
                        {showCollectionPicker && collections.length > 0 && (
                            <div className="absolute bottom-full mb-2 right-0 bg-gray-900 border border-white/20 rounded-lg shadow-xl min-w-[200px] z-50 overflow-hidden">
                                <div className="px-3 py-2 text-xs text-white/50 font-semibold uppercase">Add to Collection</div>
                                {collections.map((col: PlaylistCollection) => (
                                    <button
                                        key={col.id}
                                        onClick={() => handleAddToCollection(col.id)}
                                        className="w-full text-left px-3 py-2 hover:bg-white/10 text-sm flex items-center justify-between transition-colors"
                                    >
                                        <span>{col.visibility === 'public' ? '🌐' : '🔒'} {col.name}</span>
                                        <span className="text-white/40 text-xs">{col.songs.length}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
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
