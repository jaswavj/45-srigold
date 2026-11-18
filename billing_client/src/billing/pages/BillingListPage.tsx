import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { adminApi, adminError } from '../../api/admin/admin-api-service';
import { BillingApiService } from '../../api/billing/billing-api-service';
import { routerPathNames } from '../../routes/routerPathNames';
import { goldAmount, goldTotalWt } from '../utils/goldCalc';
import { sriImageUrl } from '../utils/sriImages';
import FinishedShareCard from './FinishedShareCard';
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
  itemSize: string;
  purity: number;
  metalWt: number;
  wastagePer: number;
  stoneWt: number;
  stoneWastage: number;
  stoneCost: number;
  gramRate: number;
  chargeType: string;
  chargeAmt: number;
  cost: number;
  paid: number;
  payable: number;
  image1: string;
  image2: string;
  missingImage: boolean;
};

type ListFilter = 'all' | 'unfinished' | 'finished';

const today = () => new Date().toISOString().slice(0, 10);
const api = new BillingApiService();
const wt = (n?: number | null, digits = 3) => {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return 'Not added';
  return v.toFixed(digits);
};

const rupee = (n?: number | null) => `₹${(Number(n) || 0).toFixed(2)}`;
const opt = (n?: number | null, digits = 3) => {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return '-';
  return v.toFixed(digits);
};
const rowGold = (row: ListRow) => ({
  finishing: row.cost,
  wastage: row.metalWt,
  stoneWt: row.stoneWt,
  stoneWastage: row.stoneWastage,
  stoneCost: row.stoneCost,
  gramRate: row.gramRate,
  chargeAmt: row.chargeAmt,
});
const bothPhotosMissing = (row: ListRow) => !(row.image1 || '').trim() && !(row.image2 || '').trim();
const missingWeights = (row: ListRow) => !(Number(row.cost) > 0) && !(Number(row.metalWt) > 0);
const listRowClass = (row: ListRow) => {
  const classes = [];
  if (missingWeights(row)) classes.push('gold-list-missing-wt');
  if (bothPhotosMissing(row)) classes.push('gold-list-missing');
  return classes.join(' ');
};

