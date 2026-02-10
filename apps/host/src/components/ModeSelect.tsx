import { Monitor, Smartphone, MicVocal, Library as LibraryIcon } from 'lucide-react';

interface ModeSelectProps {
    onSelectHost: () => void;
    onSelectGuest: () => void;
    onSelectLibrary: () => void;
}

/**
 * Landing screen — user picks Host, Guest, or Library mode.
 */
export default function ModeSelect({ onSelectHost, onSelectGuest, onSelectLibrary }: ModeSelectProps) {
    return (
        <div className="mode-select-screen">
            <h1 className="mode-select-logo"><MicVocal size={40} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '0.3em' }} /> KaraokeNatin</h1>
            <p className="mode-select-tagline">Choose how you want to use the app</p>

            <div className="mode-select-cards">
                <button className="mode-card" onClick={onSelectHost}>
                    <Monitor size={40} />
                    <span className="mode-card-title">Host a Session</span>
                    <span className="mode-card-desc">
                        Play videos on this screen and let friends control the queue from their phones.
                    </span>
                </button>

                <button className="mode-card" onClick={onSelectGuest}>
                    <Smartphone size={40} />
                    <span className="mode-card-title">Join as Guest</span>
                    <span className="mode-card-desc">
                        Scan a QR code or enter a URL to control a host in your network.
                    </span>
                </button>

                <button className="mode-card" onClick={onSelectLibrary}>
                    <LibraryIcon size={40} />
                    <span className="mode-card-title">My Library</span>
                    <span className="mode-card-desc">
                        Manage your personal song collection, organize playlists, and search for new songs.
                    </span>
                </button>
            </div>
        </div>
    );
}
