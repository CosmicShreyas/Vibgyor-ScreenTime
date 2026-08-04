import { Router } from 'express';
import { logger } from '../utils/logger';
import { dashboardConfigService } from '../services/dashboard-config.service';
import { otpService } from '../services/otp.service';
import { validateJwtToken } from '../middleware/auth.middleware';

const router = Router();

/**
 * GET /api/dashboard-config
 * Get current dashboard configuration
 * Note: This endpoint does not require authentication as it only returns
 * non-sensitive configuration data (restrictedMode, toastNotifications, etc.)
 * needed for the login page to function properly
 */
router.get('/', async (req, res) => {
  try {
    logger.info('GET /api/dashboard-config - Request received');
    
    const config = await dashboardConfigService.getCurrentConfig();
    
    res.status(200).json(config);
  } catch (error) {
    logger.error('Error fetching dashboard configuration:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard configuration' });
  }
});

/**
 * PUT /api/dashboard-config
 * Update dashboard configuration
 */
router.put('/', validateJwtToken, async (req, res) => {
  try {
    logger.info('Updating dashboard configuration');
    
    const updates = req.body;
    
    // Validate password if changing
    if (updates.newPassword && updates.newPassword.length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters' });
      return;
    }

    // Validate admin emails if provided
    if (updates.adminEmails) {
      if (!Array.isArray(updates.adminEmails)) {
        res.status(400).json({ error: 'Admin emails must be an array' });
        return;
      }
      if (updates.adminEmails.length > 5) {
        res.status(400).json({ error: 'Maximum 5 admin emails allowed' });
        return;
      }
      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      for (const email of updates.adminEmails) {
        if (!emailRegex.test(email)) {
          res.status(400).json({ error: `Invalid email format: ${email}` });
          return;
        }
      }
    }
    
    const result = await dashboardConfigService.updateConfig(updates);
    
    logger.info('✅ Dashboard configuration updated successfully');
    
    res.status(200).json({ 
      message: 'Dashboard configuration updated successfully',
      credentialsChanged: result.credentialsChanged,
    });
  } catch (error: any) {
    if (error.message === 'Current password is incorrect') {
      res.status(400).json({ error: error.message });
      return;
    }
    
    logger.error('Error updating dashboard configuration:', error);
    res.status(500).json({ error: 'Failed to update dashboard configuration' });
  }
});

/**
 * POST /api/dashboard-config/request-otp
 * Request OTP to disable restricted mode
 */
router.post('/request-otp', async (req, res) => {
  try {
    logger.info('🔐 OTP request received');
    
    const config = await dashboardConfigService.getCurrentConfig();
    
    // Check if restricted mode is enabled
    if (!config.restrictedMode) {
      res.status(400).json({ error: 'Restricted mode is not enabled' });
      return;
    }

    // Check if admin emails are configured
    if (!config.adminEmails || config.adminEmails.length === 0) {
      res.status(400).json({ error: 'No admin emails configured' });
      return;
    }

    // Generate and send OTPs
    await otpService.generateAndSendOTPs(config.adminEmails);
    
    logger.info('✅ OTPs sent successfully');
    
    res.status(200).json({ 
      message: 'OTPs sent to all admin emails',
      emailCount: config.adminEmails.length,
    });
  } catch (error: any) {
    logger.error('❌ Error requesting OTP:', error);
    res.status(500).json({ error: error.message || 'Failed to send OTPs' });
  }
});

/**
 * POST /api/dashboard-config/verify-otp
 * Verify OTP and disable restricted mode
 */
router.post('/verify-otp', async (req, res) => {
  try {
    const { otp } = req.body;
    
    if (!otp) {
      res.status(400).json({ error: 'OTP is required' });
      return;
    }

    logger.info('🔍 Verifying OTP');
    
    // Verify OTP
    const isValid = otpService.verifyOTP(otp);
    
    if (!isValid) {
      res.status(400).json({ error: 'Invalid or expired OTP' });
      return;
    }

    // Disable restricted mode
    await dashboardConfigService.updateConfig({ restrictedMode: false });
    
    logger.info('✅ Restricted mode disabled successfully');
    
    res.status(200).json({ 
      message: 'Restricted mode disabled successfully',
      restrictedMode: false,
    });
  } catch (error: any) {
    logger.error('❌ Error verifying OTP:', error);
    res.status(500).json({ error: 'Failed to verify OTP' });
  }
});

export default router;
