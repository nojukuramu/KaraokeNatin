import { RoomMetadata } from '@karaokenatin/shared';
import { verifyToken } from './security';

const ROOM_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours
const MAX_CLIENTS_PER_ROOM = 10;

/**
 * In-memory room storage with TTL-based cleanup
 */
export class RoomManager {
    private rooms = new Map<string, RoomMetadata>();
    private cleanupInterval: NodeJS.Timeout;

    constructor() {
        // Run cleanup every 5 minutes
        this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000);
    }

    /**
     * Create a new room
     */
    createRoom(roomId: string, hostSocketId: string, joinTokenHash: string, hostPeerId?: string): void {
        if (this.rooms.has(roomId)) {
            throw new Error('Room already exists');
        }

        this.rooms.set(roomId, {
            roomId,
            hostSocketId,
            hostPeerId,
            joinTokenHash,
            createdAt: Date.now(),
            clientCount: 0,
        });

        console.log(`[RoomManager] Room created: ${roomId} (hostPeerId: ${hostPeerId})`);
    }

    /**
     * Verify join token and return room metadata if valid
     */
    verifyAndGetRoom(roomId: string, joinToken: string): RoomMetadata | null {
        const room = this.rooms.get(roomId);
        if (!room) {
            return null;
        }

        if (!verifyToken(joinToken, room.joinTokenHash)) {
            return null;
        }

        if (room.clientCount >= MAX_CLIENTS_PER_ROOM) {
            throw new Error('Room is full');
        }

        return room;
    }

    /**
     * Increment client count
     */
    addClient(roomId: string): void {
        const room = this.rooms.get(roomId);
        if (room) {
            room.clientCount++;
        }
    }

    /**
     * Decrement client count
     */
    removeClient(roomId: string): void {
        const room = this.rooms.get(roomId);
        if (room && room.clientCount > 0) {
            room.clientCount--;
        }
    }

    /**
     * Delete a room (called when host disconnects)
     */
    deleteRoom(roomId: string): void {
        if (this.rooms.delete(roomId)) {
            console.log(`[RoomManager] Room deleted: ${roomId}`);
        }
    }

    /**
     * Get room by host socket ID
     */
    getRoomByHostSocketId(hostSocketId: string): RoomMetadata | null {
        for (const room of this.rooms.values()) {
            if (room.hostSocketId === hostSocketId) {
                return room;
            }
        }
        return null;
    }

    /**
     * Get the first active room (for standalone mode)
     */
    getFirstActiveRoom(): RoomMetadata | null {
        for (const room of this.rooms.values()) {
            if (room.clientCount < MAX_CLIENTS_PER_ROOM) {
                return room;
            }
        }
        return null;
    }

    /**
     * Cleanup expired rooms
     */
    private cleanup(): void {
        const now = Date.now();
        let deletedCount = 0;

        for (const [roomId, room] of this.rooms.entries()) {
            if (now - room.createdAt > ROOM_TTL_MS) {
                this.rooms.delete(roomId);
                deletedCount++;
            }
        }

        if (deletedCount > 0) {
            console.log(`[RoomManager] Cleaned up ${deletedCount} expired rooms`);
        }
    }

    /**
     * Get all rooms (for debugging)
     */
    getAllRooms(): RoomMetadata[] {
        return Array.from(this.rooms.values());
    }

    /**
     * Cleanup resources
     */
    destroy(): void {
        clearInterval(this.cleanupInterval);
    }
}
