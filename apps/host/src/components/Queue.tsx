import { Song } from '@karaokenatin/shared';
import { invoke } from '@tauri-apps/api/core';
import { useFocusable, FocusContext } from '@noriginmedia/norigin-spatial-navigation';

interface QueueProps {
    songs: Song[];
}

// Icons for queue actions
const Icons = {
    chevronUp: (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="18 15 12 9 6 15"></polyline>
        </svg>
    ),
    chevronDown: (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
    ),
    trash: (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
        </svg>
    ),
};

/** Focusable queue action button for DPAD navigation */
const QueueActionButton = ({ children, onClick, disabled, className, title }: {
    children: React.ReactNode;
    onClick: () => void;
    disabled?: boolean;
    className?: string;
    title?: string;
}) => {
    const { ref, focused } = useFocusable({
        onEnterPress: () => { if (!disabled) onClick(); },
    });
    return (
        <button
            ref={ref}
            className={`queue-action-btn ${className || ''} ${focused ? 'dpad-focused' : ''}`}
            onClick={onClick}
            disabled={disabled}
            title={title}
            tabIndex={0}
        >
            {children}
        </button>
    );
};

const Queue = ({ songs }: QueueProps) => {
    const { ref, focusKey } = useFocusable();

    const handleMoveUp = async (songId: string) => {
        try {
            await invoke('process_command', {
                command: { type: 'MOVE_SONG_UP', songId },
            });
        } catch (error) {
            console.error('[Queue] Failed to move song up:', error);
        }
    };

    const handleMoveDown = async (songId: string) => {
        try {
            await invoke('process_command', {
                command: { type: 'MOVE_SONG_DOWN', songId },
            });
        } catch (error) {
            console.error('[Queue] Failed to move song down:', error);
        }
    };

    const handleRemove = async (songId: string) => {
        try {
            await invoke('process_command', {
                command: { type: 'REMOVE_SONG', songId },
            });
        } catch (error) {
            console.error('[Queue] Failed to remove song:', error);
        }
    };

    if (songs.length === 0) {
        return (
            <div className="queue-display">
                <h2 className="queue-header">Up Next</h2>
                <div className="queue-empty">
                    <p>No songs in queue</p>
                    <p className="queue-empty-hint">Add songs from your remote</p>
                </div>
            </div>
        );
    }

    return (
        <FocusContext.Provider value={focusKey}>
            <div ref={ref} className="queue-display">
                <h2 className="queue-header">
                    Up Next <span className="queue-count">{songs.length}</span>
                </h2>

                <div className="queue-list">
                    {songs.map((song, index) => (
                        <div key={song.id} className="queue-item-compact">
                            <div className="queue-number">{index + 1}</div>

                            <img
                                src={song.thumbnailUrl}
                                alt={song.title}
                                className="queue-thumb-compact"
                            />

                            <div className="queue-info-compact">
                                <div className="queue-title-compact">{song.title}</div>
                                <div className="queue-meta-compact">
                                    {song.addedBy} • {formatDuration(song.duration)}
                                </div>
                            </div>

                            <div className="queue-actions">
                                <QueueActionButton
                                    onClick={() => handleMoveUp(song.id)}
                                    disabled={index === 0}
                                    title="Move up"
                                >
                                    {Icons.chevronUp}
                                </QueueActionButton>
                                <QueueActionButton
                                    onClick={() => handleMoveDown(song.id)}
                                    disabled={index === songs.length - 1}
                                    title="Move down"
                                >
                                    {Icons.chevronDown}
                                </QueueActionButton>
                                <QueueActionButton
                                    className="queue-action-btn-danger"
                                    onClick={() => handleRemove(song.id)}
                                    title="Remove"
                                >
                                    {Icons.trash}
                                </QueueActionButton>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </FocusContext.Provider>
    );
};

function formatDuration(seconds: number): string {
    if (seconds === 0) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export default Queue;
