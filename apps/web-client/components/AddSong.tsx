import { useState } from 'react';
import { ClientCommand } from '@karaokenatin/shared';

interface AddSongProps {
    onCommand: (command: ClientCommand) => void;
}

export default function AddSong({ onCommand }: AddSongProps) {
    const [youtubeUrl, setYoutubeUrl] = useState('');
    const [isAdding, setIsAdding] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!youtubeUrl.trim()) return;

        setIsAdding(true);
        try {
            onCommand({ type: 'ADD_SONG', youtubeUrl: youtubeUrl.trim() });
            setYoutubeUrl('');
        } finally {
            setTimeout(() => setIsAdding(false), 1000);
        }
    };

    return (
        <div className="glass-card">
            <h2 className="text-xl font-bold mb-4">Add Song</h2>

            <form onSubmit={handleSubmit} className="space-y-3">
                <input
                    type="text"
                    value={youtubeUrl}
                    onChange={(e) => setYoutubeUrl(e.target.value)}
                    placeholder="Paste YouTube URL or Video ID"
                    className="w-full px-4 py-3 rounded-lg bg-white/20 backdrop-blur border border-white/30 focus:outline-none focus:ring-2 focus:ring-primary-500 text-white placeholder-white/50"
                />

                <button
                    type="submit"
                    disabled={isAdding || !youtubeUrl.trim()}
                    className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {isAdding ? '➕ Adding...' : '➕ Add to Queue'}
                </button>
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
