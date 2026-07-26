import { QRCodeSVG } from 'qrcode.react';
import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface QRDisplayProps {
    url: string | null;
    roomId: string | null;
}

const QRDisplay = ({ url, roomId: _roomId }: QRDisplayProps) => {
    const [displayUrl, setDisplayUrl] = useState<string>('');
    const [loading, setLoading] = useState(true);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        // `url` comes from usePeerHost and already carries the join token
        // (?t=...). Prefer it: a URL fetched from get_qr_url has no token, and
        // since signaling now verifies tokens on every join, a guest scanning
        // a tokenless QR would simply be rejected.
        if (url) {
            setDisplayUrl(url);
            setLoading(false);
            return;
        }

        // Fallback only for the window between mount and the room being
        // created. Shows the right host address so the panel is not blank.
        let cancelled = false;
        const fetchQrUrl = async () => {
            try {
                const qrUrl = await invoke<string>('get_qr_url');
                if (!cancelled) setDisplayUrl(qrUrl);
            } catch (error) {
                console.error('Failed to get QR URL:', error);
                try {
                    const port = await invoke<number>('get_server_port');
                    if (!cancelled) setDisplayUrl(`http://localhost:${port}`);
                } catch {
                    if (!cancelled) setDisplayUrl(window.location.origin);
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        fetchQrUrl();
        return () => { cancelled = true; };
    }, [url]);

    const copyLink = async () => {
        try {
            await navigator.clipboard.writeText(displayUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error('Failed to copy:', err);
        }
    };

    if (loading || !displayUrl) {
        return (
            <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                padding: '24px',
                background: 'var(--bg-tertiary)',
                borderRadius: '12px'
            }}>
                <div style={{
                    width: '32px',
                    height: '32px',
                    border: '3px solid var(--bg-hover)',
                    borderTopColor: 'var(--accent)',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite'
                }}></div>
                <p style={{ marginTop: '12px', color: 'var(--text-secondary)', fontSize: '14px' }}>
                    Loading...
                </p>
            </div>
        );
    }

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '16px'
        }}>
            {/* QR Code */}
            <div style={{
                background: 'white',
                padding: '16px',
                borderRadius: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
            }}>
                <QRCodeSVG
                    value={displayUrl}
                    size={180}
                    level="M"
                />
            </div>

            {/* URL Display */}
            <div style={{
                width: '100%',
                background: 'var(--bg-tertiary)',
                borderRadius: '8px',
                padding: '10px 12px',
                fontSize: '12px',
                fontFamily: 'monospace',
                color: 'var(--text-secondary)',
                textAlign: 'center',
                wordBreak: 'break-all'
            }}>
                {displayUrl}
            </div>

            {/* Copy Button */}
            <button
                onClick={copyLink}
                style={{
                    width: '100%',
                    padding: '10px 16px',
                    background: copied ? 'var(--success)' : 'var(--bg-tertiary)',
                    color: copied ? 'white' : 'var(--text-primary)',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontWeight: 500,
                    fontSize: '14px',
                    transition: 'all 0.2s'
                }}
            >
                {copied ? '✓ Copied!' : 'Copy Link'}
            </button>

            {/* Instructions */}
            <p style={{
                fontSize: '12px',
                color: 'var(--text-secondary)',
                textAlign: 'center',
                margin: 0
            }}>
                Scan QR code or share link to join
            </p>
        </div>
    );
};

export default QRDisplay;
