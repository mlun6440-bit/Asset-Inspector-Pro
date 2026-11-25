import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { CheckCircle2, AlertTriangle, Info, XCircle, X } from 'lucide-react';

export type ToastType = 'info' | 'success' | 'warning' | 'error';

interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
}

interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

interface PromptOptions {
  title: string;
  message?: string;
  placeholder?: string;
  initialValue?: string;
  confirmLabel?: string;
  validate?: (value: string) => string | null;
}

interface NotificationContextValue {
  notify: (message: string, type?: ToastType) => void;
  confirmAction: (options: ConfirmOptions | string) => Promise<boolean>;
  promptInput: (options: PromptOptions) => Promise<string | null>;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

export function useNotify(): NotificationContextValue {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    // Graceful fallback if ever rendered outside provider
    return {
      notify: (msg, type) => console.log(`[Notify:${type || 'info'}]`, msg),
      confirmAction: async () => false,
      promptInput: async () => null,
    };
  }
  return ctx;
}

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirmState, setConfirmState] = useState<{
    options: ConfirmOptions;
    resolve: (value: boolean) => void;
  } | null>(null);
  const [promptState, setPromptState] = useState<{
    options: PromptOptions;
    value: string;
    error: string | null;
    resolve: (value: string | null) => void;
  } | null>(null);

  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    return () => {
      timersRef.current.forEach((timer) => clearTimeout(timer));
      timersRef.current.clear();
    };
  }, []);

  const dismissToast = useCallback((id: string) => {
    const existing = timersRef.current.get(id);
    if (existing) {
      clearTimeout(existing);
      timersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const notify = useCallback((message: string, type: ToastType = 'info') => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev.slice(-4), { id, message, type }]);
    const duration = type === 'error' ? 6000 : 4200;
    const timer = setTimeout(() => {
      dismissToast(id);
    }, duration);
    timersRef.current.set(id, timer);
  }, [dismissToast]);

  const confirmAction = useCallback((optionsOrMsg: ConfirmOptions | string): Promise<boolean> => {
    const options: ConfirmOptions =
      typeof optionsOrMsg === 'string' ? { message: optionsOrMsg } : optionsOrMsg;
    return new Promise<boolean>((resolve) => {
      setConfirmState({ options, resolve });
    });
  }, []);

  const promptInput = useCallback((options: PromptOptions): Promise<string | null> => {
    return new Promise<string | null>((resolve) => {
      setPromptState({
        options,
        value: options.initialValue || '',
        error: null,
        resolve,
      });
    });
  }, []);

  const closeConfirm = (result: boolean) => {
    if (confirmState) {
      confirmState.resolve(result);
      setConfirmState(null);
    }
  };

  const submitPrompt = () => {
    if (!promptState) return;
    const trimmed = promptState.value.trim();
    if (promptState.options.validate) {
      const validationError = promptState.options.validate(trimmed);
      if (validationError) {
        setPromptState((prev) => (prev ? { ...prev, error: validationError } : null));
        return;
      }
    }
    promptState.resolve(trimmed || null);
    setPromptState(null);
  };

  const cancelPrompt = () => {
    if (promptState) {
      promptState.resolve(null);
      setPromptState(null);
    }
  };

  useEffect(() => {
    if (!confirmState && !promptState) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (confirmState) closeConfirm(false);
        if (promptState) cancelPrompt();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [confirmState, promptState]);

  const toastStyles: Record<ToastType, { bg: string; icon: React.ReactNode }> = {
    success: {
      bg: 'bg-emerald-950/95 border-emerald-500/40 text-emerald-100',
      icon: <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />,
    },
    error: {
      bg: 'bg-rose-950/95 border-rose-500/40 text-rose-100',
      icon: <XCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />,
    },
    warning: {
      bg: 'bg-amber-950/95 border-amber-500/40 text-amber-100',
      icon: <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />,
    },
    info: {
      bg: 'bg-slate-900/95 border-indigo-500/40 text-slate-100',
      icon: <Info className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />,
    },
  };

  return (
    <NotificationContext.Provider value={{ notify, confirmAction, promptInput }}>
      {children}

      {/* Non-blocking Toast Stack */}
      {toasts.length > 0 && (
        <div
          aria-live="polite"
          className="fixed top-4 right-4 z-[100] flex flex-col gap-2 max-w-sm w-[calc(100vw-2rem)] pointer-events-none"
        >
          {toasts.map((toast) => {
            const style = toastStyles[toast.type];
            return (
              <div
                key={toast.id}
                role="status"
                className={`pointer-events-auto flex items-start gap-2.5 px-3.5 py-3 rounded-xl border shadow-xl backdrop-blur-md text-xs font-medium transition-all ${style.bg}`}
              >
                {style.icon}
                <span className="flex-1 leading-relaxed">{toast.message}</span>
                <button
                  type="button"
                  onClick={() => dismissToast(toast.id)}
                  aria-label="Dismiss notification"
                  className="text-white/60 hover:text-white transition cursor-pointer shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Accessible In-App Confirmation Dialog */}
      {confirmState && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={confirmState.options.title || 'Confirm Action'}
          className="fixed inset-0 z-[110] bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => closeConfirm(false)}
        >
          <div
            className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                  confirmState.options.destructive
                    ? 'bg-rose-100 text-rose-600'
                    : 'bg-indigo-100 text-indigo-600'
                }`}
              >
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {confirmState.options.title || 'Confirm Action'}
                </h3>
                <p className="text-sm text-slate-600 mt-1 leading-relaxed">
                  {confirmState.options.message}
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => closeConfirm(false)}
                className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm font-semibold transition cursor-pointer"
              >
                {confirmState.options.cancelLabel || 'Cancel'}
              </button>
              <button
                type="button"
                autoFocus
                onClick={() => closeConfirm(true)}
                className={`px-4 py-2 rounded-xl text-white text-sm font-semibold transition cursor-pointer ${
                  confirmState.options.destructive
                    ? 'bg-rose-600 hover:bg-rose-700'
                    : 'bg-indigo-600 hover:bg-indigo-700'
                }`}
              >
                {confirmState.options.confirmLabel || 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Accessible In-App Input Prompt Dialog */}
      {promptState && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={promptState.options.title}
          className="fixed inset-0 z-[110] bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={cancelPrompt}
        >
          <div
            className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h3 className="text-base font-bold text-slate-900">{promptState.options.title}</h3>
              {promptState.options.message && (
                <p className="text-sm text-slate-600 mt-1">{promptState.options.message}</p>
              )}
            </div>
            <div>
              <input
                type="text"
                autoFocus
                value={promptState.value}
                onChange={(e) =>
                  setPromptState((prev) =>
                    prev ? { ...prev, value: e.target.value, error: null } : null
                  )
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitPrompt();
                }}
                placeholder={promptState.options.placeholder || ''}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              />
              {promptState.error && (
                <p className="text-xs text-rose-600 font-medium mt-1.5">{promptState.error}</p>
              )}
            </div>
            <div className="flex justify-end gap-2.5 pt-1">
              <button
                type="button"
                onClick={cancelPrompt}
                className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm font-semibold transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitPrompt}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition cursor-pointer"
              >
                {promptState.options.confirmLabel || 'Add'}
              </button>
            </div>
          </div>
        </div>
      )}
    </NotificationContext.Provider>
  );
};
