import React, { useState } from 'react';
import { BookOpenText, Search } from 'lucide-react';
import { GLOSSARY } from '../data/glossary.js';

export default function Glossary() {
  const [q, setQ] = useState('');
  const items = GLOSSARY.filter((g) =>
    !q || g.term.toLowerCase().includes(q.toLowerCase()) || g.def.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="max-w-3xl space-y-4">
      <div className="panel flex items-center gap-4 p-5">
        <BookOpenText className="h-7 w-7 text-violet-400" />
        <div className="flex-1">
          <h1 className="text-lg font-bold text-white">Glossary</h1>
          <p className="text-xs text-slate-500">The automotive & MES vocabulary this platform speaks.</p>
        </div>
        <div className="relative w-56">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-600" />
          <input className="input !pl-8" placeholder="Search terms…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>
      <div className="space-y-2">
        {items.map((g) => (
          <div key={g.term} className="panel px-4 py-3">
            <div className="text-sm font-bold text-violet-300">{g.term}</div>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">{g.def}</p>
          </div>
        ))}
        {items.length === 0 && <p className="text-center text-xs text-slate-600">No matching terms.</p>}
      </div>
    </div>
  );
}
