import { websocketService } from '../websocket.service';
import { Server } from 'http';
import WebSocket from 'ws';
import jwt from 'jsonwebtoken';
import { config } from '../../config';

describe('WebSocket Service', () => {
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
    // Clean up any remaining connections
    jest.clearAllMocks();
  });

  describe('Connection Management', () => {
    it('should accept WebSocket connections', (done) => {
      const ws = new WebSocket(`ws://localhost:${port}/ws`);

      ws.on('open', () => {
        expect(ws.readyState).toBe(WebSocket.OPEN);
        ws.close();
        done();
      });

      ws.on('error', (error) => {
        done(error);
      });
    });

    it('should send auth_required message on connection', (done) => {
      const ws = new WebSocket(`ws://localhost:${port}/ws`);

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        expect(message.type).toBe('auth_required');
        expect(message.message).toContain('authenticate');
        ws.close();
        done();
      });

      ws.on('error', (error) => {
        done(error);
      });
    });

    it('should reject messages from unauthenticated connections', (done) => {
      const ws = new WebSocket(`ws://localhost:${port}/ws`);
      let messageCount = 0;

      ws.on('message', (data) => {
        messageCount++;
        const message = JSON.parse(data.toString());

        if (messageCount === 1) {
          // First message is auth_required
          expect(message.type).toBe('auth_required');
          
          // Try to send a non-auth message
          ws.send(JSON.stringify({ type: 'test', data: 'hello' }));
        } else if (messageCount === 2) {
          // Second message should be error
          expect(message.type).toBe('error');
          expect(message.message).toContain('Authentication required');
          ws.close();
          done();
        }
      });

      ws.on('error', (error) => {
        done(error);
      });
    });
  });

  describe('Authentication', () => {
    it('should authenticate with valid JWT token', (done) => {
      const token = jwt.sign({ userId: 'test-user' }, config.jwtSecret, { expiresIn: '1h' });
      const ws = new WebSocket(`ws://localhost:${port}/ws`);
      let messageCount = 0;

      ws.on('message', (data) => {
        messageCount++;
        const message = JSON.parse(data.toString());

        if (messageCount === 1) {
          // First message is auth_required
          expect(message.type).toBe('auth_required');
          
          // Send authentication message
          ws.send(JSON.stringify({ type: 'auth', token }));
        } else if (messageCount === 2) {
          // Second message should be auth_success
          expect(message.type).toBe('auth_success');
          expect(message.message).toContain('successful');
          ws.close();
          done();
        }
      });

      ws.on('error', (error) => {
        done(error);
      });
    });

    it('should reject invalid JWT token', (done) => {
      const ws = new WebSocket(`ws://localhost:${port}/ws`);
      let messageCount = 0;

      ws.on('message', (data) => {
        messageCount++;
        const message = JSON.parse(data.toString());

        if (messageCount === 1) {
          // First message is auth_required
          expect(message.type).toBe('auth_required');
          
          // Send authentication with invalid token
          ws.send(JSON.stringify({ type: 'auth', token: 'invalid-token' }));
        } else if (messageCount === 2) {
          // Second message should be auth_failed
          expect(message.type).toBe('auth_failed');
          expect(message.message).toContain('Invalid');
          done();
        }
      });

      ws.on('close', (code) => {
        expect(code).toBe(1008); // Policy violation
      });

      ws.on('error', () => {
        // Connection will be closed after auth failure
      });
    });

    it('should reject expired JWT token', (done) => {
      const token = jwt.sign({ userId: 'test-user' }, config.jwtSecret, { expiresIn: '-1h' });
      const ws = new WebSocket(`ws://localhost:${port}/ws`);
      let messageCount = 0;

      ws.on('message', (data) => {
        messageCount++;
        const message = JSON.parse(data.toString());

        if (messageCount === 1) {
          // First message is auth_required
          expect(message.type).toBe('auth_required');
          
          // Send authentication with expired token
          ws.send(JSON.stringify({ type: 'auth', token }));
        } else if (messageCount === 2) {
          // Second message should be auth_failed
          expect(message.type).toBe('auth_failed');
          done();
        }
      });

      ws.on('error', () => {
        // Connection will be closed after auth failure
      });
    });
  });

  describe('Broadcasting', () => {
    it('should broadcast messages to authenticated clients', (done) => {
      const token = jwt.sign({ userId: 'test-user' }, config.jwtSecret, { expiresIn: '1h' });
      const ws = new WebSocket(`ws://localhost:${port}/ws`);
      let messageCount = 0;

      ws.on('message', (data) => {
        messageCount++;
        const message = JSON.parse(data.toString());

        if (messageCount === 1) {
          // First message is auth_required
          ws.send(JSON.stringify({ type: 'auth', token }));
        } else if (messageCount === 2) {
          // Second message is auth_success
          expect(message.type).toBe('auth_success');
          
          // Broadcast a test message
          websocketService.broadcast({ type: 'test', data: 'broadcast' });
        } else if (messageCount === 3) {
          // Third message should be the broadcast
          expect(message.type).toBe('test');
          expect(message.data).toBe('broadcast');
          ws.close();
          done();
        }
      });

      ws.on('error', (error) => {
        done(error);
      });
    });

    it('should not broadcast to unauthenticated clients', (done) => {
      const ws = new WebSocket(`ws://localhost:${port}/ws`);
      let messageCount = 0;

      ws.on('message', (data) => {
        messageCount++;
        const message = JSON.parse(data.toString());

        if (messageCount === 1) {
          // First message is auth_required
          expect(message.type).toBe('auth_required');
          
          // Broadcast a test message (should not be received)
          websocketService.broadcast({ type: 'test', data: 'broadcast' });
          
          // Wait a bit and close
          setTimeout(() => {
            expect(messageCount).toBe(1); // Only auth_required received
            ws.close();
            done();
          }, 100);
        }
      });

      ws.on('error', (error) => {
        done(error);
      });
    });
  });

  describe('Notification Methods', () => {
    it('should send new data notifications', (done) => {
      const token = jwt.sign({ userId: 'test-user' }, config.jwtSecret, { expiresIn: '1h' });
      const ws = new WebSocket(`ws://localhost:${port}/ws`);
      let messageCount = 0;

      ws.on('message', (data) => {
        messageCount++;
        const message = JSON.parse(data.toString());

        if (messageCount === 1) {
          ws.send(JSON.stringify({ type: 'auth', token }));
        } else if (messageCount === 2) {
          // Notify new data
          websocketService.notifyNewData('John Doe', { workSeconds: 300 });
        } else if (messageCount === 3) {
          expect(message.type).toBe('new_data');
          expect(message.employeeName).toBe('John Doe');
          expect(message.data).toEqual({ workSeconds: 300 });
          expect(message.timestamp).toBeDefined();
          ws.close();
          done();
        }
      });

      ws.on('error', (error) => {
        done(error);
      });
    });

    it('should send employee-specific update notifications', (done) => {
      const token = jwt.sign({ userId: 'test-user' }, config.jwtSecret, { expiresIn: '1h' });
      const ws = new WebSocket(`ws://localhost:${port}/ws`);
      let messageCount = 0;

      ws.on('message', (data) => {
        messageCount++;
        const message = JSON.parse(data.toString());

        if (messageCount === 1) {
          ws.send(JSON.stringify({ type: 'auth', token }));
        } else if (messageCount === 2) {
          // Send employee-specific notification
          websocketService.notifyEmployeeUpdate('Jane Smith', 'data_update', {
            work_seconds: 450,
            idle_seconds: 150
          });
        } else if (messageCount === 3) {
          expect(message.type).toBe('employee_update');
          expect(message.employeeName).toBe('Jane Smith');
          expect(message.eventType).toBe('data_update');
          expect(message.payload).toEqual({
            work_seconds: 450,
            idle_seconds: 150
          });
          expect(message.timestamp).toBeDefined();
          ws.close();
          done();
        }
      });

      ws.on('error', (error) => {
        done(error);
      });
    });

    it('should handle notifications without payload', (done) => {
      const token = jwt.sign({ userId: 'test-user' }, config.jwtSecret, { expiresIn: '1h' });
      const ws = new WebSocket(`ws://localhost:${port}/ws`);
      let messageCount = 0;

      ws.on('message', (data) => {
        messageCount++;
        const message = JSON.parse(data.toString());

        if (messageCount === 1) {
          ws.send(JSON.stringify({ type: 'auth', token }));
        } else if (messageCount === 2) {
          // Send notification without payload
          websocketService.notifyEmployeeUpdate('Bob Johnson', 'status_change');
        } else if (messageCount === 3) {
          expect(message.type).toBe('employee_update');
          expect(message.employeeName).toBe('Bob Johnson');
          expect(message.eventType).toBe('status_change');
          expect(message.payload).toBeUndefined();
          ws.close();
          done();
        }
      });

      ws.on('error', (error) => {
        done(error);
      });
    });

    it('should broadcast to multiple authenticated clients', (done) => {
      const token = jwt.sign({ userId: 'test-user' }, config.jwtSecret, { expiresIn: '1h' });
      const ws1 = new WebSocket(`ws://localhost:${port}/ws`);
      const ws2 = new WebSocket(`ws://localhost:${port}/ws`);
      
      let ws1MessageCount = 0;
      let ws2MessageCount = 0;
      let ws1Received = false;
      let ws2Received = false;

      const checkCompletion = () => {
        if (ws1Received && ws2Received) {
          ws1.close();
          ws2.close();
          done();
        }
      };

      ws1.on('message', (data) => {
        ws1MessageCount++;
        const message = JSON.parse(data.toString());

        if (ws1MessageCount === 1) {
          ws1.send(JSON.stringify({ type: 'auth', token }));
        } else if (ws1MessageCount === 2) {
          // Wait for both clients to authenticate
          setTimeout(() => {
            websocketService.notifyEmployeeUpdate('Alice Brown', 'data_update', { test: true });
          }, 100);
        } else if (ws1MessageCount === 3) {
          expect(message.type).toBe('employee_update');
          expect(message.employeeName).toBe('Alice Brown');
          ws1Received = true;
          checkCompletion();
        }
      });

      ws2.on('message', (data) => {
        ws2MessageCount++;
        const message = JSON.parse(data.toString());

        if (ws2MessageCount === 1) {
          ws2.send(JSON.stringify({ type: 'auth', token }));
        } else if (ws2MessageCount === 3) {
          expect(message.type).toBe('employee_update');
          expect(message.employeeName).toBe('Alice Brown');
          ws2Received = true;
          checkCompletion();
        }
      });

      ws1.on('error', (error) => done(error));
      ws2.on('error', (error) => done(error));
    });
  });

  describe('Client Count', () => {
    it('should track authenticated client count', (done) => {
      const token = jwt.sign({ userId: 'test-user' }, config.jwtSecret, { expiresIn: '1h' });
      const ws = new WebSocket(`ws://localhost:${port}/ws`);
      let messageCount = 0;

      ws.on('message', (data) => {
        messageCount++;
        const message = JSON.parse(data.toString());

        if (messageCount === 1) {
          ws.send(JSON.stringify({ type: 'auth', token }));
        } else if (messageCount === 2) {
          expect(message.type).toBe('auth_success');
          
          // Check client count
          const count = websocketService.getClientCount();
          expect(count).toBeGreaterThan(0);
          ws.close();
          done();
        }
      });

      ws.on('error', (error) => {
        done(error);
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid JSON messages', (done) => {
      const ws = new WebSocket(`ws://localhost:${port}/ws`);
      let messageCount = 0;

      ws.on('message', (data) => {
        messageCount++;
        const message = JSON.parse(data.toString());

        if (messageCount === 1) {
          // Send invalid JSON
          ws.send('invalid json');
        } else if (messageCount === 2) {
          expect(message.type).toBe('error');
          expect(message.message).toContain('Invalid message format');
          ws.close();
          done();
        }
      });

      ws.on('error', (error) => {
        done(error);
      });
    });

    it('should gracefully handle client disconnections during broadcast', (done) => {
      const token = jwt.sign({ userId: 'test-user' }, config.jwtSecret, { expiresIn: '1h' });
      const ws = new WebSocket(`ws://localhost:${port}/ws`);
      let messageCount = 0;

      ws.on('message', (data) => {
        messageCount++;
        const message = JSON.parse(data.toString());

        if (messageCount === 1) {
          ws.send(JSON.stringify({ type: 'auth', token }));
        } else if (messageCount === 2) {
          expect(message.type).toBe('auth_success');
          
          // Close the connection
          ws.close();
          
          // Wait for close to complete, then try to broadcast
          setTimeout(() => {
            // This should not throw an error
            expect(() => {
              websocketService.notifyEmployeeUpdate('Test User', 'data_update', { test: true });
            }).not.toThrow();
            done();
          }, 100);
        }
      });

      ws.on('error', (error) => {
        done(error);
      });
    });

    it('should remove disconnected clients from pool', (done) => {
      const token = jwt.sign({ userId: 'test-user' }, config.jwtSecret, { expiresIn: '1h' });
      const ws = new WebSocket(`ws://localhost:${port}/ws`);
      let messageCount = 0;

      ws.on('message', (data) => {
        messageCount++;
        const message = JSON.parse(data.toString());

        if (messageCount === 1) {
          ws.send(JSON.stringify({ type: 'auth', token }));
        } else if (messageCount === 2) {
          expect(message.type).toBe('auth_success');
          const initialCount = websocketService.getClientCount();
          expect(initialCount).toBeGreaterThan(0);
          
          // Close the connection
          ws.close();
        }
      });

      ws.on('close', () => {
        // Wait a bit for cleanup
        setTimeout(() => {
          // Trigger a broadcast to clean up disconnected clients
          websocketService.notifyEmployeeUpdate('Test', 'test');
          
          // The client count should be reduced after cleanup
          const finalCount = websocketService.getClientCount();
          expect(finalCount).toBeLessThanOrEqual(0);
          done();
        }, 100);
      });

      ws.on('error', (error) => {
        done(error);
      });
    });
  });
});
