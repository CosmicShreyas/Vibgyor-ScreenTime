import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { logger, requestLogger } from './utils/logger';
import { config } from './config';
import { initializeDatabase } from './database';
import monitoringRoutes from './routes/monitoring.routes';
import dashboardRoutes from './routes/dashboard.routes';
import screenshotRoutes from './routes/screenshot.routes';
import authRoutes from './routes/auth.routes';
import configRoutes from './routes/config.routes';
import serverConfigRoutes from './routes/server-config.routes';
import dashboardConfigRoutes from './routes/dashboard-config.routes';
import reportsRoutes from './routes/reports.routes';
import eodReportsRoutes from './routes/eod-reports.routes';
import clientEnvRoutes from './routes/client-env.routes';
import connectedClientsRoutes from './routes/connected-clients.routes';
import otpRoutes from './routes/otp.routes';
import screenshotArchiveRoutes from './routes/screenshot-archive.routes';
import analyticsRoutes from './routes/analytics.routes';
import { cleanupService } from './services/cleanup.service';
import { websocketService } from './services/websocket.service';
import { eodReportsService } from './services/eod-reports.service';
import { offlineAlertService } from './services/offline-alert.service';
import { globalErrorHandler, notFoundHandler } from './middleware/error.middleware';
import { serverConfigService } from './services/server-config.service';

// Load environment variables
dotenv.config();

const app = express();
const httpServer = createServer(app);

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Request logging middleware
app.use(requestLogger);

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/monitoring', monitoringRoutes);
app.use('/api/employees', dashboardRoutes);
app.use('/api/screenshots', screenshotRoutes);
app.use('/api/config', configRoutes);
app.use('/api/server-config', serverConfigRoutes);
app.use('/api/dashboard-config', dashboardConfigRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/eod-reports', eodReportsRoutes);
app.use('/api/client-env', clientEnvRoutes);
app.use('/api/connected-clients', connectedClientsRoutes);
app.use('/api/otp', otpRoutes);
app.use('/api/screenshot-archive', screenshotArchiveRoutes);
app.use('/api/analytics', analyticsRoutes);

// 404 handler - must be after all routes
app.use(notFoundHandler);

// Global error handling middleware - must be last
app.use(globalErrorHandler);

// Initialize database and start server
async function startServer() {
  try {
    // Initialize database schema
    await initializeDatabase();

    // Environment values only bootstrap the first database connection. From
    // this point onward the persisted MongoDB record is the source of truth.
    await serverConfigService.initialize();
    
    // Start cleanup service for expired screenshots
    cleanupService.start();

    // Start offline alert checker for disconnected clients
    offlineAlertService.start();
    
    // Initialize WebSocket server
    websocketService.initialize(httpServer);
    
    // Initialize EOD reports scheduler
    await eodReportsService.initialize();
    
    // Start listening
    const PORT = config.port;
    httpServer.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
      logger.info(`Environment: ${config.nodeEnv}`);
      logger.info(`WebSocket server available at ws://localhost:${PORT}/ws`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  logger.error('Unhandled Promise Rejection:', {
    reason: reason instanceof Error ? reason.message : reason,
    stack: reason instanceof Error ? reason.stack : undefined,
    promise: promise,
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught Exception:', {
    message: error.message,
    stack: error.stack,
  });
  
  // Give logger time to write, then exit
  setTimeout(() => {
    process.exit(1);
  }, 1000);
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  offlineAlertService.stop();
  websocketService.shutdown();
  httpServer.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT signal received: closing HTTP server');
  offlineAlertService.stop();
  websocketService.shutdown();
  httpServer.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});

startServer();

export default app;
