import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'KaraokeNatin - Remote Control',
    description: 'P2P Karaoke Remote Control',
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en">
            <body>{children}</body>
        </html>
    );
}
