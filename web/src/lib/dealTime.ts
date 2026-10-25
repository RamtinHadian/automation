import { Deal } from '../types';

/** «14:25» of a moment, in the person's own clock. */
export const hhmmOf = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** The hour and minute an opportunity is forecast to close at: the one chosen, or else the time the opportunity was created at. */
export const dealCloseTime = (d: Pick<Deal, 'expectedCloseTime' | 'createdAt'>) => d.expectedCloseTime || hhmmOf(d.createdAt);
