import React, { useState } from 'react';
import { ChevronRight, ChevronDown, Plus, Trash2, ArrowUp, ArrowDown } from 'lucide-react';
import { childrenOf } from '../../engine/selectors.js';

/**
 * Generic hierarchy editor over a flat node list (Sepasoft Production Model
 * pattern). The tree is derived from parentId + seq.
 *
 * props:
 *  nodes            flat [{ id, type, parentId, name, code, seq, props }]
 *  rootId           id of the node to render as root
 *  selectedId       currently selected node id
 *  onSelect(id)
 *  typeMeta         { [type]: { icon, label, color, childTypes: [type] } }
 *  onAddChild(parentId, type)
 *  onDelete(id)     omit per-node by returning false from canDelete
 *  canDelete(node)  -> bool
 *  onMove(id, dir)  dir = -1 | 1, reorder among siblings
 */
export default function TreeView({
  nodes, rootId, selectedId, onSelect, typeMeta, onAddChild, onDelete, canDelete = () => true, onMove,
}) {
  return (
    <div className="space-y-0.5 text-sm">
      <TreeNode
        nodes={nodes} id={rootId} depth={0}
        selectedId={selectedId} onSelect={onSelect} typeMeta={typeMeta}
        onAddChild={onAddChild} onDelete={onDelete} canDelete={canDelete} onMove={onMove}
      />
    </div>
  );
}

function TreeNode({ nodes, id, depth, selectedId, onSelect, typeMeta, onAddChild, onDelete, canDelete, onMove }) {
  const [open, setOpen] = useState(true);
  const node = nodes.find((n) => n.id === id);
  if (!node) return null;

  const kids = childrenOf(nodes, id);
  const meta = typeMeta[node.type] ?? {};
  const Icon = meta.icon;
  const selected = selectedId === id;
  const siblings = childrenOf(nodes, node.parentId);
  const idx = siblings.findIndex((s) => s.id === id);

  return (
    <div>
      <div
        className={`group flex items-center gap-1 rounded-lg px-1.5 py-1 cursor-pointer transition-colors ${
          selected ? 'bg-violet-600/20 text-violet-200' : 'hover:bg-plant-800 text-slate-300'
        }`}
        style={{ paddingLeft: `${depth * 16 + 6}px` }}
        onClick={() => onSelect(id)}
      >
        <button
          className={`shrink-0 text-slate-600 hover:text-slate-300 ${kids.length === 0 ? 'invisible' : ''}`}
          onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        >
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>
        {Icon && <Icon className={`h-3.5 w-3.5 shrink-0 ${meta.color ?? 'text-slate-400'}`} />}
        <span className="truncate">{node.name}</span>
        <span className="mono ml-1 text-[10px] text-slate-600">{node.code}</span>

        <span className="ml-auto hidden shrink-0 items-center gap-0.5 group-hover:flex">
          {onMove && idx > 0 && (
            <IconBtn title="Move up" onClick={(e) => { e.stopPropagation(); onMove(id, -1); }}>
              <ArrowUp className="h-3 w-3" />
            </IconBtn>
          )}
          {onMove && idx >= 0 && idx < siblings.length - 1 && (
            <IconBtn title="Move down" onClick={(e) => { e.stopPropagation(); onMove(id, 1); }}>
              <ArrowDown className="h-3 w-3" />
            </IconBtn>
          )}
          {(meta.childTypes ?? []).map((t) => (
            <IconBtn
              key={t}
              title={`Add ${typeMeta[t]?.label ?? t}`}
              onClick={(e) => { e.stopPropagation(); onAddChild(id, t); }}
            >
              <Plus className="h-3 w-3" />
              <span className="text-[9px] uppercase">{typeMeta[t]?.label ?? t}</span>
            </IconBtn>
          ))}
          {onDelete && canDelete(node) && (
            <IconBtn title="Delete" danger onClick={(e) => { e.stopPropagation(); onDelete(id); }}>
              <Trash2 className="h-3 w-3" />
            </IconBtn>
          )}
        </span>
      </div>

      {open && kids.map((k) => (
        <TreeNode
          key={k.id} nodes={nodes} id={k.id} depth={depth + 1}
          selectedId={selectedId} onSelect={onSelect} typeMeta={typeMeta}
          onAddChild={onAddChild} onDelete={onDelete} canDelete={canDelete} onMove={onMove}
        />
      ))}
    </div>
  );
}

function IconBtn({ title, danger = false, onClick, children }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={`inline-flex items-center gap-0.5 rounded px-1 py-0.5 ${
        danger ? 'text-red-500/70 hover:bg-red-950 hover:text-red-400' : 'text-slate-500 hover:bg-plant-700 hover:text-slate-200'
      }`}
    >
      {children}
    </button>
  );
}
