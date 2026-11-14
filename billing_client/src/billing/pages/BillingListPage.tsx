import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { adminApi, adminError } from '../../api/admin/admin-api-service';
import { BillingApiService } from '../../api/billing/billing-api-service';
import { routerPathNames } from '../../routes/routerPathNames';
import { sriImageUrl } from '../utils/sriImages';
import './master/Master.css';
import './BillingListPage.css';

type ListRow = {
  billId: number;
  billDisplay: string;
  date: string;
  time: string;
  customerName: string;
  phone: string;
  itemName: string;
  cost: number;
  image1: string;
  image2: string;
  missingImage: boolean;
};

const today = () => new Date().toISOString().slice(0, 10);
const api = new BillingApiService();
const money = (n: number) => `₹${(Number.isFinite(n) ? n : 0).toFixed(2)}`;

const bothPhotosMissing = (row: ListRow) => !(row.image1 || '').trim() && !(row.image2 || '').trim();

const Photo: React.FC<{ fileName?: string; onOpen?: () => void }> = ({ fileName, onOpen }) => {
  if (fileName) {
    return (
      <button type="button" className="gold-list-photo-btn" onClick={onOpen} title="View photo">
        <img className="gold-list-photo" src={sriImageUrl(fileName)} alt="" />
      </button>
    );
  }
  return <span className="gold-list-photo gold-list-photo-missing">No photo</span>;
};

