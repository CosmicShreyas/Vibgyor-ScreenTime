import React from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { Portal } from './ui';

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'danger' | 'warning' | 'info';
}

const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  type = 'danger',
}) => {
  if (!isOpen) return null;

  const typeStyles = {
    danger: {
      icon: 'text-red-600 dark:text-red-400',
      iconBg: 'bg-red-500/10',
      button: 'btn-danger',
    },
    warning: {
      icon: 'text-yellow-600 dark:text-yellow-400',
      iconBg: 'bg-[color-mix(in_oklab,var(--warning)_16%,transparent)]',
      button: 'btn-primary',
    },
    info: {
      icon: 'text-[var(--primary)]',
      iconBg: 'bg-[color-mix(in_oklab,var(--primary)_14%,transparent)]',
      button: 'btn-primary',
    },
  };

  const styles = typeStyles[type];

  return (
    <Portal>
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[color-mix(in_oklab,var(--background)_55%,transparent)] p-4 backdrop-blur-2xl">
      <div className="pro-card max-w-md w-full overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border)] p-6">
          <div className="flex items-center gap-3">
            <div className={`rounded-2xl p-3 ${styles.iconBg}`}>
              <AlertTriangle className={`w-6 h-6 ${styles.icon}`} />
            </div>
            <h2 className="font-display text-xl font-bold text-[var(--foreground)]">
              {title}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          <p className="text-[var(--muted-foreground)]">
            {message}
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-3 border-t border-[var(--border)] p-6">
          <button
            onClick={onClose}
            className="btn-secondary flex-1"
          >
            {cancelText}
          </button>
          <button
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className={`flex-1 ${styles.button}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
    </Portal>
  );
};

export default ConfirmationModal;
