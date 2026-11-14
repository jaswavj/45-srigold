import React, { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { billingApi } from '../../../api/billing/billing-api-service';
import { sriImageUrl } from '../../utils/sriImages';
import { n2 } from './reportHelpers';
import './BillDetailModal.css';

type Line = {
  name: string;
  price: number;
  total: number;
  image1?: string;
  image2?: string;
};
type Pay = { date: string; mode: string; paid: number; balance: number };
type Bill = {
  billDisplay: string;
  customerName?: string;
  customerPhone?: string;
  date: string;
  time: string;
  payable: number;
  paid: number;
  balance: number;
  cashPaid?: number;
  bankPaid?: number;
  items: Line[];
  payments: Pay[];
};

const money = (n?: number | null) => `₹${n2(n || 0)}`;

const Photo: React.FC<{ fileName?: string; onOpen?: () => void }> = ({ fileName, onOpen }) => {
  if (fileName) {
    return (
      <button type="button" className="gbd-photo-btn" onClick={onOpen} title="View photo">
        <img className="gbd-photo" src={sriImageUrl(fileName)} alt="" />
      </button>
    );
  }
  return <span className="gbd-photo gbd-photo-missing">No photo</span>;
};

type Props = { billNo: string; onClose: () => void };

const BillDetailModal: React.FC<Props> = ({ billNo, onClose }) => {
  const [bill, setBill] = useState<Bill | null>(null);
  const [view, setView] = useState<{ urls: string[]; index: number } | null>(null);

  const openPhoto = (line: Line, which: 1 | 2) => {
    const files = [line.image1, line.image2].filter((name) => (name || '').trim()) as string[];
    if (!files.length) return;
    const clicked = which === 1 ? line.image1 : line.image2;
    const index = Math.max(0, files.indexOf(clicked || ''));
    setView({ urls: files.map(sriImageUrl), index });
  };

  useEffect(() => {
    let live = true;
    billingApi.printBill(billNo).then((res: any) => {
      if (!live) return;
      if (res?.success && res.data) setBill(res.data);
      else {
        toast.error('Bill not found');
        onClose();
      }
    }).catch(() => {
      if (!live) return;
      toast.error('Could not load bill details');
      onClose();
    });
    return () => { live = false; };
  }, [billNo]);

  useEffect(() => {
    if (!view) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setView(null);
      if (e.key === 'ArrowRight' && view.urls.length > 1) {
        setView((cur) => (cur ? { ...cur, index: (cur.index + 1) % cur.urls.length } : cur));
      }
      if (e.key === 'ArrowLeft' && view.urls.length > 1) {
        setView((cur) => (cur ? { ...cur, index: (cur.index - 1 + cur.urls.length) % cur.urls.length } : cur));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [view]);

  return (
    <div className="gbd-back" onClick={onClose}>
      <div className="gbd-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="gbd-head">
          <div>
            <h3>Bill #{bill?.billDisplay || billNo}</h3>
            {bill && <p>{[bill.date, bill.time].filter(Boolean).join('  ')}</p>}
          </div>
          <button className="gbd-close" type="button" onClick={onClose}>Close</button>
        </div>

        {!bill ? (
          <div className="gbd-empty">Loading bill…</div>
        ) : (
          <div className="gbd-body">
            <div className="gbd-party">
              <strong>{bill.customerName || '-'}</strong>
              <span>{bill.customerPhone || '-'}</span>
            </div>

            <div className="gbd-items">
              {(bill.items || []).length === 0 && <div className="gbd-empty">No items</div>}
              {(bill.items || []).map((line, i) => (
                <div key={`${line.name}-${i}`} className="gbd-item">
                  <div className="gbd-item-photos">
                    <Photo fileName={line.image1} onOpen={() => openPhoto(line, 1)} />
                    <Photo fileName={line.image2} onOpen={() => openPhoto(line, 2)} />
                  </div>
                  <div className="gbd-item-info">
                    <div className="gbd-item-name">{line.name || '-'}</div>
                    <div className="gbd-item-amt">{money(line.total ?? line.price)}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="gbd-totals">
              <div>
                <span>Payable</span>
                <strong>{money(bill.payable)}</strong>
              </div>
              <div>
                <span>Paid</span>
                <strong>{money(bill.paid)}</strong>
              </div>
              <div className={(bill.balance || 0) > 0.005 ? 'due' : ''}>
                <span>Balance</span>
                <strong>{money(bill.balance)}</strong>
              </div>
            </div>

            <div className="gbd-paymix">
              <div><span>Cash</span><b>{money(bill.cashPaid)}</b></div>
              <div><span>Bank</span><b>{money(bill.bankPaid)}</b></div>
            </div>

            {(bill.payments || []).length > 0 && (
              <div className="gbd-pays">
                {(bill.payments || []).map((p, i) => (
                  <div key={`${p.date}-${i}`} className="gbd-pay">
                    <div>
                      <b>{p.mode || 'Payment'}</b>
                      <span>{p.date}</span>
                    </div>
                    <strong>{money(p.paid)}</strong>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {view && (
        <div className="bill-view-back" onClick={(e) => { e.stopPropagation(); setView(null); }}>
          <button className="bill-view-close" type="button" onClick={() => setView(null)}>Close</button>
          {view.urls.length > 1 && (
            <>
              <button
                className="bill-view-nav bill-view-prev"
                type="button"
                onClick={(e) => { e.stopPropagation(); setView({ ...view, index: (view.index - 1 + view.urls.length) % view.urls.length }); }}
              >
                ‹
              </button>
              <button
                className="bill-view-nav bill-view-next"
                type="button"
                onClick={(e) => { e.stopPropagation(); setView({ ...view, index: (view.index + 1) % view.urls.length }); }}
              >
                ›
              </button>
            </>
          )}
          <img className="bill-view-img" src={view.urls[view.index]} alt="" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
};

export const useBillDetail = () => {
  const [billNo, setBillNo] = useState<string | null>(null);
  return {
    openBill: (no?: string | null) => {
      const value = (no || '').trim();
      if (value) setBillNo(value);
    },
    billModal: billNo ? <BillDetailModal billNo={billNo} onClose={() => setBillNo(null)} /> : null,
  };
};

export default BillDetailModal;
