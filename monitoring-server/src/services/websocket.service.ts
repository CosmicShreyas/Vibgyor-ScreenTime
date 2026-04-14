import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { logger } from '../utils/logger';

/**
 * WebSocket service for real-time dashboard updates
 * Validates: Requirements 15.1
 */

interface AuthenticatedWebSocket extends WebSocket {
  isAuthenticated?: boolean;
  userId?: string;
}

class WebSocketService {
  private wss: WebSocketServer | null = null;
  private clients: Set<AuthenticatedWebSocket> = new Set();

  /**
   * Initialize WebSocket server alongside Express HTTP server
   * @param server HTTP server instance
   */
  initialize(server: Server): void {
    this.wss = new WebSocketServer({ 
      server,
      path: '/ws'
    });

    this.wss.on('connection', (ws: AuthenticatedWebSocket, req) => {
      logger.info('New WebSocket connection attempt', {
        ip: req.socket.remoteAddress
      });

      // Mark as unauthenticated initially
      ws.isAuthenticated = false;

      // Set up message handler for authentication
      ws.on('message', (message: Buffer) => {
        try {
          const data = JSON.parse(message.toString());
          
          // Handle authentication message
          if (data.type === 'auth' && data.token) {
            this.authenticateConnection(ws, data.token);
          } else if (!ws.isAuthenticated) {
            // Reject messages from unauthenticated connections
            ws.send(JSON.stringify({
              type: 'error',
              message: 'Authentication required'
            }));
          }
        } catch (error) {
          logger.error('Error processing WebSocket message:', error);
          ws.send(JSON.stringify({
            type: 'error',
            message: 'Invalid message format'
          }));
        }
      });

      // Handle connection close
      ws.on('close', () => {
        this.clients.delete(ws);
        logger.info('WebSocket connection closed', {
          authenticated: ws.isAuthenticated,
          totalClients: this.clients.size
        });
      });

      // Handle errors
      ws.on('error', (error) => {
        logger.error('WebSocket error:', error);
        this.clients.delete(ws);
      });

      // Send authentication request
      ws.send(JSON.stringify({
        type: 'auth_required',
        message: 'Please authenticate with a valid JWT token'
      }));
    });

    logger.info('WebSocket server initialized on path /ws');
  }

