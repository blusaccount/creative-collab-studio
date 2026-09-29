export interface ToastItem {
  id: string;
  message: string;
  tone: 'info' | 'success' | 'error';
}

interface ToastStackProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}

export function ToastStack({ toasts, onDismiss }: ToastStackProps) {
  if (toasts.length === 0) return null;
  return (
    <div className="toast-stack" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <button
          key={toast.id}
          className={`toast ${toast.tone}`}
          onClick={() => onDismiss(toast.id)}
          title="Dismiss"
        >
          {toast.message}
        </button>
      ))}
    </div>
  );
}
