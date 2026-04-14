import React, { useState } from 'react';
import { X, Lock, Mail, AlertCircle, CheckCircle, RefreshCw } from 'lucide-react';
import api from '../services/api';
import toast from 'react-hot-toast';

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-100 dark:bg-red-900/20 rounded-lg">
              <Lock className="w-6 h-6 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                Unlock Settings
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Restricted Mode Enabled
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {!otpSent ? (
            <>
              <div className="flex items-start gap-3 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <AlertCircle className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-blue-800 dark:text-blue-200">
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
                className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 
                         text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
              <div className="flex items-start gap-3 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-green-800 dark:text-green-200">
                  <p className="font-medium mb-1">OTPs Sent!</p>
                  <p>
                    Check your email for the 6-digit OTP. The OTP is valid for 10 minutes.
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Enter OTP
                </label>
                <input
                  type="text"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  onKeyPress={(e) => e.key === 'Enter' && handleVerifyOTP()}
                  placeholder="000000"
                  maxLength={6}
                  className="w-full px-4 py-3 text-center text-2xl font-mono tracking-widest border border-gray-300 dark:border-gray-600 rounded-lg 
                           bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                           focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={handleRequestOTP}
                  disabled={isRequesting}
                  className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 
                           rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
                >
                  {isRequesting ? 'Resending...' : 'Resend OTP'}
                </button>
                <button
                  onClick={handleVerifyOTP}
                  disabled={isVerifying || otp.length !== 6}
                  className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg 
                           transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isVerifying ? 'Verifying...' : 'Verify'}
                </button>
              </div>
            </>
          )}

          <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
              Contact your system administrator if you don't have access to admin emails
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OTPModal;
