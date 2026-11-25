import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'react-toastify';
import { adminApi, adminData } from '../../api/admin/admin-api-service';
import { billingApi } from '../../api/billing/billing-api-service';
import logo from '../../assets/images/logo.png';
import { round2 } from '../utils/goldCalc';
import { downloadElementJpeg } from '../utils/downloadJpeg';
import { fmtDate, fmtTime, ShareCardItem, ShareItem, Step, waPhone, wt } from './ShareCardItem';
import './FinishedShareCard.css';

export type CollectionBill = {
  billDisplay: string;
  date: string;
  time?: string;
  customerName: string;
  phone: string;
  itemName: string;
  itemCount: number;
  totalWt: number;
  paid: number;
  payable: number;
  cash?: number;
  advanceUsed?: number;
  kind?: 'bill' | 'advance';
};

const CARD_W = 860;

type PrintShare = {
  billDisplay?: string;
  date?: string;
  time?: string;
  customerName?: string;
  customerPhone?: string;
  companyName?: string;
  companyAddress?: string;
  items?: ShareItem[];
  kind?: 'bill' | 'advance';
  advanceAmt?: number;
};

export const CollectionShareCard: React.FC<{
  bills: CollectionBill[];
  accountDue?: number;
  accountAdv?: number;
  shopName?: string;
  shopAddress?: string;
  onClose: () => void;
}> = ({ bills, accountDue = 0, accountAdv = 0, shopName, shopAddress, onClose }) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState({ scale: 1, height: 0 });
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [prints, setPrints] = useState<PrintShare[]>([]);
  const [shop, setShop] = useState((shopName || '').trim() || 'Sri Gold');
  const [address, setAddress] = useState(shopAddress || '');

  useEffect(() => {
    let live = true;
    setLoading(true);
    Promise.all(bills.map(async (bill) => {
      if (bill.kind === 'advance' || (bill.billDisplay || '').startsWith('ADV:')) {
        return {
          billDisplay: bill.billDisplay,
          date: bill.date,
          customerName: bill.customerName,
          customerPhone: bill.phone,
          kind: 'advance',
          advanceAmt: Number(bill.paid) || 0,
          items: [{ name: bill.itemName || 'Advance' }],
        } as PrintShare;
      }
      try {
        const res: any = await billingApi.printBill(bill.billDisplay);
        if (res?.success && res.data) return res.data as PrintShare;
      } catch {
        /* use picker row */
      }
      return {
        billDisplay: bill.billDisplay,
        date: bill.date,
        customerName: bill.customerName,
        customerPhone: bill.phone,
        items: [{ name: bill.itemName || 'Item' }],
      } as PrintShare;
    }))
      .then(async (rows) => {
        if (!live) return;
        setPrints(rows);
        if ((shopName || '').trim()) {
          setShop(shopName!.trim());
          setAddress(shopAddress || '');
          return;
        }
        const first = rows.find((row) => (row.companyName || '').trim());
        if (first?.companyName) {
          setShop(first.companyName.trim());
          setAddress(first.companyAddress || '');
          return;
        }
        try {
          const res = await adminApi.company();
          if (!live) return;
          const data = adminData<{ shopName?: string; address?: string }>(res);
          setShop((data?.shopName || 'Sri Gold').trim());
          setAddress(data?.address || '');
        } catch {
          if (live) setShop('Sri Gold');
        }
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [bills, shopName, shopAddress]);

  const totals = useMemo(() => {
    const total = bills.reduce((s, b) => s + (Number(b.totalWt) || 0), 0);
    let cash = 0;
    let createdAdv = 0;
    let usedAdv = 0;
    let due = 0;
    bills.forEach((bill) => {
      const paidAmt = Number(bill.paid) || 0;
      const pay = Number(bill.payable) || 0;
      const used = Math.max(0, Number(bill.advanceUsed) || 0);
      if (bill.kind === 'advance') {
        cash += bill.cash != null ? Math.max(0, Number(bill.cash) || 0) : paidAmt;
        createdAdv += paidAmt;
        return;
      }
      const collected = bill.cash != null
        ? Math.max(0, Number(bill.cash) || 0)
        : Math.max(0, paidAmt - used);
      cash += collected;
      createdAdv += Math.max(0, paidAmt - pay);
      usedAdv += used;
      due += Math.max(0, pay - paidAmt);
    });
    const leftover = createdAdv - usedAdv;
    return {
      total: round2(total),
      paid: leftover >= -0.0005 ? cash : cash + usedAdv,
      due: leftover < -0.0005 ? 0 : due,
      advance: leftover > 0.0005 ? leftover : 0,
    };
  }, [bills]);

  const names = Array.from(new Set(bills.map((b) => (b.customerName || '').trim()).filter(Boolean)));
  const phones = Array.from(new Set(bills.map((b) => waPhone(b.phone)).filter(Boolean)));
  const customerName = names.length === 1 ? names[0] : '';
  const customerPhone = phones.length === 1
    ? bills.find((b) => waPhone(b.phone) === phones[0])?.phone || ''
    : '';
  const itemCount = prints
    .filter((bill) => bill.kind !== 'advance')
    .reduce((n, bill) => n + (bill.items?.length || 0), 0)
    || bills.filter((bill) => bill.kind !== 'advance').reduce((n, bill) => n + (Number(bill.itemCount) || 1), 0);

  const downloadJpeg = async (silent = false) => {
    if (!cardRef.current) return false;
    setBusy(true);
    try {
      await downloadElementJpeg(cardRef.current, `SriGold-Collection.jpg`);
      if (!silent) toast.success('JPEG downloaded');
      return true;
    } catch {
      toast.error('Could not create JPEG');
      return false;
    } finally {
      setBusy(false);
    }
  };

  useLayoutEffect(() => {
    if (loading) return;
    const panel = panelRef.current;
    const card = cardRef.current;
    if (!panel || !card) return;
    const apply = () => {
      const scale = Math.min(1, panel.clientWidth / CARD_W);
      setFit({ scale, height: card.scrollHeight * scale });
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(panel);
    ro.observe(card);
    const imgs = Array.from(card.querySelectorAll('img'));
    imgs.forEach((img) => img.addEventListener('load', apply));
    return () => {
      ro.disconnect();
      imgs.forEach((img) => img.removeEventListener('load', apply));
    };
  }, [loading, prints, shop, address]);

  const sendWhatsApp = async () => {
    const phone = phones.length === 1 ? phones[0] : '';
    const ok = await downloadJpeg(true);
    if (ok) toast.success('JPEG downloaded. Attach it in WhatsApp.');
    if (phone) window.open(`https://wa.me/${phone}`, '_blank');
    else toast.info('Selected bills have different phones. Attach the JPEG in WhatsApp.');
  };

  return createPortal(
    <div className="gold-share-back" onClick={onClose}>
      <div className="gold-share-panel gold-share-panel-wide" ref={panelRef} onClick={(e) => e.stopPropagation()}>
        {loading ? (
          <div className="gold-share-loading">Loading bills…</div>
        ) : (
          <>
            <div className="gold-share-scale" style={fit.scale < 1 ? { height: fit.height } : undefined}>
            <div
              className="gold-share-card gold-share-card-wide"
              ref={cardRef}
              style={fit.scale < 1 ? { transform: `scale(${fit.scale})`, transformOrigin: 'top left' } : undefined}
            >
              <header className="gold-share-head">
                <div className="gold-share-brand">
                  <img className="gold-share-mark" src={logo} alt="" />
                  <div>
                    <div className="gold-share-shop">{shop}</div>
                    {(address || '').split(/\r?\n/).filter(Boolean).slice(0, 2).map((line) => (
                      <div key={line} className="gold-share-addr">{line}</div>
                    ))}
                  </div>
                </div>
                <div className="gold-share-title">Collection Statement</div>
                <div className="gold-share-meta">
                  <div><span>Date</span><b>{fmtDate(new Date().toISOString().slice(0, 10))}</b></div>
                  <div><span>No. of Items</span><b>{itemCount}</b></div>
                </div>
              </header>
              {(customerName || customerPhone) ? (
                <div className="gold-share-cust">
                  {customerName ? <div><span>Customer</span><b>{customerName}</b></div> : null}
                  {customerPhone ? <div><span>Phone</span><b>{customerPhone}</b></div> : null}
                </div>
              ) : null}
              <div className="gold-share-items">
                {prints.flatMap((bill, bi) => {
                  const note = prints.length > 1
                    ? [fmtDate(bill.date), bill.time ? fmtTime(bill.time) : ''].filter(Boolean).join(' · ')
                    : undefined;
                  if (bill.kind === 'advance') return [];
                  return (bill.items || []).map((item, i) => (
                    <ShareCardItem
                      key={`${bill.billDisplay || bi}-${item.name}-${i}`}
                      item={item}
                      note={note}
                    />
                  ));
                })}
              </div>
              <div className="gold-share-totals gold-share-steps">
                <div className="gold-share-summary-h">Summary</div>
                <Step label="Total wt" value={`${totals.total.toFixed(2)} g`} tone="total" />
                <Step label="Collected wt" value={`${wt(totals.paid)} g`} />
                <Step label="Balance wt" value={`${wt(totals.due)} g`} tone={totals.due > 0.0005 ? 'minus' : 'plus'} />
                <Step label="Advance wt" value={`${wt(totals.advance)} g`} tone="plus" />
              </div>
              <div className="gold-share-totals gold-share-steps">
                <div className="gold-share-summary-h">Customer details</div>
                <Step label="Current due" value={`${wt(accountDue)} g`} tone={accountDue > 0.0005 ? 'minus' : undefined} />
                <Step label="Current Advance" value={`${wt(accountAdv)} g`} tone="plus" />
              </div>
              <div className="gold-share-thanks">Thank you for choosing {shop}</div>
            </div>
            </div>
            <div className="gold-share-acts">
              <button className="mst-btn" type="button" disabled={busy} onClick={onClose}>Close</button>
              <button className="mst-btn mst-btn-primary" type="button" disabled={busy} onClick={() => void downloadJpeg()}>
                {busy ? 'Preparing…' : 'Download JPEG'}
              </button>
              <button className="mst-btn gold-share-wa" type="button" disabled={busy} onClick={() => void sendWhatsApp()}>
                <i className="fab fa-whatsapp" /> Send WhatsApp
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
};

export default CollectionShareCard;
