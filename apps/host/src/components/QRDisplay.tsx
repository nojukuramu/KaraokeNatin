import { QRCodeSVG } from 'qrcode.react';
import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface QRDisplayProps {
    url: string | null;
    roomId: string | null;
}

const QRDisplay = ({ url, roomId }: QRDisplayProps) => {
    const [displayUrl, setDisplayUrl] = useState<string>('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Fetch the local network URL from the Tauri backend
        const fetchQrUrl = async () => {
            try {
                const qrUrl = await invoke<string>('get_qr_url');
                setDisplayUrl(qrUrl);
                setLoading(false);
            } catch (error) {
                console.error('Failed to get QR URL:', error);
                setDisplayUrl(url || 'http://localhost:8080');
                setLoading(false);
            }
        };

        fetchQrUrl();
    }, [url]);

    if (loading || !displayUrl || !roomId) {
        return (
            <div className="qr-display p-6 bg-white/10 rounded-lg">
                <div className="text-center text-white/60">
                    <div className="animate-spin h-8 w-8 border-4 border-white/30 border-t-white rounded-full mx-auto mb-3"></div>
                    <p>Initializing room...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="qr-display p-6 bg-white/10 backdrop-blur rounded-lg">
            <h2 className="text-2xl font-bold mb-4 text-white text-center">
                Join Room
            </h2>

            <div className="bg-white p-4 rounded-lg mb-4">
                <QRCodeSVG
                    value={displayUrl}
                    size={200}
                    level="M"
                    className="w-full h-auto"
                />
            </div>

            <div className="space-y-2 text-sm">
                <div className="bg-white/5 p-3 rounded">
                    <div className="text-white/60 text-xs mb-1">Room ID</div>
                    <div className="text-white font-mono font-bold">
                        {roomId}
                    </div>
                </div>

                <div className="text-white/60 text-xs text-center mt-3">
                    Scan QR code or enter Room ID manually
                </div>
            </div>
        </div>
    );
};

export default QRDisplay;