  /**
   * Authenticate a WebSocket connection using JWT token
   * @param ws WebSocket connection
   * @param token JWT token
   */
  private authenticateConnection(ws: AuthenticatedWebSocket, token: string): void {
    try {
      // Verify JWT token
      const decoded = jwt.verify(token, config.jwtSecret) as any;
      
      // Mark connection as authenticated
      ws.isAuthenticated = true;
      ws.userId = decoded.userId || decoded.sub;
      
      // Add to authenticated clients pool
      this.clients.add(ws);
      
      logger.info('WebSocket connection authenticated', {
        userId: ws.userId,
        totalClients: this.clients.size
      });

      // Send authentication success message
      ws.send(JSON.stringify({
        type: 'auth_success',
        message: 'Authentication successful'
      }));
    } catch (error) {
      logger.warn('WebSocket authentication failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      // Send authentication failure message
      ws.send(JSON.stringify({
        type: 'auth_failed',
        message: 'Invalid authentication token'
      }));

      // Close the connection
      ws.close(1008, 'Authentication failed');
    }
  }

  /**
   * Broadcast a message to all authenticated clients
   * @param message Message to broadcast
   */
  broadcast(message: any): void {
    const messageStr = JSON.stringify(message);
    let successCount = 0;
    let failureCount = 0;

    this.clients.forEach((client) => {
      if (client.isAuthenticated && client.readyState === WebSocket.OPEN) {
        try {
          client.send(messageStr);
          successCount++;
        } catch (error) {
          logger.error('Error sending message to client:', error);
          failureCount++;
        }
      }
    });

    logger.debug('Broadcast message sent', {
      successCount,
      failureCount,
      totalClients: this.clients.size
    });
  }

  /**
   * Notify clients about new monitoring data
   * @param employeeName Employee name
   * @param data Monitoring data
   */
  notifyNewData(employeeName: string, data: any): void {
    this.broadcast({
      type: 'new_data',
      employeeName,
      timestamp: new Date().toISOString(),
      data
    });
  }

  /**
   * Send employee-specific notification to all authenticated clients
   * Validates: Requirements 15.1
   * @param employeeName Employee name
   * @param eventType Type of event (e.g., 'data_update', 'status_change')
   * @param payload Event-specific data
   */
  notifyEmployeeUpdate(employeeName: string, eventType: string, payload?: any): void {
    const message = {
      type: 'employee_update',
      employeeName,
      eventType,
      timestamp: new Date().toISOString(),
      payload
    };

    this.broadcastToAuthenticated(message);
    
    logger.debug('Employee-specific notification sent', {
      employeeName,
      eventType,
      clientCount: this.clients.size
    });
  }

  /**
   * Broadcast file transfer events to all clients
   * @param eventType Type of file event (e.g., 'file:uploaded', 'file:deleted')
   * @param payload Event data
   */
  broadcastFileEvent(eventType: string, payload: any): void {
    const message = {
      type: eventType,
      timestamp: new Date().toISOString(),
      payload
    };

    this.broadcastToAuthenticated(message);
    
    logger.debug('File event broadcast', {
      eventType,
      clientCount: this.clients.size
    });
  }

  /**
   * Broadcast message only to authenticated clients with proper error handling
   * Handles client disconnections gracefully
   * @param message Message to broadcast
   */
  private broadcastToAuthenticated(message: any): void {
    const messageStr = JSON.stringify(message);
    const disconnectedClients: AuthenticatedWebSocket[] = [];
    let successCount = 0;

    this.clients.forEach((client) => {
      if (!client.isAuthenticated) {
        return;
      }

      // Check if connection is still open
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(messageStr);
          successCount++;
        } catch (error) {
          logger.error('Error sending message to client:', {
            error: error instanceof Error ? error.message : 'Unknown error',
            userId: client.userId
          });
          // Mark for removal
          disconnectedClients.push(client);
        }
      } else if (client.readyState === WebSocket.CLOSING || client.readyState === WebSocket.CLOSED) {
        // Connection is closing or closed, mark for removal
        disconnectedClients.push(client);
      }
    });

    // Remove disconnected clients
    disconnectedClients.forEach((client) => {
      this.clients.delete(client);
      logger.info('Removed disconnected client', {
        userId: client.userId,
        readyState: client.readyState
      });
    });

    if (disconnectedClients.length > 0) {
      logger.info('Cleaned up disconnected clients', {
        removedCount: disconnectedClients.length,
        remainingClients: this.clients.size
      });
    }
  }

  /**
   * Get the number of connected authenticated clients
   */
  getClientCount(): number {
    return this.clients.size;
  }

  /**
   * Close all connections and shut down the WebSocket server
   */
  shutdown(): void {
    if (this.wss) {
      logger.info('Shutting down WebSocket server');
      
      // Close all client connections
      this.clients.forEach((client) => {
        client.close(1001, 'Server shutting down');
      });
      
      this.clients.clear();
      
      // Close the WebSocket server
      this.wss.close(() => {
        logger.info('WebSocket server closed');
      });
    }
  }

  /**
   * Broadcast a message to all connected clients
   * @param type Message type
   * @param data Message data
   */
  broadcastToAll(type: string, data: any): void {
    const message = {
      type,
      data,
      timestamp: new Date().toISOString()
    };

    this.broadcast(message);
    logger.info(`Broadcasted ${type} to all clients`);
  }
}

// Export singleton instance
export const websocketService = new WebSocketService();

// Export helper function for file events
export const broadcastFileEvent = (eventType: string, payload: any) => {
  websocketService.broadcastFileEvent(eventType, payload);
};
