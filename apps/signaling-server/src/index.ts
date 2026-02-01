import { Server } from 'socket.io';
import { createServer } from 'http';
import {
    HostToServerEvents,
    ClientToServerEvents,
    ServerToHostEvents,
    ServerToClientEvents,
} from '@karaokenatin/shared';
import { RoomManager } from './roomManager';

const PORT = process.env.PORT || 3001;
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

const httpServer = createServer();
const io = new Server<
    HostToServerEvents & ClientToServerEvents,
    ServerToHostEvents & ServerToClientEvents
>(httpServer, {
    cors: {
        origin: CORS_ORIGIN,
        methods: ['GET', 'POST'],
    },
});

const roomManager = new RoomManager();

/**
 * Socket.io connection handler
 */
io.on('connection', (socket) => {
    console.log(`[Server] Client connected: ${socket.id}`);

    /**
     * Host creates a room
     */
    socket.on('CREATE_ROOM', ({ roomId, joinTokenHash, hostPeerId }) => {
        try {
            roomManager.createRoom(roomId, socket.id, joinTokenHash, hostPeerId);
            socket.join(roomId);
            socket.emit('ROOM_CREATED', { roomId });
            console.log(`[Server] Host ${socket.id} created room ${roomId} (peerId: ${hostPeerId})`);
        } catch (error) {
            socket.emit('ERROR', {
                code: 'CREATE_ROOM_FAILED',
                message: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    });

    /**
     * Client joins a room
     */
    socket.on('JOIN_ROOM', ({ roomId, joinToken, displayName }) => {
        try {
            // For standalone mode: if no roomId provided or roomId is 'default', find the first available room
            let targetRoomId = roomId;
            let room;

            if (!roomId || roomId === 'default' || roomId === '') {
                // Standalone mode: find the first active room
                room = roomManager.getFirstActiveRoom();
                if (room) {
                    targetRoomId = room.roomId;
                    console.log(`[Server] Standalone mode: assigning client to room ${targetRoomId}`);
                } else {
                    socket.emit('JOIN_REJECTED', { reason: 'No active host found. Please start the host app first.' });
                    return;
                }
            } else {
                // Normal mode: verify room and token
                room = roomManager.verifyAndGetRoom(roomId, joinToken);
                if (!room) {
                    socket.emit('JOIN_REJECTED', { reason: 'Invalid room or token' });
                    return;
                }
            }

            socket.join(targetRoomId);
            roomManager.addClient(targetRoomId);

            // Store user metadata
            socket.data.roomId = targetRoomId;
            socket.data.displayName = displayName;

            // Notify host
            io.to(room.hostSocketId).emit('CLIENT_JOINED', {
                clientId: socket.id,
                displayName,
                peerId: socket.id, // Will be replaced with actual PeerJS ID from client
            });

            // Confirm to client with host's peer ID
            socket.emit('JOIN_SUCCESS', {
                roomId: targetRoomId,
                hostPeerId: room.hostPeerId || room.hostSocketId,
            });

            console.log(`[Server] Client ${socket.id} (${displayName}) joined room ${targetRoomId}`);
        } catch (error) {
            socket.emit('ERROR', {
                code: 'JOIN_ROOM_FAILED',
                message: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    });

    /**
     * Client/Host leaves room
     */
    socket.on('LEAVE_ROOM', () => {
        handleDisconnect(socket);
    });

    /**
     * Handle disconnection
     */
    socket.on('disconnect', () => {
        console.log(`[Server] Client disconnected: ${socket.id}`);
        handleDisconnect(socket);
    });
});

/**
 * Centralized disconnect handler
 */
function handleDisconnect(socket: any): void {
    // Check if this socket is a host
    const hostedRoom = roomManager.getRoomByHostSocketId(socket.id);
    if (hostedRoom) {
        // Host disconnected - notify all clients and delete room
        io.to(hostedRoom.roomId).emit('HOST_DISCONNECTED');
        roomManager.deleteRoom(hostedRoom.roomId);
        return;
    }

    // Check if this socket is a client
    const roomId = socket.data.roomId;
    if (roomId) {
        const room = roomManager.getRoomByHostSocketId(roomId);
        if (room) {
            // Notify host
            io.to(room.hostSocketId).emit('CLIENT_LEFT', {
                clientId: socket.id,
            });
            roomManager.removeClient(roomId);
        }
        socket.leave(roomId);
    }
}

/**
 * Start server
 */
httpServer.listen(PORT, () => {
    console.log(`[Server] Signaling server running on port ${PORT}`);
    console.log(`[Server] CORS origin: ${CORS_ORIGIN}`);
});

/**
 * Graceful shutdown
 */
process.on('SIGTERM', () => {
    console.log('[Server] SIGTERM received, shutting down gracefully');
    roomManager.destroy();
    io.close(() => {
        httpServer.close(() => {
            process.exit(0);
        });
    });
});
