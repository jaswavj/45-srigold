import React, { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { billingApi } from '../../api/billing/billing-api-service';
import logo from '../../assets/images/logo.png';
import { sriImageUrl } from '../utils/sriImages';
import { downloadElementJpeg } from '../utils/downloadJpeg';
import './FinishedShareCard.css';

type ShareItem = {
  name: string;
  itemSize?: string;
  purity?: number;
  price?: number;
  metalWt?: number;
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
    const wastage = items.reduce((s, item) => s + (Number(item.metalWt) || 0), 0);
    const paid = Number(bill?.paid) || 0;
    const payable = Number(bill?.payable) || finishing + wastage;
    return {
      finishing,
      wastage,
      total: finishing + wastage,
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
    const items = (bill?.items || []).map((item, i) => {
      const size = (item.itemSize || '').trim();
      const pur = Number(item.purity) > 0 ? `  Purity ${item.purity}` : '';
      return `${i + 1}. ${item.name || 'Item'}${size ? ` (${size})` : ''}  Finish ${wt(item.price)}${pur}  Wastage ${wt(item.metalWt, 2)}`;
    });
    const text = [
      `*${shop}*`,
      `Dear ${bill?.customerName || 'Customer'},`,
      'Your job work details:',
      `*Bill #${bill?.billDisplay || billNo}*`,
      `${fmtDate(bill?.date)}${bill?.time ? `  ${fmtTime(bill?.time)}` : ''}`,
      items.length ? `*Items*\n${items.join('\n')}` : '',
      [
        `Finishing wt: ${wt(totals.finishing)} g`,
        `Wastage wt: ${wt(totals.wastage, 2)} g`,
        `*Total wt: ${wt(totals.total)} g*`,
        `Collected: ${wt(totals.paid)} g`,
        totals.due > 0.0005 ? `*Balance: ${wt(totals.due)} g*` : '',
        totals.advance > 0.0005 ? `Advance: ${wt(totals.advance)} g` : '',
      ].filter(Boolean).join('\n'),
      ok ? 'Please find the JPEG attached. Thank you.' : 'Thank you.',
    ].filter(Boolean).join('\n\n');
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, '_blank');
  };

  return (
    <div className="gold-share-back" onClick={onClose}>
      <div className="gold-share-panel" onClick={(e) => e.stopPropagation()}>
        {loading || !bill ? (
          <div className="gold-share-loading">Loading bill…</div>
        ) : (
          <>
            <div className="gold-share-card" ref={cardRef}>
              <div className="gold-share-watermark" aria-hidden="true">
                <img src={logo} alt="" />
              </div>
              <div className="gold-share-fg">
              <div className="gold-share-top">
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
                <div>
                  <span>Bill No</span>
                  <b>{bill.billDisplay || billNo}</b>
                </div>
                <div>
                  <span>Date</span>
                  <b>{fmtDate(bill.date)}{bill.time ? ` · ${fmtTime(bill.time)}` : ''}</b>
                </div>
              </div>
              <div className="gold-share-cust">
                <div>
                  <span>Customer</span>
                  <b>{bill.customerName || '-'}</b>
                </div>
                <div>
                  <span>Phone</span>
                  <b>{bill.customerPhone || '-'}</b>
                </div>
              </div>
              <div className="gold-share-items">
                <div className="gold-share-items-head">
                  <span className="n">#</span>
                  <span className="item">Item</span>
                  <span>Size</span>
                  <span>Finishing wt</span>
                  <span>Purity</span>
                  <span>Wastage wt</span>
                </div>
                {(bill.items || []).map((item, i) => (
                  <div key={`${item.name}-${i}`} className="gold-share-item-row">
                    <div className="n">{i + 1}</div>
                    <div className="item">
                      <div className="gold-share-item-name">{item.name || '-'}</div>
                      {(item.image1 || item.image2) ? (
                        <div className="gold-share-photos">
                          {item.image1 ? <img src={sriImageUrl(item.image1)} alt="" /> : null}
                          {item.image2 ? <img src={sriImageUrl(item.image2)} alt="" /> : null}
                        </div>
                      ) : null}
                    </div>
                    <div className="kv"><span>Size</span><b>{item.itemSize || '—'}</b></div>
                    <div className="kv"><span>Finishing wt</span><b>{wt(item.price)}</b></div>
                    <div className="kv"><span>Purity</span><b>{Number(item.purity) > 0 ? item.purity : '—'}</b></div>
                    <div className="kv"><span>Wastage wt</span><b>{wt(item.metalWt, 2)}</b></div>
                  </div>
                ))}
              </div>
              <div className="gold-share-totals">
                <div><span>Finishing wt</span><b>{wt(totals.finishing)} g</b></div>
                <div><span>Wastage wt</span><b>{wt(totals.wastage, 2)} g</b></div>
                <div className="gold-share-total"><span>Total wt</span><b>{wt(totals.total)} g</b></div>
                <div><span>Collected wt</span><b>{wt(totals.paid)} g</b></div>
                {totals.advance > 0.0005 ? (
                  <div className="ok"><span>Advance</span><b>{wt(totals.advance)} g</b></div>
                ) : (
                  <div className={totals.due > 0.0005 ? 'due' : 'ok'}>
                    <span>Balance</span><b>{wt(totals.due)} g</b>
                  </div>
                )}
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
    </div>
  );
};

export default FinishedShareCard;
