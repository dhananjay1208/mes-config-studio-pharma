import React, { useState } from 'react';
import { PenLine } from 'lucide-react';

/**
 * Electronic signature step — typed initials + reason. The point is the
 * friction: sign-offs and go-live approvals leave a named, reasoned audit record.
 */
export default function ESignature({ prompt, reasonOptions = null, confirmLabel = 'Sign & confirm', onSign, onCancel }) {
  const [initials, setInitials] = useState('');
  const [reason, setReason] = useState(reasonOptions ? '' : 'n/a');
  const canSign = initials.trim().length >= 2 && reason;

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-300">{prompt}</p>
      <div>
        <label className="mb-1 block text-xs font-semibold text-slate-400">YOUR INITIALS (E-SIGNATURE)</label>
        <input
          className="input mono uppercase"
          maxLength={4}
          value={initials}
          onChange={(e) => setInitials(e.target.value.toUpperCase())}
          placeholder="e.g. DK"
        />
      </div>
      {reasonOptions && (
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-400">REASON CODE</label>
          <select className="input" value={reason} onChange={(e) => setReason(e.target.value)}>
            <option value="">— select reason —</option>
            {reasonOptions.map((r) => (
              <option key={r.id} value={r.id}>{r.label}</option>
            ))}
          </select>
        </div>
      )}
      <div className="flex gap-2 pt-1">
        {onCancel && (
          <button onClick={onCancel} className="btn-ghost flex-1">Cancel</button>
        )}
        <button
          disabled={!canSign}
          onClick={() => onSign({ initials: initials.trim(), reason })}
          className="btn-primary flex-1"
        >
          <PenLine className="h-4 w-4" /> {confirmLabel}
        </button>
      </div>
      <p className="text-[10px] text-slate-500">
        This signature is recorded with timestamp and user ID in the audit trail (21 CFR Part 11 style).
      </p>
    </div>
  );
}
