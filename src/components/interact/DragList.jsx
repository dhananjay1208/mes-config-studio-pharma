import React from 'react';
import {
  DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors,
} from '@dnd-kit/core';
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove, sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';

function SortableRow({ id, disabled, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-2 ${isDragging ? 'z-10 opacity-80' : ''}`}
    >
      {!disabled && (
        <span {...attributes} {...listeners} className="cursor-grab touch-none text-slate-500 hover:text-slate-300 active:cursor-grabbing">
          <GripVertical className="h-4 w-4" />
        </span>
      )}
      <div className="flex-1">{children}</div>
    </div>
  );
}

/**
 * Sortable vertical list (dnd-kit wrapper). items = array of ids;
 * renderItem(id, index) renders each row; onReorder(newIds) after a drop.
 */
export default function DragList({ items, renderItem, onReorder, disabledIds = [] }) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.indexOf(active.id);
    const newIndex = items.indexOf(over.id);
    onReorder(arrayMove(items, oldIndex, newIndex));
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={items} strategy={verticalListSortingStrategy}>
        <div className="space-y-1.5">
          {items.map((id, i) => (
            <SortableRow key={id} id={id} disabled={disabledIds.includes(id)}>
              {renderItem(id, i)}
            </SortableRow>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
