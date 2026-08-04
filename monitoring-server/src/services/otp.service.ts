import nodemailer from 'nodemailer';
import { logger } from '../utils/logger';

interface OTPRecord {
  otp: string;
  expiresAt: Date;
  attempts: number;
}

/**
 * Service for managing employee info update OTP generation and verification
 */
class EmployeeOTPService {
  private otpStore: Map<string, OTPRecord> = new Map();
  private readonly OTP_EXPIRY_MINUTES = 10;
  private readonly MAX_ATTEMPTS = 3;
  private transporter: nodemailer.Transporter | null = null;

  constructor() {
    this.initializeEmailTransporter();
  }

  /**
   * Initialize email transporter
   */
  private initializeEmailTransporter() {
    const smtpEmail = process.env.SMTP_EMAIL;
    const smtpPassword = process.env.SMTP_APP_PASSWORD;

    if (!smtpEmail || !smtpPassword) {
      logger.warn('SMTP credentials not configured. OTP emails will not be sent.');
      return;
    }

    try {
      this.transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: smtpEmail,
          pass: smtpPassword,
        },
      });

      logger.info('Email transporter initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize email transporter:', error);
    }
  }

  /**
   * Generate a 6-digit OTP
   */
  private generateOTP(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  /**
   * Request OTP for employee info update
   * Sends OTP to admin email
   */
  async requestOTP(clientId: string, employeeName: string, employeeId: string): Promise<{ success: boolean; message: string }> {
    try {
      const adminEmail = process.env.ADMIN_EMAIL;

      if (!adminEmail) {
        logger.error('ADMIN_EMAIL not configured in environment');
        return {
          success: false,
          message: 'Admin email not configured on server',
        };
      }

      if (!this.transporter) {
        logger.error('Email transporter not initialized');
        return {
          success: false,
          message: 'Email service not configured',
        };
      }

      // Generate OTP
      const otp = this.generateOTP();
      const expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() + this.OTP_EXPIRY_MINUTES);

      // Store OTP
      this.otpStore.set(clientId, {
        otp,
        expiresAt,
        attempts: 0,
      });

      // Send email
      const mailOptions = {
        from: process.env.SMTP_EMAIL,
        to: adminEmail,
        subject: 'ScreenTime - Employee Information Update OTP',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2563eb;">Employee Information Update Request</h2>
            <p>A client is requesting to update employee information:</p>
            <div style="background-color: #f3f4f6; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <p><strong>Employee Name:</strong> ${employeeName}</p>
              <p><strong>Employee ID:</strong> ${employeeId}</p>
              <p><strong>Client ID:</strong> ${clientId}</p>
            </div>
            <div style="background-color: #dbeafe; padding: 20px; border-radius: 5px; text-align: center; margin: 20px 0;">
              <p style="margin: 0; font-size: 14px; color: #1e40af;">Your OTP Code:</p>
              <h1 style="margin: 10px 0; font-size: 36px; color: #1e40af; letter-spacing: 5px;">${otp}</h1>
              <p style="margin: 0; font-size: 12px; color: #1e40af;">Valid for ${this.OTP_EXPIRY_MINUTES} minutes</p>
            </div>
            <p style="color: #6b7280; font-size: 14px;">
              If you did not request this OTP, please ignore this email.
            </p>
          </div>
        `,
      };

      await this.transporter.sendMail(mailOptions);

      logger.info(`OTP sent to admin email for client ${clientId}`);

      return {
        success: true,
        message: `OTP sent to admin email (${this.maskEmail(adminEmail)}). Valid for ${this.OTP_EXPIRY_MINUTES} minutes.`,
      };
    } catch (error) {
      logger.error('Failed to send OTP email:', error);
      return {
        success: false,
        message: 'Failed to send OTP email',
      };
    }
  }

  /**
   * Verify OTP
   */
  verifyOTP(clientId: string, otp: string): { success: boolean; message: string } {
    const record = this.otpStore.get(clientId);

    if (!record) {
      return {
        success: false,
        message: 'No OTP found. Please request a new OTP.',
      };
    }

    // Check expiry
    if (new Date() > record.expiresAt) {
      this.otpStore.delete(clientId);
      return {
        success: false,
        message: 'OTP has expired. Please request a new OTP.',
      };
    }

    // Check attempts
    if (record.attempts >= this.MAX_ATTEMPTS) {
      this.otpStore.delete(clientId);
      return {
        success: false,
        message: 'Maximum verification attempts exceeded. Please request a new OTP.',
      };
    }

    // Verify OTP
    if (record.otp !== otp) {
      record.attempts++;
      return {
        success: false,
        message: `Invalid OTP. ${this.MAX_ATTEMPTS - record.attempts} attempts remaining.`,
      };
    }

    // OTP verified successfully
    this.otpStore.delete(clientId);
    return {
      success: true,
      message: 'OTP verified successfully',
    };
  }

  /**
   * Mask email for display
   */
  private maskEmail(email: string): string {
    const [username, domain] = email.split('@');
    if (username.length <= 2) {
      return `${username[0]}***@${domain}`;
    }
    return `${username.substring(0, 2)}***@${domain}`;
  }

  /**
   * Clean up expired OTPs (called periodically)
   */
  cleanupExpiredOTPs() {
    const now = new Date();
    for (const [clientId, record] of this.otpStore.entries()) {
      if (now > record.expiresAt) {
        this.otpStore.delete(clientId);
        logger.debug(`Cleaned up expired OTP for client ${clientId}`);
      }
    }
  }
}

export const employeeOTPService = new EmployeeOTPService();

// Clean up expired OTPs every 5 minutes
setInterval(() => {
  employeeOTPService.cleanupExpiredOTPs();
}, 5 * 60 * 1000);

/**
 * Service for managing dashboard configuration OTP generation and sending
 */
class DashboardOTPService {
  private transporter: nodemailer.Transporter | null = null;

  constructor() {
    this.initializeEmailTransporter();
  }

  /**
   * Initialize email transporter
   */
  private initializeEmailTransporter() {
    const smtpEmail = process.env.SMTP_EMAIL;
    const smtpPassword = process.env.SMTP_APP_PASSWORD;

    if (!smtpEmail || !smtpPassword) {
      logger.warn('SMTP credentials not configured. OTP emails will not be sent.');
      return;
    }

    try {
      this.transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: smtpEmail,
          pass: smtpPassword,
        },
      });

      logger.info('Dashboard OTP email transporter initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize dashboard OTP email transporter:', error);
    }
  }

  /**
   * Generate a 6-digit OTP
   */
  private generateOTP(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  /**
   * Generate and send OTPs to admin emails
   */
  async generateAndSendOTPs(adminEmails: string[]): Promise<void> {
    if (!this.transporter) {
      throw new Error('Email transporter not initialized');
    }

    const otp = this.generateOTP();
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 10);

    for (const email of adminEmails) {
      const mailOptions = {
        from: process.env.SMTP_EMAIL,
        to: email,
        subject: 'ScreenTime - Dashboard Configuration OTP',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2563eb;">Dashboard Configuration Update</h2>
            <p>An administrator is updating the dashboard configuration.</p>
            <div style="background-color: #dbeafe; padding: 20px; border-radius: 5px; text-align: center; margin: 20px 0;">
              <p style="margin: 0; font-size: 14px; color: #1e40af;">Your OTP Code:</p>
              <h1 style="margin: 10px 0; font-size: 36px; color: #1e40af; letter-spacing: 5px;">${otp}</h1>
              <p style="margin: 0; font-size: 12px; color: #1e40af;">Valid for 10 minutes</p>
            </div>
            <p style="color: #6b7280; font-size: 14px;">
              If you did not request this OTP, please contact your system administrator immediately.
            </p>
          </div>
        `,
      };

      await this.transporter.sendMail(mailOptions);
      logger.info(`Dashboard OTP sent to ${email}`);
    }
  }

  /**
   * Verify OTP (placeholder - implement as needed)
   */
  verifyOTP(otp: string): boolean {
    // This is a placeholder - implement proper OTP verification if needed
    return true;
  }
}

export const otpService = new DashboardOTPService();
