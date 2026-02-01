'use client';

import { useParams, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { usePeerClient } from '@/lib/usePeerClient';
import { useRoomState } from '@/lib/useRoomState';
import Controls from '@/components/Controls';
import NowPlaying from '@/components/NowPlaying';
import QueueDisplay from '@/components/QueueDisplay';
import AddSong from '@/components/AddSong';

export default function RoomPage() {
    const params = useParams();
    const searchParams = useSearchParams();
    const roomId = params.id as string;
    const joinToken = searchParams.get('t') || '';

    const { connect, isConnected, sendCommand } = usePeerClient(roomId, joinToken);
    const { roomState } = useRoomState();
    const [displayName, setDisplayName] = useState('');
    const [hasJoined, setHasJoined] = useState(false);

    const handleJoin = (e: React.FormEvent) => {
        e.preventDefault();
        if (displayName.trim()) {
            connect(displayName);
            setHasJoined(true);
        }
    };

    if (!hasJoined) {
        return (
            <div className="min-h-screen flex items-center justify-center p-6">
                <form onSubmit={handleJoin} className="glass-card max-w-md w-full">
                    <h1 className="text-3xl font-bold mb-6 text-center">Enter Your Name</h1>
                    <input
                        type="text"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        className="w-full px-4 py-3 rounded-lg bg-white/20 backdrop-blur border border-white/30 focus:outline-none focus:ring-2 focus:ring-primary-500 mb-4"
                        placeholder="Your display name"
                        required
                        autoFocus
                    />
                    <button type="submit" className="btn-primary w-full">
                        Join Room
                    </button>
                </form>
            </div>
        );
    }

    if (!isConnected) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="glass-card text-center">
                    <div className="animate-spin h-12 w-12 border-4 border-white/30 border-t-white rounded-full mx-auto mb-4"></div>
                    <p className="text-lg">Connecting to host...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen p-6 pb-32">
            <div className="max-w-2xl mx-auto space-y-6">
                <div className="glass-card">
                    <div className="flex items-center justify-between mb-4">
                        <h1 className="text-2xl font-bold">Remote Control</h1>
                        <div className="flex items-center gap-2">
                            <div className="h-2 w-2 bg-green-400 rounded-full animate-pulse"></div>
                            <span className="text-sm text-white/80">Connected</span>
                        </div>
                    </div>
                    <NowPlaying song={roomState?.player.currentSong} />
                </div>

                <Controls
                    playerState={roomState?.player}
                    onCommand={(cmd) => sendCommand(cmd)}
                />

                <AddSong onCommand={(cmd) => sendCommand(cmd)} />

                <QueueDisplay songs={roomState?.queue || []} />
            </div>
        </div>
    );
}
