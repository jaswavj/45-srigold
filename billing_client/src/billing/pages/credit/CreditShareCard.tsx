import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'react-toastify';
import { adminApi, adminData } from '../../../api/admin/admin-api-service';
import logo from '../../../assets/images/logo.png';
import { downloadElementJpeg } from '../../utils/downloadJpeg';
import { fmtDate, Step, waPhone, wt } from '../ShareCardItem';
import '../FinishedShareCard.css';

export type CreditShare = {
  kind: 'COLLECTION' | 'ADVANCE';
  customerName: string;
  phone: string;
  date?: string;
  previousDue: number;
  collectedDue: number;
  balanceDue: number;
  previousAdvance: number;
  collectedAdvance: number;
  balanceAdvance: number;
};

const g = (n?: number | null) => `${wt(n)} g`;
const shown = (n?: number | null) => Number(n) > 0.0005;

export const CreditShareCard: React.FC<{
  share: CreditShare;
  onClose: () => void;
}> = ({ share, onClose }) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [shop, setShop] = useState('Sri Gold');
  const [address, setAddress] = useState('');

  useEffect(() => {
    let live = true;
    adminApi.company()
      .then((res) => {
        if (!live) return;
        const data = adminData<{ shopName?: string; address?: string }>(res);
        setShop((data?.shopName || 'Sri Gold').trim());
        setAddress(data?.address || '');
      })
      .catch(() => {
        if (live) setShop('Sri Gold');
      });
    return () => { live = false; };
  }, []);

  const dueBlock = share.kind === 'COLLECTION'
    || shown(share.previousDue) || shown(share.collectedDue) || shown(share.balanceDue);
  const advBlock = share.kind === 'ADVANCE'
    || shown(share.previousAdvance) || shown(share.collectedAdvance) || shown(share.balanceAdvance);

  const downloadJpeg = async (silent = false) => {
    if (!cardRef.current) return false;
    setBusy(true);
    try {
      const name = share.kind === 'ADVANCE' ? 'SriGold-Advance.jpg' : 'SriGold-Collection.jpg';
      await downloadElementJpeg(cardRef.current, name);
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
    const phone = waPhone(share.phone);
    const ok = await downloadJpeg(true);
    if (ok) toast.success('JPEG downloaded. Attach it in WhatsApp.');
    if (phone) window.open(`https://wa.me/${phone}`, '_blank');
    else toast.error('Customer phone is missing');
  };

  return createPortal(
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
            <div className="gold-share-title">
              {share.kind === 'ADVANCE' ? 'Advance Receipt' : 'Collection Receipt'}
            </div>
            <div className="gold-share-meta">
              <div><span>Date</span><b>{fmtDate(share.date || new Date().toISOString().slice(0, 10))}</b></div>
            </div>
          </header>
          <div className="gold-share-cust">
            {share.customerName ? <div><span>Customer</span><b>{share.customerName}</b></div> : null}
            {share.phone ? <div><span>Phone</span><b>{share.phone}</b></div> : null}
          </div>
          <div className="gold-share-totals gold-share-steps">
            {dueBlock ? (
              <>
                <div className="gold-share-summary-h">Due</div>
                <Step label="Previous due" value={g(share.previousDue)} tone="minus" />
                <Step label="Collected due" value={g(share.collectedDue)} />
                <Step
                  label="Balance due"
                  value={g(share.balanceDue)}
                  tone={shown(share.balanceDue) ? 'minus' : 'plus'}
                />
              </>
            ) : null}
            {advBlock ? (
              <>
                <div className="gold-share-summary-h">Advance</div>
                <Step label="Previous advance" value={g(share.previousAdvance)} tone="plus" />
                <Step label="Collected advance" value={g(share.collectedAdvance)} />
                <Step label="Balance advance" value={g(share.balanceAdvance)} tone="plus" />
              </>
            ) : null}
          </div>
          <div className="gold-share-thanks">Thank you for choosing {shop}</div>
        </div>
        <div className="gold-share-acts gold-share-acts-3">
          <button className="mst-btn" type="button" disabled={busy} onClick={onClose}>Close</button>
          <button className="mst-btn mst-btn-primary" type="button" disabled={busy} onClick={() => void downloadJpeg()}>
            {busy ? 'Preparing…' : 'Download JPEG'}
          </button>
          <button className="mst-btn gold-share-wa" type="button" disabled={busy} onClick={() => void sendWhatsApp()}>
            <i className="fab fa-whatsapp" /> Send WhatsApp
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default CreditShareCard;
