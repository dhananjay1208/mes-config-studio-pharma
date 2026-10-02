import React from 'react';
import { Construction } from 'lucide-react';

/** Placeholder rendered by modules whose build phase hasn't landed yet. */
export default function ModuleStub({ title, tagline }) {
  return (
    <div className="panel p-10 text-center">
      <Construction className="mx-auto mb-4 h-10 w-10 text-slate-600" />
      <h2 className="text-lg font-bold text-white">{title}</h2>
      <p className="mt-1 text-sm text-slate-400">{tagline}</p>
      <p className="mt-6 text-xs text-slate-500">
        This configuration module is being installed. It arrives in an upcoming build phase.
      </p>
    </div>
  );
}
