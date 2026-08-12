import { cn } from '../../utils/cn';
import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { Button } from './Button';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  showClose?: boolean;
  footer?: ReactNode;
}

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
  showClose = true,
  footer,
}: ModalProps) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }

    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const sizeStyles = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    full: 'max-w-4xl',
  };

  return (
    <div className="fixed inset-0 z-50">
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm animate-fadeIn"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 flex items-end sm:items-center justify-center p-0 sm:p-4">
        <div
          className={cn(
            'w-full bg-white shadow-xl animate-slideUp',
            'rounded-t-2xl sm:rounded-2xl',
            'max-h-[90vh] sm:max-h-[85vh]',
            'flex flex-col',
            sizeStyles[size]
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Mobile handle */}
          <div className="sm:hidden flex justify-center py-2 flex-shrink-0">
            <div className="w-12 h-1 bg-slate-300 rounded-full" />
          </div>

          {/* Header */}
          {(title || showClose) && (
            <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-100 flex-shrink-0">
              {title && <h2 className="text-base sm:text-lg font-semibold text-slate-900">{title}</h2>}
              {showClose && (
                <button
                  onClick={onClose}
                  className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>
          )}

          {/* Content */}
          <div className="px-4 sm:px-6 py-4 overflow-y-auto flex-1">{children}</div>

          {/* Footer */}
          {footer && (
            <div className="px-4 sm:px-6 py-4 border-t border-slate-100 flex justify-end gap-3 flex-shrink-0">
              {footer}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'info';
  isLoading?: boolean;
}

export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'دڵنیابونەوە',
  cancelText = 'هەڵوەشاندنەوە',
  variant = 'danger',
  isLoading = false,
}: ConfirmModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm">
      <p className="text-slate-600 mb-6 text-sm sm:text-base">{message}</p>
      <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-3">
        <Button variant="secondary" onClick={onClose} disabled={isLoading} className="w-full sm:w-auto">
          {cancelText}
        </Button>
        <Button
          variant={variant === 'danger' ? 'danger' : 'primary'}
          onClick={onConfirm}
          isLoading={isLoading}
          className="w-full sm:w-auto"
        >
          {confirmText}
        </Button>
      </div>
    </Modal>
  );
}
