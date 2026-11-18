import React, { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { billingApi } from '../../api/billing/billing-api-service';
import logo from '../../assets/images/logo.png';
import { goldAmount, goldRateAmt, goldTotalWt, GoldParts } from '../utils/goldCalc';
import { sriImageUrl } from '../utils/sriImages';
import { downloadElementJpeg } from '../utils/downloadJpeg';
import './FinishedShareCard.css';

type ShareItem = {
  name: string;
  itemSize?: string;
  purity?: number;
  wastagePer?: number;
  price?: number;
  metalWt?: number;
  stoneWt?: number;
  stoneWastage?: number;
  stoneCost?: number;
  gramRate?: number;
  chargeType?: string;
  chargeAmt?: number;
  image1?: string;
  image2?: string;
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
  balance?: number;
  items?: ShareItem[];
};

const wt = (n?: number | null, digits = 3) => {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return digits === 2 ? '0.00' : '0.000';
  return v.toFixed(digits);
};

const fmtDate = (d?: string) => {
  if (!d) return '';
  const dt = new Date(`${d}T00:00:00`);
  if (Number.isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const fmtTime = (t?: string) => {
  const parts = String(t || '').split(':');
  if (parts.length < 2) return '';
  let h = Number(parts[0]);
  if (!Number.isFinite(h)) return '';
  const ampm = h >= 12 ? 'pm' : 'am';
  h = h % 12 || 12;
  return `${h}:${parts[1]} ${ampm}`;
};

const rupees = (n?: number | null) => `₹${(Number(n) || 0).toFixed(2)}`;
const has = (n?: number | null) => Number(n) > 0;

const Kv: React.FC<{ label: string; value?: React.ReactNode; wide?: boolean }> = ({ label, value, wide }) => {
  if (value == null || value === '') return null;
  return (
    <div className={wide ? 'kv wide' : 'kv'}>
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
};
const partsOf = (item: ShareItem): GoldParts => ({
  finishing: item.price,
  wastage: item.metalWt,
  stoneWt: item.stoneWt,
  stoneWastage: item.stoneWastage,
  stoneCost: item.stoneCost,
  gramRate: item.gramRate,
  chargeAmt: item.chargeAmt,
});

const waPhone = (raw?: string) => {
  const digits = (raw || '').replace(/\D/g, '');
  if (digits.length < 10) return '';
  return digits.length === 10 ? `91${digits}` : digits;
};

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
      due: Math.max(0, payable - paid),
      advance: Math.max(0, paid - payable),
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
                  <div><span>Bill No</span><b>{bill.billDisplay || billNo}</b></div>
                  <div><span>Date</span><b>{fmtDate(bill.date)}{bill.time ? ` · ${fmtTime(bill.time)}` : ''}</b></div>
                </div>
              </header>

              {(bill.customerName || bill.customerPhone) ? (
                <div className="gold-share-cust">
                  {bill.customerName ? <div><span>Customer</span><b>{bill.customerName}</b></div> : null}
                  {bill.customerPhone ? <div><span>Phone</span><b>{bill.customerPhone}</b></div> : null}
                </div>
              ) : null}

              {(bill.items || []).map((item, i) => {
                const lineAmt = goldAmount(partsOf(item));
                const lineWt = goldTotalWt(partsOf(item));
                const charge = (item.chargeType || '').trim();
                return (
                <div key={`${item.name}-${i}`} className="gold-share-body">
                  {(item.image1 || item.image2) ? (
                    <div className="gold-share-photos">
                      {item.image1 ? (
                        <div className="gold-share-photo">
                          <img src={sriImageUrl(item.image1)} alt="" />
                          <em>Image 1</em>
                        </div>
                      ) : null}
                      {item.image2 ? (
                        <div className="gold-share-photo">
                          <img src={sriImageUrl(item.image2)} alt="" />
                          <em>Image 2</em>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  {item.name ? <div className="gold-share-item-name">{item.name}</div> : null}
                  <div className="gold-share-kvs">
                    <Kv label="Size" value={(item.itemSize || '').trim()} />
                    <Kv label="Finishing wt" value={has(item.price) ? wt(item.price) : null} />
                    <Kv label="Purity" value={has(item.purity) ? item.purity : null} />
                    <Kv label="Percentage" value={has(item.wastagePer) ? item.wastagePer : null} />
                    <Kv label="Wastage wt" value={has(item.metalWt) ? wt(item.metalWt, 2) : null} />
                    <Kv label="Stone wt" value={has(item.stoneWt) ? wt(item.stoneWt) : null} />
                    <Kv label="Stone wastage" value={has(item.stoneWastage) ? wt(item.stoneWastage) : null} />
                    <Kv label="Total wt" value={lineWt > 0 ? lineWt.toFixed(3) : null} />
                    <Kv label="Stone cost" value={has(item.stoneCost) ? rupees(item.stoneCost) : null} />
                    <Kv label="1 gram rate" value={has(item.gramRate) ? rupees(item.gramRate) : null} />
                    <Kv label="Gold amount" value={has(item.gramRate) ? rupees(goldRateAmt(partsOf(item))) : null} />
                    <Kv label={charge || 'Type'} value={has(item.chargeAmt) ? rupees(item.chargeAmt) : null} />
                    <Kv label="Amount" value={lineAmt > 0 ? rupees(lineAmt) : null} wide />
                  </div>
                </div>
                );
              })}

              <div className="gold-share-totals">
                {has(totals.finishing) ? <div><span>Finishing wt</span><b>{wt(totals.finishing)} g</b></div> : null}
                {has(totals.wastage) ? <div><span>Wastage wt</span><b>{wt(totals.wastage, 2)} g</b></div> : null}
                {has(totals.stone) ? <div><span>Stone wt</span><b>{wt(totals.stone)} g</b></div> : null}
                {has(totals.stoneWastage) ? <div><span>Stone wastage</span><b>{wt(totals.stoneWastage)} g</b></div> : null}
                {totals.total > 0 ? <div className="gold-share-total"><span>Total wt</span><b>{totals.total.toFixed(3)} g</b></div> : null}
                {totals.amount > 0 ? <div className="gold-share-total gold-share-money"><span>Total amount</span><b>{rupees(totals.amount)}</b></div> : null}
                {has(totals.paid) ? <div><span>Collected wt</span><b>{wt(totals.paid)} g</b></div> : null}
                {totals.advance > 0.0005 ? (
                  <div className="ok"><span>Advance</span><b>{wt(totals.advance)} g</b></div>
                ) : totals.due > 0.0005 ? (
                  <div className="due"><span>Balance</span><b>{wt(totals.due)} g</b></div>
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
