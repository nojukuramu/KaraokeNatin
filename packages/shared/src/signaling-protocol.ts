/**
 * Socket.io Signaling Server Protocol
 */

/**
 * Events from Host -> Server
 */
export interface HostToServerEvents {
    CREATE_ROOM: (data: { roomId: string; joinTokenHash: string; hostPeerId?: string }) => void;
    LEAVE_ROOM: () => void;
}

/**
 * Events from Client -> Server
 */
export interface ClientToServerEvents {
    JOIN_ROOM: (data: { roomId: string; joinToken: string; displayName: string }) => void;
    LEAVE_ROOM: () => void;
}

/**
 * Events from Server -> Host
 */
export interface ServerToHostEvents {
    ROOM_CREATED: (data: { roomId: string }) => void;
    CLIENT_JOINED: (data: { clientId: string; displayName: string; peerId: string }) => void;
    CLIENT_LEFT: (data: { clientId: string }) => void;
    ERROR: (data: { code: string; message: string }) => void;
}

/**
 * Events from Server -> Client
 */
export interface ServerToClientEvents {
    JOIN_SUCCESS: (data: { roomId: string; hostPeerId: string }) => void;
    JOIN_REJECTED: (data: { reason: string }) => void;
    HOST_DISCONNECTED: () => void;
    ERROR: (data: { code: string; message: string }) => void;
}

/**
 * Room metadata stored on signaling server
 */
export interface RoomMetadata {
    roomId: string;
    hostSocketId: string;
    hostPeerId?: string;  // PeerJS ID of the host (set after peer connection)
    joinTokenHash: string;
    createdAt: number;
    clientCount: number;
}
