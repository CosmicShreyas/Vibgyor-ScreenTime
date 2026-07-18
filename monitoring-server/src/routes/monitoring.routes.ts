import { Router } from 'express';
import { logger } from '../utils/logger';
import { validateClientToken } from '../middleware/auth.middleware';
import { validationService } from '../services/validation.service';
import { MonitoringPayload } from '../models/activity-log.model';
import { websocketService } from '../services/websocket.service';
import { dataStorageService } from '../services/data-storage.service';
import { connectedClientService } from '../services/connected-client.service';
import { employeeService } from '../services/employee.service';

const router = Router();

/**
 * POST /api/monitoring/heartbeat
 * Lightweight liveness ping from clients. Updates connected-client and employee
 * lastSeen so the dashboard/alerts detect offline within ~1 minute, independent
 * of the slower data-send interval.
 */
router.post('/heartbeat', validateClientToken, async (req, res) => {
  try {
    const { client_id, employee_name, paused } = req.body || {};
    if (!client_id || typeof client_id !== 'string') {
      res.status(400).json({ error: 'client_id is required' });
      return;
    }

    await connectedClientService.registerClient(client_id, employee_name);
    if (employee_name) {
      await employeeService.touchLastSeenByName(employee_name);
    }

    res.status(200).json({ success: true, paused: !!paused });
  } catch (error) {
    logger.error('Error processing heartbeat:', error);
    res.status(500).json({ error: 'Failed to process heartbeat' });
  }
});

/**
 * POST /api/monitoring/data
 * Receives monitoring data from client applications
 * Validates: Requirements 9.1, 9.2, 9.5
 */
router.post('/data', validateClientToken, async (req, res) => {
  try {
    const payload = req.body;
    
    // Extract client_id, employee_name, employee_id, and system_info from payload
    const clientId = payload?.client_id;
    const employeeName = payload?.employee_name;
    const employeeId = payload?.employee_id;
    const systemInfo = payload?.system_info;
    
    if (!clientId || typeof clientId !== 'string') {
      logger.warn('Missing or invalid client_id in payload', { ip: req.ip });
      res.status(400).json({
        error: 'client_id is required',
      });
      return;
    }
    
    // Register/update client connection with employee info and system info
    await connectedClientService.registerClient(clientId, employeeName, employeeId, systemInfo);
    
    // Get employee name for this client (use from payload or fallback to stored value)
    const storedEmployeeName = await connectedClientService.getEmployeeNameByClientId(clientId);
    const displayName = employeeName || storedEmployeeName || clientId;
    
    // Validate payload structure (Property 12: Payload Validation)
    const validationResult = validationService.validatePayloadDetailed(payload);
    
    if (!validationResult.valid) {
      // Property 15: Invalid Payload Rejection
      logger.warn('Invalid payload received', {
        errors: validationResult.errors,
        client_id: clientId,
        ip: req.ip
      });
      
      res.status(400).json({
        error: 'Invalid payload structure',
        details: validationResult.errors
      });
      return;
    }
    
    // Type assertion after validation
    const monitoringPayload = payload as MonitoringPayload;
    
    // Override employee_name with the one from payload or connected_clients or use client_id
    monitoringPayload.employee_name = displayName;
    
    logger.info('Processing monitoring data', {
      client_id: clientId,
      employee: displayName,
      employee_id: employeeId,
      timestamp: monitoringPayload.timestamp
    });
    
    // Store data using transaction for consistency (Requirements 17.1, 17.2, 17.4)
    const storageResult = await dataStorageService.storeMonitoringData(monitoringPayload);
    logger.debug('Data stored successfully', storageResult);
    
    // Broadcast notification to dashboard clients (Requirement 15.1)
    // Send employee-specific notification about new monitoring data
    try {
      websocketService.notifyEmployeeUpdate(
        displayName,
        'data_update',
        {
          timestamp: monitoringPayload.timestamp,
          work_seconds: monitoringPayload.activity.work_seconds,
          idle_seconds: monitoringPayload.activity.idle_seconds,
          applications_count: monitoringPayload.applications?.length || 0,
          browser_tabs_count: monitoringPayload.browser_tabs?.length || 0
        }
      );
    } catch (wsError) {
      // Log WebSocket notification error but don't fail the request
      logger.error('Failed to send WebSocket notification', {
        error: wsError instanceof Error ? wsError.message : 'Unknown error',
        employee: displayName
      });
    }
    
    res.status(200).json({
      success: true,
      message: 'Monitoring data received successfully'
    });
    
  } catch (error) {
    logger.error('Error processing monitoring data:', error);
    res.status(500).json({ error: 'Failed to process monitoring data' });
  }
});

export default router;