const PayBadges: React.FC<{ row: ListRow }> = ({ row }) => {
  const paid = Number(row.paid) || 0;
  const payable = Number(row.payable) || 0;
  const advance = Math.max(0, paid - payable);
  const due = Math.max(0, payable - paid);
  return (
    <div className="gold-list-pay">
      <span className={`gold-list-badge adv${advance > 0.001 ? '' : ' off'}`}>Adv {advance.toFixed(3)}</span>
      <span className={`gold-list-badge due${due > 0.001 ? '' : ' off'}`}>Due {due.toFixed(3)}</span>
    </div>
  );
};

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
  const [filter, setFilter] = useState<ListFilter>('all');
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<ListRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [cancelRow, setCancelRow] = useState<ListRow | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [view, setView] = useState<{ urls: string[]; index: number } | null>(null);
  const [shareBillNo, setShareBillNo] = useState<string | null>(null);

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

  const load = useCallback(async (start = from, end = to, mode: ListFilter = filter) => {
    setLoading(true);
    try {
      const res: any = await api.itemList(start, end, mode === 'unfinished', mode === 'finished');
      setRows(Array.isArray(res?.data) ? res.data : []);
    } catch (err: any) {
      toast.error(err?.response?.data?.data?.error || err?.message || 'Could not load list');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [from, to, filter]);

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
      {filter === 'finished' && (
        <button
          className="gold-list-icon gold-list-icon-wa"
          type="button"
          title="WhatsApp / JPEG"
          aria-label="WhatsApp"
          onClick={() => {
            if (!row.billDisplay) {
              toast.error('Bill number missing');
              return;
            }
            setShareBillNo(row.billDisplay);
          }}
        >
          <i className="fab fa-whatsapp" />
        </button>
      )}
      <button className="gold-list-icon gold-list-icon-edit" type="button" title="Edit" aria-label="Edit" onClick={() => editBill(row)}>
        <i className="fas fa-pen" />
      </button>
      <button className="gold-list-icon gold-list-icon-del" type="button" title="Delete" aria-label="Delete" onClick={() => openCancel(row)}>
        <i className="fas fa-trash" />
      </button>
    </div>
  );

  return (
    <div className="mst-page gold-list-page">
      <h2 className="mst-title">
        <i className="fas fa-list" /> Billing list
      </h2>
      <div className="mst-card" style={{ marginBottom: 12 }}>
        <div className="mst-card-b gold-list-filters">
          <div className={`mst-fg${filter === 'unfinished' ? ' gold-list-date-off' : ''}`}>
            <label>From date</label>
            <input className="mst-inp" type="date" value={from} disabled={filter === 'unfinished'} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className={`mst-fg${filter === 'unfinished' ? ' gold-list-date-off' : ''}`}>
            <label>To date</label>
            <input className="mst-inp" type="date" value={to} disabled={filter === 'unfinished'} onChange={(e) => setTo(e.target.value)} />
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
            <button
              className="mst-btn mst-btn-primary"
              type="button"
              disabled={loading}
              onClick={() => {
                setFilter('all');
                void load(from, to, 'all');
              }}
            >
              {loading && filter === 'all' ? 'Loading…' : 'Show'}
            </button>
            <button
              className={`mst-btn gold-list-unfinished${filter === 'unfinished' ? ' on' : ''}`}
              type="button"
              disabled={loading}
              onClick={() => {
                setFilter('unfinished');
                void load(from, to, 'unfinished');
              }}
            >
              {loading && filter === 'unfinished' ? 'Loading…' : 'Not finished'}
            </button>
            <button
              className={`mst-btn gold-list-finished${filter === 'finished' ? ' on' : ''}`}
              type="button"
              disabled={loading}
              onClick={() => {
                setFilter('finished');
                void load(from, to, 'finished');
              }}
            >
              {loading && filter === 'finished' ? 'Loading…' : 'Finished'}
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
          <span className="gold-list-hint">
            {filter === 'unfinished'
              ? 'All dates · finishing wt not entered'
              : filter === 'finished'
                ? 'Finishing wt entered'
                : 'Highlighted when finishing and wastage wt are not added'}
          </span>
        </div>
        <div className="gold-list-table-wrap">
          <table className="mst-table gold-list-table">
            <thead>
              <tr>
                <th>Action</th>
                <th>Name</th>
                <th>Phone</th>
                <th>Item name</th>
                <th>Size</th>
                <th>Finishing wt</th>
                <th>Purity</th>
                <th>%</th>
                <th>Wastage wt</th>
                <th>Stone wt</th>
                <th>Stone wastage</th>
                <th>Total wt</th>
                <th>Amount</th>
                <th>Photos</th>
              </tr>
            </thead>
            <tbody>
              {!loading && visible.length === 0 && (
                <tr>
                  <td colSpan={14} className="gold-list-empty">
                    {rows.length === 0
                      ? (filter === 'unfinished'
                        ? 'No items without finishing wt'
                        : filter === 'finished'
                          ? 'No finished items in this date range'
                          : 'No bills in this date range')
                      : 'No matching name, phone or item'}
                  </td>
                </tr>
              )}
              {visible.map((row, i) => (
                <tr key={`${row.billId}-${i}`} className={listRowClass(row)}>
                  <td><RowActs row={row} /></td>
                  <td>
                    <div className="gold-list-name-cell">
                      <span>{row.customerName || '-'}</span>
                      <PayBadges row={row} />
                    </div>
                  </td>
                  <td>{row.phone || '-'}</td>
                  <td>{row.itemName || '-'}</td>
                  <td>{row.itemSize || '-'}</td>
                  <td className={!(Number(row.cost) > 0) ? 'gold-list-wt-pending' : ''}>{wt(row.cost)}</td>
                  <td>{Number(row.purity) > 0 ? Number(row.purity) : '-'}</td>
                  <td>{opt(row.wastagePer, 2)}</td>
                  <td className={!(Number(row.metalWt) > 0) ? 'gold-list-wt-pending' : ''}>{wt(row.metalWt, 2)}</td>
                  <td>{opt(row.stoneWt)}</td>
                  <td>{opt(row.stoneWastage)}</td>
                  <td>{goldTotalWt(rowGold(row)).toFixed(3)}</td>
                  <td>
                    {goldAmount(rowGold(row)) > 0 ? (
                      <div>
                        <div>{rupee(goldAmount(rowGold(row)))}</div>
                        <div className="gold-list-sub">
                          {[
                            Number(row.stoneCost) > 0 ? `Stone ${rupee(row.stoneCost)}` : '',
                            Number(row.gramRate) > 0 ? `${opt(row.gramRate, 2)}/g` : '',
                            (row.chargeType || '').trim() || (Number(row.chargeAmt) > 0 ? 'Type' : ''),
                            Number(row.chargeAmt) > 0 ? rupee(row.chargeAmt) : '',
                          ].filter(Boolean).join(' · ')}
                        </div>
                      </div>
                    ) : '-'}
                  </td>
                  <td>
                    <div className="gold-list-card-photos">
                      <Photo fileName={row.image1} onOpen={() => openPhoto(row, 1)} />
                      <Photo fileName={row.image2} onOpen={() => openPhoto(row, 2)} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="gold-list-cards">
          {!loading && visible.length === 0 && (
            <div className="gold-list-empty">
              {rows.length === 0
                ? (filter === 'unfinished'
                  ? 'No items without finishing wt'
                  : filter === 'finished'
                    ? 'No finished items in this date range'
                    : 'No bills in this date range')
                : 'No matching name, phone or item'}
            </div>
          )}
          {visible.map((row, i) => (
            <div key={`c-${row.billId}-${i}`} className={`gold-list-card ${listRowClass(row)}`.trim()}>
              <RowActs row={row} />
              <div className="gold-list-card-head">
                <div className="gold-list-card-name">{row.customerName || '-'}</div>
                <PayBadges row={row} />
              </div>
              <div className="gold-list-card-meta">{row.phone || '-'}</div>
              <div className="gold-list-card-item">{row.itemName || '-'}{row.itemSize ? ` · ${row.itemSize}` : ''}</div>
              <div className={`gold-list-card-wt${!(Number(row.cost) > 0) ? ' gold-list-wt-pending' : ''}`}>Finishing wt: {wt(row.cost)}</div>
              <div className="gold-list-card-wt">Purity: {Number(row.purity) > 0 ? Number(row.purity) : '-'}</div>
              <div className="gold-list-card-wt">Percentage: {opt(row.wastagePer, 2)}</div>
              <div className={`gold-list-card-wt${!(Number(row.metalWt) > 0) ? ' gold-list-wt-pending' : ''}`}>Wastage wt: {wt(row.metalWt, 2)}</div>
              <div className="gold-list-card-wt">Stone wt: {opt(row.stoneWt)}</div>
              <div className="gold-list-card-wt">Stone wastage: {opt(row.stoneWastage)}</div>
              <div className="gold-list-card-wt">Total wt: {goldTotalWt(rowGold(row)).toFixed(3)}</div>
              <div className="gold-list-card-wt">Amount: {goldAmount(rowGold(row)) > 0 ? rupee(goldAmount(rowGold(row))) : '-'}</div>
              <div className="gold-list-card-photos">
                <Photo fileName={row.image1} onOpen={() => openPhoto(row, 1)} />
                <Photo fileName={row.image2} onOpen={() => openPhoto(row, 2)} />
              </div>
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

      {shareBillNo && (
        <FinishedShareCard billNo={shareBillNo} onClose={() => setShareBillNo(null)} />
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
