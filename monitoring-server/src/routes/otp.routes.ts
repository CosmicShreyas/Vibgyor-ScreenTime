import { Router } from 'express';
import { logger } from '../utils/logger';
import { validateClientToken } from '../middleware/auth.middleware';
import { employeeOTPService } from '../services/otp.service';

const router = Router();

/**
 * POST /api/otp/request
 * Request OTP for employee info update
 */
router.post('/request', validateClientToken, async (req, res) => {
  try {
    const { client_id, employee_name, employee_id } = req.body;

    if (!client_id || !employee_name || !employee_id) {
      res.status(400).json({
        success: false,
        error: 'client_id, employee_name, and employee_id are required',
      });
      return;
    }

    logger.info('OTP request received', { client_id, employee_name, employee_id });

    const result = await employeeOTPService.requestOTP(client_id, employee_name, employee_id);

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

    if (!client_id || !otp) {
      res.status(400).json({
        success: false,
        error: 'client_id and otp are required',
      });
      return;
    }

    logger.info('OTP verification request', { client_id });

    const result = employeeOTPService.verifyOTP(client_id, otp);

    if (result.success) {
      res.status(200).json(result);
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
