import { useState, useEffect, useRef } from 'react';
import Peer, { DataConnection } from 'peerjs';
import { io, Socket } from 'socket.io-client';
import { listen } from '@tauri-apps/api/event';
import { HostBroadcast, isClientCommand, RoomState } from '@karaokenatin/shared';
import { processCommand, getRoomState } from '../lib/commands';
import { hashToken, generateRoomId, generateJoinToken } from '../lib/security';

/**
 * Hook to manage PeerJS host and WebRTC connections
 */
export function usePeerHost() {
    const [peer, setPeer] = useState<Peer | null>(null);
    const [connections, setConnections] = useState<Map<string, DataConnection>>(new Map());
    const connectionsRef = useRef<Map<string, DataConnection>>(new Map());
    const [connectionUrl, setConnectionUrl] = useState<string>('');
    // Held in state so the socket survives re-renders; the cleanup path uses the
    // local `socketInstance` binding instead, so this value is write-only.
    const [, setSocket] = useState<Socket | null>(null);

    // Keep ref in sync with state
    useEffect(() => {
        connectionsRef.current = connections;
    }, [connections]);

    // Sweep for channels that went away without firing 'close'. PeerJS does not
    // reliably emit close when the underlying transport dies (a slept phone, a
    // dropped access point), so `conn.open` is the only honest signal.
    useEffect(() => {
        const REAP_INTERVAL_MS = 15000;
        const timer = setInterval(() => {
            const stale: string[] = [];
            connectionsRef.current.forEach((conn, peerId) => {
                if (!conn.open) stale.push(peerId);
            });
            if (stale.length === 0) return;
            console.log('[PeerHost] Reaping stale connections:', stale);
            setConnections((prev) => {
                const next = new Map(prev);
                stale.forEach((id) => next.delete(id));
                return next;
            });
        }, REAP_INTERVAL_MS);

        return () => clearInterval(timer);
    }, []);

    // Subscribe to room state updates and broadcast to all connected peers
    useEffect(() => {
        // `room_state_public` is emitted by Rust with personal collections
        // already stripped (see emit_state in commands.rs). Do not switch this
        // to `room_state_updated` — that carries the host's private playlists
        // and this handler forwards its payload straight to every guest.
        const unlisten = listen<RoomState>('room_state_public', (event) => {
            const broadcast: HostBroadcast = {
                type: 'STATE_UPDATE',
                state: event.payload,
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
        let cancelled = false;
        let peerInstance: Peer | null = null;
        let socketInstance: Socket | null = null;

        const setup = async () => {
        const { invoke } = await import('@tauri-apps/api/core');
        // The broker lives in our own Rust web server, so we need its port
        // before constructing the Peer.
        const port = await invoke<number>('get_server_port');
        if (cancelled) return;

        // Point PeerJS at that broker. Omitting host/port/path makes PeerJS
        // fall back to its public 0.peerjs.com cloud, which put the WebRTC
        // handshake on the internet and made this LAN app unusable offline.
        // `path: '/'` is correct: PeerJS appends 'peerjs', giving '/peerjs'.
        peerInstance = new Peer({
            host: 'localhost',
            port,
            path: '/',
            key: 'peerjs',
            secure: false,
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

            // Connect to signaling server (same embedded server, same port)
            socketInstance = io(`http://localhost:${port}`);

            // Include peerId when creating room so clients can connect
            socketInstance.emit('CREATE_ROOM', { roomId, joinTokenHash, hostPeerId: peerId });

            socketInstance.on('ROOM_CREATED', async () => {
                console.log('[PeerHost] Room created on signaling server');
                // Get the base URL (http://ip:port) from the backend
                try {
                    const baseUrl = await invoke<string>('get_qr_url');
                    // The token rides in the QR URL. remote-ui reads ?t= and
                    // sends it as joinToken, which the signaling server now
                    // verifies for every join (see signaling.rs JOIN_ROOM).
                    // Without this the token would be unusable and the server
                    // would have to accept anonymous joins.
                    setConnectionUrl(`${baseUrl}/?t=${encodeURIComponent(joinToken)}`);
                } catch (e) {
                    console.error('Failed to get QR URL:', e);
                    setConnectionUrl(`${window.location.origin}/?t=${encodeURIComponent(joinToken)}`);
                }
            });

            setSocket(socketInstance);
        });

        peerInstance.on('connection', (conn) => {
            console.log('[PeerHost] New peer connection:', conn.peer);
            setupDataChannelHandlers(conn);
        });

        peerInstance.on('error', (err) => {
            console.error('[PeerHost] Peer error:', err);
        });

        setPeer(peerInstance);
        };

        setup().catch((e) => console.error('[PeerHost] Setup failed:', e));

        return () => {
            // Guards against the effect's async setup finishing after unmount,
            // which would otherwise leave an orphaned Peer and socket alive.
            cancelled = true;
            peerInstance?.destroy();
            socketInstance?.disconnect();
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

            // PING/PONG existed in the protocol but nothing ever answered a
            // PING, so guests had no way to tell a live channel from a dead
            // one. Answer before the generic command path, since PING is a
            // liveness probe rather than a state mutation.
            if (msg && msg.type === 'PING') {
                const pong: HostBroadcast = { type: 'PONG', serverTime: Date.now() };
                try {
                    conn.send(pong);
                } catch (e) {
                    console.warn('[PeerHost] Failed to answer PING:', e);
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
            dropConnection(conn.peer);
        });

        // Without this, a guest whose phone slept or briefly dropped Wi-Fi —
        // the normal case at a party — stayed in the connection map forever.
        // Every subsequent broadcast then tried to write to a dead channel and
        // the client count was permanently wrong.
        conn.on('error', (err) => {
            console.warn('[PeerHost] Connection error, dropping peer:', conn.peer, err);
            dropConnection(conn.peer);
        });
    };

    const dropConnection = (peerId: string) => {
        setConnections((prev) => {
            if (!prev.has(peerId)) return prev;
            const next = new Map(prev);
            next.delete(peerId);
            return next;
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


