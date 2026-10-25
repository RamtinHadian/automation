import type React from 'react';

/** Put the id of the dragged card into the drag itself, so the drop reads exactly the card that was picked up in this gesture. */
export const dragStartCard = (e: React.DragEvent, id: string) => {
  e.dataTransfer.effectAllowed = 'move';
  try {
    e.dataTransfer.setData('text/plain', 'card:' + id);
  } catch {
    /* some browsers refuse; the state is the fallback */
  }
};

/** The card of this drop: the id carried by the drag, else the one the page remembered. */
export const droppedCard = (e: React.DragEvent, remembered: string | null) => {
  const v = e.dataTransfer.getData('text/plain');
  return v.startsWith('card:') ? v.slice(5) : remembered;
};

let last = { id: '', at: 0 };
/** Two different cards cannot be dropped within 0.4 s of each other (a drag takes longer than that): the second one is a stray event, not a move. */
export const moveAllowed = (id: string) => {
  const now = Date.now();
  if (last.id && last.id !== id && now - last.at < 400) return false;
  last = { id, at: now };
  return true;
};
