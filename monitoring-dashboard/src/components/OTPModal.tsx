import React, { useState } from 'react';
import { X, Lock, Mail, AlertCircle, CheckCircle, RefreshCw } from 'lucide-react';
import api from '../services/api';
import toast from 'react-hot-toast';
import { Portal } from './ui';

interface OTPModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const OTPModal: React.FC<OTPModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [otp, setOtp] = useState('');
  const [isRequesting, setIsRequesting] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [otpSent, setOtpSent] = useState(false);

  if (!isOpen) return null;

  const handleRequestOTP = async () => {
    setIsRequesting(true);
    try {
      const response = await api.post('/dashboard-config/request-otp');
      toast.success(`OTPs sent to ${response.data.emailCount} admin email(s)`);
      setOtpSent(true);
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to send OTPs');
    } finally {
      setIsRequesting(false);
    }
  };

  const handleVerifyOTP = async () => {
    if (!otp || otp.length !== 6) {
      toast.error('Please enter a valid 6-digit OTP');
      return;
    }

    setIsVerifying(true);
    try {
      await api.post('/dashboard-config/verify-otp', { otp });
      toast.success('Restricted mode disabled successfully!');
      onSuccess();
      onClose();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Invalid or expired OTP');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleClose = () => {
    setOtp('');
    setOtpSent(false);
    onClose();
  };

  return (
    <Portal>
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[color-mix(in_oklab,var(--background)_55%,transparent)] p-4 backdrop-blur-2xl">
      <div className="pro-card max-w-md w-full overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border)] p-6">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-red-500/10 p-3">
              <Lock className="h-6 w-6 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <h2 className="font-display text-xl font-bold text-[var(--foreground)]">
                Unlock Settings
              </h2>
              <p className="text-sm text-[var(--muted-foreground)]">
                Restricted Mode Enabled
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {!otpSent ? (
            <>
              <div className="flex items-start gap-3 rounded-2xl border border-[var(--border)] bg-[var(--accent)]/70 p-4">
                <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-[var(--primary)]" />
                <div className="text-sm text-[var(--accent-foreground)]">
                  <p className="font-medium mb-1">OTP Required</p>
                  <p>
                    Settings are currently locked. Request an OTP to be sent to all configured admin emails.
                    Any of the 5 OTPs can be used to unlock.
                  </p>
                </div>
              </div>

              <button
                onClick={handleRequestOTP}
                disabled={isRequesting}
                className="btn-primary w-full py-3"
              >
                {isRequesting ? (
                  <>
                    <RefreshCw className="w-5 h-5 animate-spin" />
                    Sending OTPs...
                  </>
                ) : (
                  <>
                    <Mail className="w-5 h-5" />
                    Request OTP
                  </>
                )}
              </button>
            </>
          ) : (
            <>
              <div className="flex items-start gap-3 rounded-2xl border border-[color-mix(in_oklab,var(--success)_28%,transparent)] bg-[color-mix(in_oklab,var(--success)_10%,transparent)] p-4">
                <CheckCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-[var(--success)]" />
                <div className="text-sm text-[var(--foreground)]">
                  <p className="font-medium mb-1">OTPs Sent!</p>
                  <p>
                    Check your email for the 6-digit OTP. The OTP is valid for 10 minutes.
                  </p>
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-[var(--muted-foreground)]">
                  Enter OTP
                </label>
                <input
                  type="text"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  onKeyPress={(e) => e.key === 'Enter' && handleVerifyOTP()}
                  placeholder="000000"
                  maxLength={6}
                  className="dashboard-control w-full px-4 py-3 text-center font-mono text-2xl tracking-widest"
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={handleRequestOTP}
                  disabled={isRequesting}
                  className="btn-secondary flex-1"
                >
                  {isRequesting ? 'Resending...' : 'Resend OTP'}
                </button>
                <button
                  onClick={handleVerifyOTP}
                  disabled={isVerifying || otp.length !== 6}
                  className="btn-primary flex-1"
                >
                  {isVerifying ? 'Verifying...' : 'Verify'}
                </button>
              </div>
            </>
          )}

          <div className="border-t border-[var(--border)] pt-4">
            <p className="text-center text-xs text-[var(--muted-foreground)]">
              Contact your system administrator if you don't have access to admin emails
            </p>
          </div>
        </div>
      </div>
    </div>
    </Portal>
  );
};

export default OTPModal;
