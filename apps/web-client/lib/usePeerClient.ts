import { useState, useEffect, useCallback, useRef } from 'react';
import Peer, { DataConnection } from 'peerjs';
import { io, Socket } from 'socket.io-client';
import { ClientCommand, HostBroadcast, isHostBroadcast } from '@karaokenatin/shared';
import { useRoomStore, useCommandStore } from './useRoomState';

const SIGNALING_SERVER_URL = 'http://localhost:3001';

export function usePeerClient(roomId: string, joinToken: string) {
    const [peer, setPeer] = useState<Peer | null>(null);
    const connectionRef = useRef<DataConnection | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    const [socket, setSocket] = useState<Socket | null>(null);
    const updateState = useRoomStore((state) => state.setState);
    const getIsInputFocused = () => useRoomStore.getState().isInputFocused;
    const setSendCommand = useCommandStore((state) => state.setSendCommand);

    // Stable sendCommand function using ref
    const sendCommand = useCallback((command: ClientCommand) => {
        if (connectionRef.current && connectionRef.current.open) {
            connectionRef.current.send(command);
            console.log('[PeerClient] Sent command:', command);
        } else {
            console.warn('[PeerClient] Cannot send command, not connected');
        }
    }, []);

    // Register sendCommand in store once
    useEffect(() => {
        setSendCommand(sendCommand);
    }, [sendCommand, setSendCommand]);

    const connect = (displayName: string) => {
        // Initialize PeerJS
        const peerInstance = new Peer({
            config: {
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' },
                ],
            },
        });

        peerInstance.on('open', (peerId) => {
            console.log('[PeerClient] Peer ID:', peerId);

            // Connect to signaling server
            const socketInstance = io(SIGNALING_SERVER_URL);

            socketInstance.emit('JOIN_ROOM', { roomId, joinToken, displayName });

            socketInstance.on('JOIN_SUCCESS', ({ hostPeerId }) => {
                console.log('[PeerClient] Joining room, host peer:', hostPeerId);

                // Establish P2P connection to host
                const conn = peerInstance.connect(hostPeerId);
                setupDataChannelHandlers(conn);
                connectionRef.current = conn;
            });

            socketInstance.on('JOIN_REJECTED', ({ reason }) => {
                console.error('[PeerClient] Join rejected:', reason);
                alert(`Failed to join room: ${reason}`);
            });

            socketInstance.on('HOST_DISCONNECTED', () => {
                alert('Host has disconnected. Room closed.');
                window.location.href = '/';
            });

            setSocket(socketInstance);
        });

        setPeer(peerInstance);
    };

    const setupDataChannelHandlers = (conn: DataConnection) => {
        conn.on('open', () => {
            console.log('[PeerClient] DataChannel open');
            setIsConnected(true);
        });

        conn.on('data', (data) => {
            if (isHostBroadcast(data)) {
                console.log('[PeerClient] Received broadcast:', data);

                if (data.type === 'STATE_UPDATE') {
                    // Skip state updates while user is typing to prevent input disruption
                    if (!getIsInputFocused()) {
                        updateState(data.state);
                    }
                } else if (data.type === 'ERROR') {
                    console.error('[PeerClient] Error from host:', data.message);
                    alert(`Error: ${data.message}`);
                }
            }
        });

        conn.on('close', () => {
            console.log('[PeerClient] Connection closed');
            setIsConnected(false);
        });

        conn.on('error', (error) => {
            console.error('[PeerClient] Connection error:', error);
        });
    };

    useEffect(() => {
        return () => {
            peer?.destroy();
            socket?.disconnect();
        };
    }, [peer, socket]);

    return { connect, isConnected, sendCommand };
}
