import React, { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { billingApi } from '../../api/billing/billing-api-service';
import logo from '../../assets/images/logo.png';
import { goldAmount, goldRateAmt, goldTotalWt } from '../utils/goldCalc';
import { downloadElementJpeg } from '../utils/downloadJpeg';
import {
  fmtDate,
  fmtTime,
  has,
  partsOf,
  ShareCardItem,
  ShareItem,
  Step,
  waPhone,
  wt,
} from './ShareCardItem';
import './FinishedShareCard.css';

type OldDue = {
  itemName?: string;
  balance?: number;
};

type ShareBill = {
  billDisplay?: string;
  date?: string;
  time?: string;
  customerName?: string;
  customerPhone?: string;
  companyName?: string;
  companyAddress?: string;
  payable?: number;
  paid?: number;
  cashPaid?: number;
  bankPaid?: number;
  balance?: number;
  items?: ShareItem[];
  oldDues?: OldDue[];
};

const rupees = (n?: number | null) => `₹${(Number(n) || 0).toFixed(2)}`;

export const FinishedShareCard: React.FC<{
  billNo: string;
  onClose: () => void;
}> = ({ billNo, onClose }) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const [bill, setBill] = useState<ShareBill | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    setLoading(true);
    billingApi.printBill(billNo)
      .then((res: any) => {
        if (!live) return;
        if (!res?.success || !res.data) throw new Error(res?.data?.error || 'Bill not found');
        setBill(res.data);
      })
      .catch((err: any) => {
        toast.error(err?.response?.data?.data?.error || err?.message || 'Could not load bill');
        onClose();
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [billNo]);

  const totals = useMemo(() => {
    const items = bill?.items || [];
    const finishing = items.reduce((s, item) => s + (Number(item.price) || 0), 0);
    const wastageSum = items.reduce((s, item) => s + (Number(item.metalWt) || 0), 0);
    const stone = items.reduce((s, item) => s + (Number(item.stoneWt) || 0), 0);
    const stoneWastage = items.reduce((s, item) => s + (Number(item.stoneWastage) || 0), 0);
    const stoneCost = items.reduce((s, item) => s + (Number(item.stoneCost) || 0), 0);
    const rateAmt = items.reduce((s, item) => s + goldRateAmt(partsOf(item)), 0);
    const typeCost = items.reduce((s, item) => s + (Number(item.chargeAmt) || 0), 0);
    const amount = items.reduce((s, item) => s + goldAmount(partsOf(item)), 0);
    const total = items.reduce((s, item) => s + goldTotalWt(partsOf(item)), 0);
    const paid = Number(bill?.paid) || 0;
    const payable = Number(bill?.payable) || total;
    const due = Math.max(0, payable - paid);
    const cash = (Number(bill?.cashPaid) || 0) + (Number(bill?.bankPaid) || 0);
    const usedAdv = Math.max(0, paid - cash);
    const oldDues = (bill?.oldDues || []).filter((row) => Number(row.balance) > 0.0005);
    const oldDue = oldDues.reduce((s, row) => s + (Number(row.balance) || 0), 0);
    return {
      finishing,
      wastage: wastageSum,
      stone,
      stoneWastage,
      total,
      stoneCost,
      rateAmt,
      typeCost,
      amount,
      paid,
      due,
      usedAdv,
      advance: Math.max(0, paid - payable),
      oldDues,
      oldDue,
      finalBalance: due + oldDue,
    };
  }, [bill]);

  const fileName = `SriGold-${bill?.billDisplay || billNo}.jpg`;
  const shop = (bill?.companyName || 'Sri Gold').trim();

  const downloadJpeg = async (silent = false) => {
    if (!cardRef.current) return false;
    setBusy(true);
    try {
      await downloadElementJpeg(cardRef.current, fileName);
      if (!silent) toast.success('JPEG downloaded');
      return true;
    } catch {
      toast.error('Could not create JPEG');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const sendWhatsApp = async () => {
    const phone = waPhone(bill?.customerPhone);
    if (!phone) {
      toast.error('Customer phone is missing');
      return;
    }
    const ok = await downloadJpeg(true);
    if (ok) toast.success('JPEG downloaded. Attach it in WhatsApp.');
    window.open(`https://wa.me/${phone}`, '_blank');
  };

  return (
    <div className="gold-share-back" onClick={onClose}>
      <div className="gold-share-panel" onClick={(e) => e.stopPropagation()}>
        {loading || !bill ? (
          <div className="gold-share-loading">Loading bill…</div>
        ) : (
          <>
            <div className="gold-share-card" ref={cardRef}>
              <header className="gold-share-head">
                <div className="gold-share-brand">
                  <img className="gold-share-mark" src={logo} alt="" />
                  <div>
                    <div className="gold-share-shop">{shop}</div>
                    {(bill.companyAddress || '').split(/\r?\n/).filter(Boolean).slice(0, 2).map((line) => (
                      <div key={line} className="gold-share-addr">{line}</div>
                    ))}
                  </div>
                </div>
                <div className="gold-share-title">Job Work Statement</div>
                <div className="gold-share-meta">
                  <div><span>Date</span><b>{fmtDate(bill.date)}{bill.time ? ` · ${fmtTime(bill.time)}` : ''}</b></div>
                </div>
              </header>

              {(bill.customerName || bill.customerPhone) ? (
                <div className="gold-share-cust">
                  {bill.customerName ? <div><span>Customer</span><b>{bill.customerName}</b></div> : null}
                  {bill.customerPhone ? <div><span>Phone</span><b>{bill.customerPhone}</b></div> : null}
                </div>
              ) : null}

              {(bill.items || []).map((item, i) => (
                <ShareCardItem key={`${item.name}-${i}`} item={item} />
              ))}

              <div className="gold-share-totals gold-share-steps">
                <Step label="Total wt" value={totals.total > 0 ? `${totals.total.toFixed(2)} g` : null} tone="total" />
                <Step label="Total amount" value={totals.amount > 0 ? rupees(totals.amount) : null} tone="total" />
                <Step
                  label={totals.usedAdv > 0.0005 ? 'Collected wt (by advance)' : 'Collected wt'}
                  value={has(totals.paid) ? `${wt(totals.paid)} g` : `${wt(0)} g`}
                />
                {totals.advance > 0.0005 ? (
                  <Step label="Advance wt" value={`${wt(totals.advance)} g`} tone="plus" />
                ) : (
                  <Step label="Balance wt" value={`${wt(totals.due)} g`} tone={totals.due > 0.0005 ? 'minus' : 'plus'} />
                )}
                {totals.oldDues.map((row, i) => (
                  <Step
                    key={`${row.itemName || 'old'}-${i}`}
                    label={row.itemName || 'Old bill'}
                    value={`${wt(row.balance)} g`}
                    tone="minus"
                  />
                ))}
                {totals.oldDue > 0.0005 ? (
                  <Step label="Final balance" value={`${wt(totals.finalBalance)} g`} tone="total" />
                ) : null}
              </div>
              <div className="gold-share-thanks">Thank you for choosing {shop}</div>
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
    </div>
  );
};

export default FinishedShareCard;
