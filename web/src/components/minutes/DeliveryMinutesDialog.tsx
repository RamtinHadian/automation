import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { useAppContext } from '../../context/AppContext';
import { getMinutesConfig } from '../../lib/minutesConfig';
import { deliveryMinutesFromDeal } from '../../lib/minutesFromDeal';
import { Customer, Deal, Minutes } from '../../types';
import { MinutesEditor } from './MinutesView';

/**
 * «صورتجلسه تحویل» next to a proforma: the minutes of delivering the goods of that proforma, filled in from it (the lines become the goods table,
 * the issuing company delivers, the customer receives). When some goods carry a warranty, saving offers the warranty certificates.
 */
export const DeliveryMinutesDialog: React.FC<{ deal: Deal; customer?: Customer; issuerName: string; onClose: () => void }> = ({ deal, customer, issuerName, onClose }) => {
  const { settings, currentUser, showToast } = useAppContext();
  const cfg = useMemo(() => getMinutesConfig(settings), [settings]);
  const [minutes, setMinutes] = useState<Minutes | null>(null);
  const [all, setAll] = useState<Minutes[]>([]);
  useEffect(() => {
    let alive = true;
    (async () => {
      const [list, cat] = await Promise.all([api.minutesList().catch(() => ({ minutes: [] as Minutes[] })), api.crmProducts().catch(() => ({ products: [] as { code: string; warrantyMonths?: number }[] }))]);
      if (!alive) return;
      setAll(list.minutes);
      const m = deliveryMinutesFromDeal(deal, customer, cfg, list.minutes, { id: currentUser.id, name: currentUser.fullName }, issuerName, cat.products);
      if (!m.goods || m.goods.length === 0) {
        showToast('این پیش‌فاکتور کالایی ندارد.');
        onClose();
        return;
      }
      setMinutes(m);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!minutes) return null;
  return <MinutesEditor initial={minutes} all={all} cfg={cfg} onClose={onClose} onSaved={onClose} />;
};