const BillingListPage: React.FC = () => {
  const navigate = useNavigate();
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<ListRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [cancelRow, setCancelRow] = useState<ListRow | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [view, setView] = useState<{ urls: string[]; index: number } | null>(null);

  const openPhoto = (row: ListRow, which: 1 | 2) => {
    const files = [row.image1, row.image2].filter((name) => (name || '').trim());
    if (!files.length) return;
    const clicked = which === 1 ? row.image1 : row.image2;
    const index = Math.max(0, files.indexOf(clicked));
    setView({ urls: files.map(sriImageUrl), index });
  };

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => {
      const name = (row.customerName || '').toLowerCase();
      const phone = (row.phone || '').toLowerCase();
      const item = (row.itemName || '').toLowerCase();
      return name.includes(q) || phone.includes(q) || item.includes(q);
    });
  }, [rows, search]);

  const load = useCallback(async (start = from, end = to) => {
    setLoading(true);
    try {
      const res: any = await api.itemList(start, end);
      setRows(Array.isArray(res?.data) ? res.data : []);
    } catch (err: any) {
      toast.error(err?.response?.data?.data?.error || err?.message || 'Could not load list');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    void load(today(), today());
  }, []);

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

  const editBill = (row: ListRow) => {
    if (!row.billDisplay) {
      toast.error('Bill number missing');
      return;
    }
    navigate(`${routerPathNames.billing}?edit=${encodeURIComponent(row.billDisplay)}`);
  };

  const openCancel = (row: ListRow) => {
    setCancelRow(row);
    setCancelReason('');
  };

  const confirmCancel = async () => {
    if (!cancelRow) return;
    if (!cancelReason.trim()) {
      toast.warning('Enter a cancellation reason');
      return;
    }
    setCancelling(true);
    try {
      await adminApi.cancelBill(cancelRow.billId, cancelReason.trim());
      toast.success(`Bill ${cancelRow.billDisplay} cancelled`);
      setCancelRow(null);
      setCancelReason('');
      await load();
    } catch (err) {
      toast.error(adminError(err, 'Could not cancel bill'));
    } finally {
      setCancelling(false);
    }
  };

  const RowActs: React.FC<{ row: ListRow }> = ({ row }) => (
    <div className="gold-list-acts">
      <button className="mst-btn mst-btn-primary gold-list-act" type="button" onClick={() => editBill(row)}>Edit</button>
      <button className="mst-btn mst-btn-danger gold-list-act" type="button" onClick={() => openCancel(row)}>Cancel</button>
    </div>
  );

  return (
    <div className="mst-page gold-list-page">
      <h2 className="mst-title">
        <i className="fas fa-list" /> Billing list
      </h2>
      <div className="mst-card" style={{ marginBottom: 12 }}>
        <div className="mst-card-b gold-list-filters">
          <div className="mst-fg">
            <label>From date</label>
            <input className="mst-inp" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="mst-fg">
            <label>To date</label>
            <input className="mst-inp" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="mst-fg gold-list-search">
            <label>Search</label>
            <input
              className="mst-inp"
              value={search}
              placeholder="Customer name, phone, item name"
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="gold-list-filter-acts">
            <button className="mst-btn mst-btn-primary" type="button" disabled={loading} onClick={() => void load()}>
              {loading ? 'Loading…' : 'Show'}
            </button>
            <button className="mst-btn" type="button" onClick={() => navigate(routerPathNames.billing)}>
              Back to billing
            </button>
          </div>
        </div>
      </div>

      <div className="mst-card">
        <div className="mst-card-h">
          <span>{visible.length} item{visible.length === 1 ? '' : 's'}{search.trim() ? ` of ${rows.length}` : ''}</span>
          <span className="gold-list-hint">Highlighted when both photos are missing</span>
        </div>
        <div className="gold-list-table-wrap">
          <table className="mst-table gold-list-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Phone</th>
                <th>Item name</th>
                <th>Cost</th>
                <th>Photo 1</th>
                <th>Photo 2</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {!loading && visible.length === 0 && (
                <tr>
                  <td colSpan={7} className="gold-list-empty">
                    {rows.length === 0 ? 'No bills in this date range' : 'No matching name, phone or item'}
                  </td>
                </tr>
              )}
              {visible.map((row, i) => (
                <tr key={`${row.billId}-${i}`} className={bothPhotosMissing(row) ? 'gold-list-missing' : ''}>
                  <td>{row.customerName || '-'}</td>
                  <td>{row.phone || '-'}</td>
                  <td>{row.itemName || '-'}</td>
                  <td>{money(row.cost)}</td>
                  <td><Photo fileName={row.image1} onOpen={() => openPhoto(row, 1)} /></td>
                  <td><Photo fileName={row.image2} onOpen={() => openPhoto(row, 2)} /></td>
                  <td><RowActs row={row} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="gold-list-cards">
          {!loading && visible.length === 0 && (
            <div className="gold-list-empty">
              {rows.length === 0 ? 'No bills in this date range' : 'No matching name, phone or item'}
            </div>
          )}
          {visible.map((row, i) => (
            <div key={`c-${row.billId}-${i}`} className={`gold-list-card${bothPhotosMissing(row) ? ' gold-list-missing' : ''}`}>
              <div className="gold-list-card-name">{row.customerName || '-'}</div>
              <div className="gold-list-card-meta">{row.phone || '-'}</div>
              <div className="gold-list-card-item">{row.itemName || '-'}</div>
              <div className="gold-list-card-cost">{money(row.cost)}</div>
              <div className="gold-list-card-photos">
                <Photo fileName={row.image1} onOpen={() => openPhoto(row, 1)} />
                <Photo fileName={row.image2} onOpen={() => openPhoto(row, 2)} />
              </div>
              <RowActs row={row} />
            </div>
          ))}
        </div>
      </div>

      {view && (
        <div className="gold-list-view-back" onClick={() => setView(null)}>
          <button className="gold-list-view-close" type="button" onClick={() => setView(null)}>Close</button>
          {view.urls.length > 1 && (
            <>
              <button
                className="gold-list-view-nav gold-list-view-prev"
                type="button"
                onClick={(e) => { e.stopPropagation(); setView({ ...view, index: (view.index - 1 + view.urls.length) % view.urls.length }); }}
              >
                ‹
              </button>
              <button
                className="gold-list-view-nav gold-list-view-next"
                type="button"
                onClick={(e) => { e.stopPropagation(); setView({ ...view, index: (view.index + 1) % view.urls.length }); }}
              >
                ›
              </button>
            </>
          )}
          <img
            className="gold-list-view-img"
            src={view.urls[view.index]}
            alt=""
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {cancelRow && (
        <div className="gold-list-modal-back" onClick={() => !cancelling && setCancelRow(null)}>
          <div className="gold-list-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Cancel bill #{cancelRow.billDisplay}</h3>
            <p>This cancels the full bill, not only this item.</p>
            <div className="mst-fg">
              <label>Reason</label>
              <input
                className="mst-inp"
                value={cancelReason}
                placeholder="Reason for cancellation"
                autoFocus
                onChange={(e) => setCancelReason(e.target.value)}
              />
            </div>
            <div className="gold-list-modal-acts">
              <button className="mst-btn" type="button" disabled={cancelling} onClick={() => setCancelRow(null)}>Back</button>
              <button className="mst-btn mst-btn-danger" type="button" disabled={cancelling} onClick={() => void confirmCancel()}>
                {cancelling ? 'Cancelling…' : 'Confirm cancel'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BillingListPage;
