/**
 * Property-based tests for WebSocket notification service
 * Feature: vibgyorseek-employee-monitoring, Property 22: Real-Time Notification
 * 
 * Property 22: For any new Data_Payload received and stored by the Dashboard_Server, 
 * a notification should be sent to all connected Dashboard_UI clients.
 * 
 * Validates: Requirements 15.1
 */

import * as fc from 'fast-check';
import { websocketService } from '../websocket.service';
import { Server } from 'http';
import WebSocket from 'ws';
import jwt from 'jsonwebtoken';
import { config } from '../../config';

describe('WebSocket Service - Property-Based Tests', () => {
  let httpServer: Server;
  let port: number;

  beforeAll((done) => {
    // Create a simple HTTP server for testing
    httpServer = new Server();
    httpServer.listen(0, () => {
      const address = httpServer.address();
      port = typeof address === 'object' && address ? address.port : 0;
      websocketService.initialize(httpServer);
      done();
    });
  });

  afterAll((done) => {
    websocketService.shutdown();
    httpServer.close(done);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  /**
   * Helper function to create and authenticate a WebSocket client
   */
  const createAuthenticatedClient = (): Promise<WebSocket> => {
    return new Promise((resolve, reject) => {
      const token = jwt.sign({ userId: `user-${Math.random()}` }, config.jwtSecret, { expiresIn: '1h' });
      const ws = new WebSocket(`ws://localhost:${port}/ws`);
      let messageCount = 0;

      ws.on('message', (data) => {
        messageCount++;
        const message = JSON.parse(data.toString());

        if (messageCount === 1 && message.type === 'auth_required') {
          // Send authentication
          ws.send(JSON.stringify({ type: 'auth', token }));
        } else if (messageCount === 2 && message.type === 'auth_success') {
          // Client is now authenticated
          resolve(ws);
        }
      });

      ws.on('error', (error) => {
        reject(error);
      });

      // Timeout after 5 seconds
      setTimeout(() => {
        reject(new Error('Authentication timeout'));
      }, 5000);
    });
  };

  /**
   * Helper function to close a WebSocket client
   */
  const closeClient = (ws: WebSocket): Promise<void> => {
    return new Promise((resolve) => {
      if (ws.readyState === WebSocket.CLOSED) {
        resolve();
        return;
      }
      ws.on('close', () => resolve());
      ws.close();
    });
  };

  describe('Property 22: Real-Time Notification', () => {
    /**
     * **Validates: Requirements 15.1**
     * 
     * Property: For any new Data_Payload received and stored by the Dashboard_Server,
     * a notification should be sent to all connected Dashboard_UI clients.
     */
    it('Feature: vibgyorseek-employee-monitoring, Property 22: Real-Time Notification - should send notification to all authenticated clients for any monitoring data', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate random monitoring data payloads
          fc.record({
            employee_name: fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
            work_seconds: fc.integer({ min: 0, max: 86400 }),
            idle_seconds: fc.integer({ min: 0, max: 86400 }),
            applications: fc.array(
              fc.record({
                name: fc.string({ minLength: 1, maxLength: 50 }),
                active: fc.boolean(),
              }),
              { minLength: 0, maxLength: 5 }
            ),
          }),
          async (payload) => {
            // Create an authenticated client
            const client = await createAuthenticatedClient();

            // Set up promise to capture notification
            const notificationReceived = new Promise<any>((resolve) => {
              const messageHandler = (data: Buffer) => {
                const message = JSON.parse(data.toString());
                if (message.type === 'new_data') {
                  resolve(message);
                }
              };
              client.on('message', messageHandler);
            });

            // Simulate new data arrival by calling notifyNewData
            websocketService.notifyNewData(payload.employee_name, {
              work_seconds: payload.work_seconds,
              idle_seconds: payload.idle_seconds,
              applications: payload.applications,
            });

            // Wait for notification with timeout
            const notification = await Promise.race([
              notificationReceived,
              new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Notification timeout')), 2000)
              ),
            ]);

            // Verify notification was received
            expect(notification).toBeDefined();
            expect((notification as any).type).toBe('new_data');
            expect((notification as any).employeeName).toBe(payload.employee_name);
            expect((notification as any).data).toEqual({
              work_seconds: payload.work_seconds,
              idle_seconds: payload.idle_seconds,
              applications: payload.applications,
            });
            expect((notification as any).timestamp).toBeDefined();

            // Clean up
            await closeClient(client);
          }
        ),
        { numRuns: 100 }
      );
    }, 120000); // 120 second timeout for 100 iterations

    /**
     * Property: For any employee update notification, all authenticated clients should receive it
     */
    it('Feature: vibgyorseek-employee-monitoring, Property 22: Real-Time Notification - should broadcast employee updates to all authenticated clients', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            employee_name: fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
            event_type: fc.constantFrom('data_update', 'status_change', 'activity_change'),
            work_seconds: fc.integer({ min: 0, max: 86400 }),
            idle_seconds: fc.integer({ min: 0, max: 86400 }),
          }),
          async (data) => {
            // Create an authenticated client
            const client = await createAuthenticatedClient();

            // Set up promise to capture notification
            const notificationReceived = new Promise<any>((resolve) => {
              const messageHandler = (msgData: Buffer) => {
                const message = JSON.parse(msgData.toString());
                if (message.type === 'employee_update') {
                  resolve(message);
                }
              };
              client.on('message', messageHandler);
            });

            // Send employee-specific notification
            websocketService.notifyEmployeeUpdate(
              data.employee_name,
              data.event_type,
              {
                work_seconds: data.work_seconds,
                idle_seconds: data.idle_seconds,
              }
            );

            // Wait for notification
            const notification = await Promise.race([
              notificationReceived,
              new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Notification timeout')), 2000)
              ),
            ]);

            // Verify notification structure
            expect(notification).toBeDefined();
            expect((notification as any).type).toBe('employee_update');
            expect((notification as any).employeeName).toBe(data.employee_name);
            expect((notification as any).eventType).toBe(data.event_type);
            expect((notification as any).payload).toEqual({
              work_seconds: data.work_seconds,
              idle_seconds: data.idle_seconds,
            });
            expect((notification as any).timestamp).toBeDefined();

            // Clean up
            await closeClient(client);
          }
        ),
        { numRuns: 100 }
      );
    }, 120000);

    /**
     * Property: For any notification, multiple authenticated clients should all receive it
     */
    it('Feature: vibgyorseek-employee-monitoring, Property 22: Real-Time Notification - should send notification to multiple clients simultaneously', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            employee_name: fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
            client_count: fc.integer({ min: 2, max: 5 }),
            work_seconds: fc.integer({ min: 0, max: 86400 }),
          }),
          async (data) => {
            // Create multiple authenticated clients
            const clients: WebSocket[] = [];
            for (let i = 0; i < data.client_count; i++) {
              const client = await createAuthenticatedClient();
              clients.push(client);
            }

            // Set up promises to capture notifications from all clients
            const notificationPromises = clients.map((client) => {
              return new Promise<any>((resolve) => {
                const messageHandler = (msgData: Buffer) => {
                  const message = JSON.parse(msgData.toString());
                  if (message.type === 'new_data') {
                    resolve(message);
                  }
                };
                client.on('message', messageHandler);
              });
            });

            // Send notification
            websocketService.notifyNewData(data.employee_name, {
              work_seconds: data.work_seconds,
            });

            // Wait for all clients to receive notification
            const notifications = await Promise.race([
              Promise.all(notificationPromises),
              new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Notification timeout')), 3000)
              ),
            ]);

            // Verify all clients received the notification
            expect(notifications).toHaveLength(data.client_count);
            (notifications as any[]).forEach((notification) => {
              expect(notification.type).toBe('new_data');
              expect(notification.employeeName).toBe(data.employee_name);
              expect(notification.data.work_seconds).toBe(data.work_seconds);
            });

            // Clean up all clients
            await Promise.all(clients.map(closeClient));
          }
        ),
        { numRuns: 50 }
      );
    }, 120000);

    /**
     * Property: For any notification, unauthenticated clients should NOT receive it
     */
    it('Feature: vibgyorseek-employee-monitoring, Property 22: Real-Time Notification - should NOT send notifications to unauthenticated clients', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            employee_name: fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
            work_seconds: fc.integer({ min: 0, max: 86400 }),
          }),
          async (data) => {
            // Create an unauthenticated client
            const ws = new WebSocket(`ws://localhost:${port}/ws`);
            let receivedNotification = false;

            await new Promise<void>((resolve) => {
              ws.on('open', () => resolve());
            });

            // Set up message handler to check for notifications
            ws.on('message', (msgData: Buffer) => {
              const message = JSON.parse(msgData.toString());
              if (message.type === 'new_data' || message.type === 'employee_update') {
                receivedNotification = true;
              }
            });

            // Send notification
            websocketService.notifyNewData(data.employee_name, {
              work_seconds: data.work_seconds,
            });

            // Wait a bit to see if notification is received
            await new Promise((resolve) => setTimeout(resolve, 500));

            // Verify unauthenticated client did NOT receive notification
            expect(receivedNotification).toBe(false);

            // Clean up
            await closeClient(ws);
          }
        ),
        { numRuns: 50 }
      );
    }, 90000);

    /**
     * Property: For any notification with empty or minimal payload, it should still be delivered
     */
    it('Feature: vibgyorseek-employee-monitoring, Property 22: Real-Time Notification - should handle notifications with minimal payload', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
          async (employeeName) => {
            // Create an authenticated client
            const client = await createAuthenticatedClient();

            // Set up promise to capture notification
            const notificationReceived = new Promise<any>((resolve) => {
              const messageHandler = (data: Buffer) => {
                const message = JSON.parse(data.toString());
                if (message.type === 'employee_update') {
                  resolve(message);
                }
              };
              client.on('message', messageHandler);
            });

            // Send notification without payload
            websocketService.notifyEmployeeUpdate(employeeName, 'status_change');

            // Wait for notification
            const notification = await Promise.race([
              notificationReceived,
              new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Notification timeout')), 2000)
              ),
            ]);

            // Verify notification was received even without payload
            expect(notification).toBeDefined();
            expect((notification as any).type).toBe('employee_update');
            expect((notification as any).employeeName).toBe(employeeName);
            expect((notification as any).eventType).toBe('status_change');
            expect((notification as any).timestamp).toBeDefined();

            // Clean up
            await closeClient(client);
          }
        ),
        { numRuns: 100 }
      );
    }, 120000);

    /**
     * Property: For any sequence of notifications, they should be delivered in order
     */
    it('Feature: vibgyorseek-employee-monitoring, Property 22: Real-Time Notification - should deliver notifications in order', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              employee_name: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
              sequence_number: fc.integer({ min: 1, max: 1000 }),
            }),
            { minLength: 2, maxLength: 5 }
          ),
          async (notifications) => {
            // Create an authenticated client
            const client = await createAuthenticatedClient();

            // Set up array to capture notifications
            const receivedNotifications: any[] = [];
            const allReceived = new Promise<void>((resolve) => {
              const messageHandler = (data: Buffer) => {
                const message = JSON.parse(data.toString());
                if (message.type === 'new_data') {
                  receivedNotifications.push(message);
                  if (receivedNotifications.length === notifications.length) {
                    resolve();
                  }
                }
              };
              client.on('message', messageHandler);
            });

            // Send notifications in sequence
            for (const notification of notifications) {
              websocketService.notifyNewData(notification.employee_name, {
                sequence: notification.sequence_number,
              });
              // Small delay to ensure ordering
              await new Promise((resolve) => setTimeout(resolve, 10));
            }

            // Wait for all notifications to be received
            await Promise.race([
              allReceived,
              new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Notification timeout')), 5000)
              ),
            ]);

            // Verify all notifications were received
            expect(receivedNotifications).toHaveLength(notifications.length);

            // Verify order is preserved
            for (let i = 0; i < notifications.length; i++) {
              expect(receivedNotifications[i].employeeName).toBe(notifications[i].employee_name);
              expect(receivedNotifications[i].data.sequence).toBe(notifications[i].sequence_number);
            }

            // Clean up
            await closeClient(client);
          }
        ),
        { numRuns: 50 }
      );
    }, 120000);
  });
});
