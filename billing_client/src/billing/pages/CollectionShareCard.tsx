import React, { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { adminApi, adminData } from '../../api/admin/admin-api-service';
import logo from '../../assets/images/logo.png';
import { round2 } from '../utils/goldCalc';
import { downloadElementJpeg } from '../utils/downloadJpeg';
import './FinishedShareCard.css';

export type CollectionBill = {
  billDisplay: string;
  date: string;
  customerName: string;
  phone: string;
  itemName: string;
  itemCount: number;
  totalWt: number;
  paid: number;
  payable: number;
  cash?: number;
  advanceUsed?: number;
};

const wt = (n?: number | null, digits = 3) => {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return digits === 2 ? '0.00' : '0.000';
  return v.toFixed(digits);
};

const fmtDate = (d?: string) => {
  if (!d) return '';
  const dt = new Date(`${String(d).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const waPhone = (raw?: string) => {
  const digits = (raw || '').replace(/\D/g, '');
  if (digits.length < 10) return '';
  return digits.length === 10 ? `91${digits}` : digits;
};

const Step: React.FC<{
  label: string;
  value?: React.ReactNode;
  tone?: 'minus' | 'plus' | 'total';
}> = ({ label, value, tone }) => {
  if (value == null || value === '') return null;
  return (
    <div className={`step${tone ? ` ${tone}` : ''}`}>
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
};

export const CollectionShareCard: React.FC<{
  bills: CollectionBill[];
  shopName?: string;
  shopAddress?: string;
  onClose: () => void;
}> = ({ bills, shopName, shopAddress, onClose }) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [shop, setShop] = useState((shopName || '').trim() || 'Sri Gold');
  const [address, setAddress] = useState(shopAddress || '');

  useEffect(() => {
    if ((shopName || '').trim()) {
      setShop(shopName!.trim());
      setAddress(shopAddress || '');
      return;
    }
    adminApi.company()
      .then((res) => {
        const data = adminData<{ shopName?: string; address?: string }>(res);
        setShop((data?.shopName || 'Sri Gold').trim());
        setAddress(data?.address || '');
      })
      .catch(() => {
        setShop('Sri Gold');
      });
  }, [shopName, shopAddress]);

  const totals = useMemo(() => {
    const total = bills.reduce((s, b) => s + (Number(b.totalWt) || 0), 0);
    let cash = 0;
    let payable = 0;
    let createdAdv = 0;
    let usedAdv = 0;
    let due = 0;
    bills.forEach((bill) => {
      const paidAmt = Number(bill.paid) || 0;
      const pay = Number(bill.payable) || 0;
      const used = Math.max(0, Number(bill.advanceUsed) || 0);
      const collected = bill.cash != null
        ? Math.max(0, Number(bill.cash) || 0)
        : Math.max(0, paidAmt - used);
      cash += collected;
      payable += pay;
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
      usedAdv,
    };
  }, [bills]);

  const names = Array.from(new Set(bills.map((b) => (b.customerName || '').trim()).filter(Boolean)));
  const phones = Array.from(new Set(bills.map((b) => waPhone(b.phone)).filter(Boolean)));
  const customerName = names.length === 1 ? names[0] : '';
  const customerPhone = phones.length === 1
    ? bills.find((b) => waPhone(b.phone) === phones[0])?.phone || ''
    : '';

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

  const sendWhatsApp = async () => {
    const phone = phones.length === 1 ? phones[0] : '';
    const ok = await downloadJpeg(true);
    if (ok) toast.success('JPEG downloaded. Attach it in WhatsApp.');
    if (phone) window.open(`https://wa.me/${phone}`, '_blank');
    else toast.info('Selected bills have different phones. Attach the JPEG in WhatsApp.');
  };

  return (
    <div className="gold-share-back" onClick={onClose}>
      <div className="gold-share-panel" onClick={(e) => e.stopPropagation()}>
        <div className="gold-share-card" ref={cardRef}>
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
              <div><span>No. of Items</span><b>{bills.reduce((n, bill) => n + (Number(bill.itemCount) || 1), 0)}</b></div>
            </div>
          </header>
          {(customerName || customerPhone) ? (
            <div className="gold-share-cust">
              {customerName ? <div><span>Customer</span><b>{customerName}</b></div> : null}
              {customerPhone ? <div><span>Phone</span><b>{customerPhone}</b></div> : null}
            </div>
          ) : null}
          <div className="gold-share-body">
            <div className="gold-coll-lines">
              {bills.map((bill) => (
                <div key={bill.billDisplay} className="gold-coll-line">
                  <div>
                    <strong>{bill.itemName || 'Item'}</strong>
                    <em>{[fmtDate(bill.date), bill.customerName].filter(Boolean).join(' · ')}</em>
                  </div>
                  <b>{bill.totalWt > 0 ? `${bill.totalWt.toFixed(2)} g` : '0.00 g'}</b>
                </div>
              ))}
            </div>
          </div>
          <div className="gold-share-totals gold-share-steps">
            <Step label="Total wt" value={`${totals.total.toFixed(2)} g`} tone="total" />
            <Step label="Collected wt" value={`${wt(totals.paid)} g`} />
            <Step label="Balance wt" value={`${wt(totals.due)} g`} tone={totals.due > 0.0005 ? 'minus' : 'plus'} />
            <Step label="Advance wt" value={`${wt(totals.advance)} g`} tone="plus" />
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
      </div>
    </div>
  );
};

export default CollectionShareCard;
