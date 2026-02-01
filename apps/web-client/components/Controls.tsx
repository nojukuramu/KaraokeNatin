import { PlayerState, ClientCommand } from '@karaokenatin/shared';

interface ControlsProps {
    playerState?: PlayerState;
    onCommand: (command: ClientCommand) => void;
}

export default function Controls({ playerState, onCommand }: ControlsProps) {
    const isPlaying = playerState?.status === 'playing';

    const handlePlayPause = () => {
        if (isPlaying) {
            onCommand({ type: 'PAUSE' });
        } else {
            onCommand({ type: 'PLAY' });
        }
    };

    return (
        <div className="glass-card">
            <h2 className="text-xl font-bold mb-4">Playback Controls</h2>

            <div className="grid grid-cols-2 gap-4">
                <button
                    onClick={handlePlayPause}
                    className="btn-primary py-4 text-lg"
                >
                    {isPlaying ? '⏸️ Pause' : '▶️ Play'}
                </button>
                <button
                    onClick={() => onCommand({ type: 'SKIP' })}
                    className="btn-primary py-4 text-lg"
                >
                    ⏭️ Skip
                </button>
            </div>
        </div>
    );
}
