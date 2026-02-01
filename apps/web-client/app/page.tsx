import Link from 'next/link';

export default function Home() {
    return (
        <div className="min-h-screen flex flex-col items-center justify-center p-6">
            <div className="glass-card text-center max-w-md">
                <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-yellow-300 to-pink-300 bg-clip-text text-transparent">
                    KaraokeNatin
                </h1>
                <p className="text-lg mb-8 text-white/80">
                    P2P Karaoke Remote Control
                </p>
                <Link href="/join" className="btn-primary block">
                    Scan QR Code to Join
                </Link>
            </div>
        </div>
    );
}
