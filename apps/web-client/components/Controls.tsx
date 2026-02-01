import { PlayerState, ClientCommand } from '@karaokenatin/shared';

interface ControlsProps {
    playerState?: PlayerState;
    onCommand: (command: ClientCommand) => void;
}

export default function Controls({ playerState, onCommand }: ControlsProps) {
    const isPlaying = playerState?.status === 'playing';

    return (
        <div className="glass-card">
            <h2 className="text-xl font-bold mb-4">Playback Controls</h2>

            <div className="grid grid-cols-3 gap-4 mb-6">
                <button
                    onClick={() => onCommand({ type: 'PLAY' })}
                    disabled={isPlaying}
                    className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    ▶️ Play
                </button>
                <button
                    onClick={() => onCommand({ type: 'PAUSE' })}
                    disabled={!isPlaying}
                    className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    ⏸️ Pause
                </button>
                <button
                    onClick={() => onCommand({ type: 'SKIP' })}
                    className="btn-primary"
                >
                    ⏭️ Skip
                </button>
            </div>

            <div className="space-y-4">
                <div>
                    <label className="block text-sm font-medium mb-2">Volume: {playerState?.volume || 80}%</label>
                    <input
                        type="range"
                        min="0"
                        max="100"
                        value={playerState?.volume || 80}
                        onChange={(e) => onCommand({ type: 'SET_VOLUME', volume: parseInt(e.target.value) })}
                        className="w-full h-2 bg-white/20 rounded-lg appearance-none cursor-pointer slider"
                    />
                </div>

                <button
                    onClick={() => onCommand({ type: 'TOGGLE_MUTE' })}
                    className="btn-secondary w-full"
                >
                    {playerState?.isMuted ? '🔇 Unmute' : '🔊 Mute'}
                </button>
            </div>
        </div>
    );
}
