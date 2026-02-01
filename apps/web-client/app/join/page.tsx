'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function JoinPage() {
    const router = useRouter();
    const [manualEntry, setManualEntry] = useState(false);
    const [roomId, setRoomId] = useState('');
    const [joinToken, setJoinToken] = useState('');

    useEffect(() => {
        // Check URL params (from QR code scan)
        const params = new URLSearchParams(window.location.search);
        const r = params.get('r');
        const t = params.get('t');

        if (r && t) {
            // Redirect to room page
            router.push(`/room/${r}?t=${t}`);
        }
    }, [router]);

    const handleManualJoin = (e: React.FormEvent) => {
        e.preventDefault();
        if (roomId && joinToken) {
            router.push(`/room/${roomId}?t=${joinToken}`);
        }
    };

    return (
        <div className="min-h-screen flex flex-col items-center justify-center p-6">
            <div className="glass-card max-w-md w-full">
                <h1 className="text-3xl font-bold mb-6 text-center">Join Room</h1>

                {!manualEntry ? (
                    <div className="text-center">
                        <p className="text-white/80 mb-6">
                            Scan the QR code displayed on the host screen
                        </p>
                        <button
                            onClick={() => setManualEntry(true)}
                            className="btn-secondary w-full"
                        >
                            Enter Room Code Manually
                        </button>
                    </div>
                ) : (
                    <form onSubmit={handleManualJoin} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium mb-2">Room ID</label>
                            <input
                                type="text"
                                value={roomId}
                                onChange={(e) => setRoomId(e.target.value)}
                                className="w-full px-4 py-3 rounded-lg bg-white/20 backdrop-blur border border-white/30 focus:outline-none focus:ring-2 focus:ring-primary-500"
                                placeholder="Enter room ID"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-2">Join Token</label>
                            <input
                                type="text"
                                value={joinToken}
                                onChange={(e) => setJoinToken(e.target.value)}
                                className="w-full px-4 py-3 rounded-lg bg-white/20 backdrop-blur border border-white/30 focus:outline-none focus:ring-2 focus:ring-primary-500"
                                placeholder="Enter join token"
                                required
                            />
                        </div>
                        <button type="submit" className="btn-primary w-full">
                            Join Room
                        </button>
                        <button
                            type="button"
                            onClick={() => setManualEntry(false)}
                            className="btn-secondary w-full"
                        >
                            Back to QR Scan
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
}
