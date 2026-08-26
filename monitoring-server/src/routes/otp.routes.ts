import { Router } from 'express';
import { logger } from '../utils/logger';
import { validateClientToken } from '../middleware/auth.middleware';
import { employeeOTPService } from '../services/otp.service';
import { connectedClientService } from '../services/connected-client.service';

const router = Router();

/**
 * POST /api/otp/request
 * Request OTP for employee info update
 */
router.post('/request', validateClientToken, async (req, res) => {
  try {
    const { client_id, employee_name, employee_id } = req.body;

    if (
      typeof client_id !== 'string' || !client_id.trim() ||
      typeof employee_name !== 'string' || !employee_name.trim() ||
      typeof employee_id !== 'string' || !employee_id.trim()
    ) {
      res.status(400).json({
        success: false,
        error: 'client_id, employee_name, and employee_id are required',
      });
      return;
    }

    logger.info('OTP request received', { client_id, employee_name, employee_id });

    const result = await employeeOTPService.requestOTP(
      client_id.trim(),
      employee_name.trim(),
      employee_id.trim()
    );

    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(500).json(result);
    }
  } catch (error) {
    logger.error('Error processing OTP request:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process OTP request',
    });
  }
});

/**
 * POST /api/otp/verify
 * Verify OTP
 */
router.post('/verify', validateClientToken, async (req, res) => {
  try {
    const { client_id, otp } = req.body;

    if (typeof client_id !== 'string' || !client_id.trim() || typeof otp !== 'string' || !otp.trim()) {
      res.status(400).json({
        success: false,
        error: 'client_id and otp are required',
      });
      return;
    }

    logger.info('OTP verification request', { client_id });

    const normalizedClientId = client_id.trim();
    const result = employeeOTPService.verifyOTP(normalizedClientId, otp.trim());

    if (result.success) {
      // OTP approval makes this employee identity trustworthy. Reconcile it
      // immediately so a replacement installation takes over the employee's
      // existing connected-client row before its first activity upload.
      await connectedClientService.registerClient(
        normalizedClientId,
        result.employeeName,
        result.employeeId,
        undefined,
        true
      );
      res.status(200).json({ success: true, message: result.message });
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    logger.error('Error verifying OTP:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify OTP',
    });
  }
});

export default router;
