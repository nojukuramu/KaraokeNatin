import { useState, useEffect, useRef } from 'react';
import Peer, { DataConnection } from 'peerjs';
import { io, Socket } from 'socket.io-client';
import { listen } from '@tauri-apps/api/event';
import { HostBroadcast, isClientCommand, RoomState } from '@karaokenatin/shared';
import { processCommand, getRoomState } from '../lib/commands';
import { hashToken } from '../lib/security';

/**
 * Hook to manage PeerJS host and WebRTC connections
 */
export function usePeerHost() {
    const [peer, setPeer] = useState<Peer | null>(null);
    const [connections, setConnections] = useState<Map<string, DataConnection>>(new Map());
    const connectionsRef = useRef<Map<string, DataConnection>>(new Map());
    const [connectionUrl, setConnectionUrl] = useState<string>('');
    const [socket, setSocket] = useState<Socket | null>(null);

    // Keep ref in sync with state
    useEffect(() => {
        connectionsRef.current = connections;
    }, [connections]);

    // Subscribe to room state updates and broadcast to all connected peers
    useEffect(() => {
        const unlisten = listen<RoomState>('room_state_updated', (event) => {
            // Filter out personal playlists before broadcasting to remote clients
            const publicState = {
                ...event.payload,
                playlists: (event.payload.playlists || []).filter(
                    (c: { visibility: string }) => c.visibility === 'public'
                ),
            };
            const broadcast: HostBroadcast = {
                type: 'STATE_UPDATE',
                state: publicState,
            };
            connectionsRef.current.forEach((conn) => {
                if (conn.open) {
                    conn.send(broadcast);
                }
            });
        });

        return () => {
            unlisten.then(fn => fn());
        };
    }, []);

    useEffect(() => {
        // Initialize PeerJS
        const peerInstance = new Peer({
            config: {
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' },
                ],
            },
        });

        peerInstance.on('open', async (peerId) => {
            console.log('[PeerHost] Peer ID:', peerId);

            // Generate room credentials
            const roomId = generateRoomId();
            const joinToken = generateJoinToken();
            const joinTokenHash = await hashToken(joinToken);

            // Connect to signaling server
            const { invoke } = await import('@tauri-apps/api/core');
            const port = await invoke<number>('get_server_port');
            const socketInstance = io(`http://localhost:${port}`);

            // Include peerId when creating room so clients can connect
            socketInstance.emit('CREATE_ROOM', { roomId, joinTokenHash, hostPeerId: peerId });

            socketInstance.on('ROOM_CREATED', async () => {
                console.log('[PeerHost] Room created on signaling server');
                // Get the base URL (http://ip:port) from the backend
                try {
                    const baseUrl = await invoke<string>('get_qr_url');
                    // For remote-ui, we just point to the root. It auto-discovers the room.
                    setConnectionUrl(baseUrl);

                    // Log a URL for the Next.js web client (dev use)
                    const webClientUrl = `http://localhost:3000/room/${roomId}?t=${joinToken}&s=${encodeURIComponent(`http://localhost:${port}`)}`;
                    console.log('[PeerHost] Web client URL (dev):', webClientUrl);
                } catch (e) {
                    console.error('Failed to get QR URL:', e);
                    setConnectionUrl(`${window.location.origin}/join?r=${roomId}&t=${joinToken}`);
                }
            });

            setSocket(socketInstance);
        });

        peerInstance.on('connection', (conn) => {
            console.log('[PeerHost] New peer connection:', conn.peer);
            setupDataChannelHandlers(conn);
        });

        setPeer(peerInstance);

        return () => {
            peerInstance.destroy();
            socket?.disconnect();
        };
    }, []);

    const setupDataChannelHandlers = (conn: DataConnection) => {
        conn.on('open', () => {
            console.log('[PeerHost] DataChannel open:', conn.peer);
            setConnections((prev) => new Map(prev).set(conn.peer, conn));

            // Send initial state
            sendStateUpdate(conn);
        });

        conn.on('data', async (data) => {
            console.log('[PeerHost] Received data:', data);

            // Handle SEARCH command separately (not a standard ClientCommand)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const msg = data as Record<string, any>;
            if (msg && msg.type === 'SEARCH' && typeof msg.query === 'string') {
                console.log('[PeerHost] Processing SEARCH:', msg.query);
                try {
                    const { invoke } = await import('@tauri-apps/api/core');
                    const results = await invoke('search_youtube', {
                        query: msg.query,
                        limit: msg.limit || 5
                    });
                    conn.send({ type: 'SEARCH_RESULTS', results });
                } catch (error) {
                    console.error('[PeerHost] Search failed:', error);
                    conn.send({
                        type: 'ERROR',
                        code: 'SEARCH_FAILED',
                        message: error instanceof Error ? error.message : 'Search failed'
                    });
                }
                return;
            }

            if (isClientCommand(data)) {
                console.log('[PeerHost] Received command:', data);
                try {
                    // Process command in Rust backend
                    await processCommand(data);
                    // State update will be broadcast via Tauri event
                } catch (error) {
                    console.error('[PeerHost] Command processing failed:', error);
                    const errorMsg: HostBroadcast = {
                        type: 'ERROR',
                        code: 'COMMAND_FAILED',
                        message: error instanceof Error ? error.message : 'Unknown error',
                    };
                    conn.send(errorMsg);
                }
            }
        });

        conn.on('close', () => {
            console.log('[PeerHost] Connection closed:', conn.peer);
            setConnections((prev) => {
                const next = new Map(prev);
                next.delete(conn.peer);
                return next;
            });
        });
    };

    const sendStateUpdate = async (conn: DataConnection) => {
        try {
            const state = await getRoomState();
            const publicState = {
                ...state,
                playlists: (state.playlists || []).filter(
                    (c: { visibility: string }) => c.visibility === 'public'
                ),
            };
            const broadcast: HostBroadcast = {
                type: 'STATE_UPDATE',
                state: publicState,
            };
            conn.send(broadcast);
        } catch (error) {
            console.error('[PeerHost] Failed to send state update:', error);
        }
    };

    const broadcastToAll = (message: HostBroadcast) => {
        connections.forEach((conn) => {
            if (conn.open) {
                conn.send(message);
            }
        });
    };

    return {
        peer,
        connectionUrl,
        connectedClients: connections.size,
        broadcastToAll,
    };
}

// Placeholder generators (will use actual implementation from shared)
function generateRoomId(): string {
    return Math.random().toString(36).substring(2, 15);
}

function generateJoinToken(): string {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}
