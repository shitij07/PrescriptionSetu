import React from 'react';
import { AlertCircle, AlertTriangle, CheckCircle, Info } from 'lucide-react';

interface AlertBannerProps {
  type: 'error' | 'warning' | 'info' | 'success';
  title?: string;
  message: string;
  onClose?: () => void;
}

export function AlertBanner({ type, title, message, onClose }: AlertBannerProps) {
  const styles = {
    error: 'bg-red-950/40 border-red-800 text-red-200',
    warning: 'bg-amber-950/40 border-amber-800 text-amber-200',
    info: 'bg-blue-950/40 border-blue-800 text-blue-200',
    success: 'bg-emerald-950/40 border-emerald-800 text-emerald-200',
  };

  const icons = {
    error: <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />,
    warning: <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />,
    info: <Info className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />,
    success: <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />,
  };

  return (
    <div className={`p-4 rounded-lg border flex items-start space-x-3 text-sm ${styles[type]}`}>
      {icons[type]}
      <div className="flex-1">
        {title && <h4 className="font-semibold mb-1">{title}</h4>}
        <p>{message}</p>
      </div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="text-slate-400 hover:text-slate-200 text-xs px-2 py-1"
        >
          Dismiss
        </button>
      )}
    </div>
  );
}
