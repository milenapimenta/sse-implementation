import type { AppLogger } from "../utils/logger";
import type { SendResult, SseClient, SseEvent } from "./sse.types";
export declare class SseManager {
    private readonly logger;
    private readonly clientsByUser;
    private readonly clientsById;
    constructor(logger: AppLogger);
    add(userId: string, response: SseClient["response"]): SseClient;
    remove(clientId: string, reason?: string): boolean;
    sendToClient(client: SseClient, event: SseEvent): boolean;
    sendToUser(userId: string, event: SseEvent): SendResult;
    closeClient(clientId: string, reason?: string): void;
    closeAll(event?: SseEvent): void;
    countConnections(): number;
    countUsers(): number;
    countConnectionsForUser(userId: string): number;
}
