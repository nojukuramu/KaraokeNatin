import { useState, useEffect, useRef } from 'react';
import { X, QrCode, ClipboardPaste } from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';

interface GuestModeProps {
    onClose: () => void;
    onConnect: (hostUrl: string) => void;
}

/**
 * Guest Mode — scan QR / paste URL overlay.
 *
 * On successful URL resolution, calls onConnect(hostUrl) which lets App.tsx
 * render the remote-ui iframe in the main area (alongside ControlPanel).
 */
export default function GuestMode({ onClose, onConnect }: GuestModeProps) {
    const [error, setError] = useState('');
    const [scanning, setScanning] = useState(false);
    const [pasteMode, setPasteMode] = useState(false);
    const [hostUrl, setHostUrl] = useState('');
    const scannerRef = useRef<Html5Qrcode | null>(null);
    const scannerContainerId = 'guest-qr-reader';

    // Cleanup scanner on unmount
    useEffect(() => {
        return () => {
            stopScanner();
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const stopScanner = async () => {
        try {
            if (scannerRef.current?.isScanning) {
                await scannerRef.current.stop();
            }
            scannerRef.current?.clear();
        } catch {
            // ignore cleanup errors
        }
        scannerRef.current = null;
        setScanning(false);
    };

    const startScanner = async () => {
        setError('');
        setScanning(true);

        // Small delay to ensure the container element is rendered
        await new Promise(r => setTimeout(r, 100));

        try {
            const scanner = new Html5Qrcode(scannerContainerId);
            scannerRef.current = scanner;

            await scanner.start(
                { facingMode: 'environment' },
                { fps: 10, qrbox: { width: 250, height: 250 } },
                (decodedText) => {
                    handleQrResult(decodedText);
                    stopScanner();
                },
                () => {
                    // No QR found in this frame — ignore
                },
            );
        } catch (err) {
            setScanning(false);
            const msg = err instanceof Error ? err.message : String(err);
            if (msg.includes('NotAllowedError') || msg.includes('Permission')) {
                setError('Camera permission denied. Use "Paste URL" instead.');
            } else if (msg.includes('NotFoundError') || msg.includes('no camera')) {
                setError('No camera found. Use "Paste URL" instead.');
            } else {
                setError(`Camera error: ${msg}`);
            }
        }
    };

    const handleQrResult = (text: string) => {
        try {
            const url = new URL(text.startsWith('http') ? text : `http://${text}`);
            stopScanner();
            onConnect(url.toString());
        } catch {
            setError('Invalid QR code. Expected a URL like http://192.168.x.x:PORT');
        }
    };

    const handlePasteFromClipboard = async () => {
        try {
            const text = await navigator.clipboard.readText();
            if (text.trim()) {
                setHostUrl(text.trim());
            }
        } catch {
            setError('Could not read clipboard. Paste manually instead.');
        }
    };

    const handleManualConnect = () => {
        if (!hostUrl.trim()) return;
        setError('');
        try {
            const url = new URL(hostUrl.trim().startsWith('http') ? hostUrl.trim() : `http://${hostUrl.trim()}`);
            stopScanner();
            onConnect(url.toString());
        } catch {
            setError('Invalid URL. Expected format: http://192.168.x.x:PORT');
        }
    };

    return (
        <div className="guest-mode-overlay">
            {/* Header */}
            <div className="guest-mode-header">
                <span className="guest-mode-title">Join a Room</span>
                <button className="guest-mode-close" onClick={onClose} title="Close">
                    <X size={18} />
                </button>
            </div>

            {/* Body */}
            <div className="guest-mode-body">
                <div className="guest-mode-scan">
                    <p className="guest-mode-desc">
                        Scan the QR code shown on the host screen, or paste the room URL to join.
                    </p>

                    {error && <div className="guest-mode-error">{error}</div>}

                    {/* QR Scanner area */}
                    {scanning ? (
                        <div className="guest-scanner-container">
                            <div id={scannerContainerId} className="guest-scanner-viewport" />
                            <button className="btn-sm btn-secondary guest-scanner-cancel" onClick={stopScanner}>
                                Cancel Scan
                            </button>
                        </div>
                    ) : !pasteMode ? (
                        <div className="guest-mode-actions">
                            <button className="guest-action-card" onClick={startScanner}>
                                <QrCode size={32} />
                                <span className="guest-action-label">Scan QR Code</span>
                                <span className="guest-action-hint">Use your camera to scan the host's QR</span>
                            </button>
                            <button className="guest-action-card" onClick={() => setPasteMode(true)}>
                                <ClipboardPaste size={32} />
                                <span className="guest-action-label">Paste URL</span>
                                <span className="guest-action-hint">Enter or paste the host's room URL</span>
                            </button>
                        </div>
                    ) : (
                        <div className="guest-paste-form">
                            <label className="guest-mode-label">Room URL</label>
                            <div className="guest-paste-row">
                                <input
                                    type="text"
                                    className="guest-mode-input"
                                    placeholder="http://192.168.1.100:51234"
                                    value={hostUrl}
                                    onChange={(e) => setHostUrl(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleManualConnect();
                                        e.stopPropagation();
                                    }}
                                    autoFocus
                                />
                                <button
                                    className="btn-icon btn-paste"
                                    onClick={handlePasteFromClipboard}
                                    title="Paste from clipboard"
                                >
                                    <ClipboardPaste size={18} />
                                </button>
                            </div>
                            <div className="guest-paste-buttons">
                                <button
                                    className="btn btn-secondary"
                                    onClick={() => { setPasteMode(false); setError(''); }}
                                >
                                    Back
                                </button>
                                <button
                                    className="btn btn-primary"
                                    onClick={handleManualConnect}
                                    disabled={!hostUrl.trim()}
                                >
                                    Connect
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
