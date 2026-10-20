import { useEffect, useState } from 'react';
import { api } from './api';

let areaPromise: Promise<string> | null = null;
let areaValue = '';

/** The area code of the company's phone line («031»), chosen in the console; shared by every screen. */
export const loadVoipArea = (): Promise<string> => {
  if (!areaPromise) {
    areaPromise = api
      .voipStatus()
      .then((s) => {
        areaValue = s.areaCode || '';
        return areaValue;
      })
      .catch(() => {
        areaPromise = null;
        return '';
      });
  }
  return areaPromise;
};

export const resetVoipArea = () => {
  areaPromise = null;
};

export const useVoipArea = (): string => {
  const [code, setCode] = useState(areaValue);
  useEffect(() => {
    let alive = true;
    loadVoipArea().then((c) => alive && setCode(c));
    return () => {
      alive = false;
    };
  }, []);
  return code;
};

/** Local landline numbers (7–8 digits, no leading 0) get the area code in front; everything else stays as it is. */
export const fullPhone = (number: string, area: string): string => {
  const d = (number || '').replace(/\D/g, '');
  if (!area || !d || /\p{L}/u.test(number)) return number;
  return (d.length === 7 || d.length === 8) && d[0] !== '0' ? area + d : number;
};
