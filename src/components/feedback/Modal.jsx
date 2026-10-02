import React from 'react';
import { X } from 'lucide-react';

export default function Modal({ open, onClose, title, children, wide = false }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className={`panel max-h-[85vh] w-full overflow-y-auto p-5 ${wide ? 'max-w-2xl' : 'max-w-md'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-bold text-white">{title}</h3>
          {onClose && (
            <button onClick={onClose} className="text-slate-500 hover:text-slate-300">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}
