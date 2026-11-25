import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'react-toastify';
import { billingApi } from '../../api/billing/billing-api-service';
import { creditApi, creditData } from '../../api/credit/credit-api-service';
import { goldTotalWt, round2 } from '../utils/goldCalc';
import CollectionShareCard, { CollectionBill } from './CollectionShareCard';
import './master/Master.css';
import './CollectionBillPicker.css';

type ListRow = {
  billId: number;
  billDisplay: string;
  customerId?: number;
  date: string;
  time?: string;
  customerName: string;
  phone: string;
  itemName: string;
  purity: number;
  metalWt: number;
  wastagePer: number;
  stoneWt: number;
  stoneWastage: number;
  cost: number;
  paid: number;
  payable: number;
  cash?: number;
  advanceUsed?: number;
};

export type CollectionCustomer = { id: number; name: string; phone: string };

const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
};

const fmtDate = (d?: string) => {
  if (!d) return '';
  const dt = new Date(`${String(d).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
};

const rowWt = (row: ListRow) =>
  goldTotalWt({
    finishing: row.cost,
    wastage: row.metalWt,
    stoneWt: row.stoneWt,
    stoneWastage: row.stoneWastage,
    purity: row.purity,
    wastagePer: row.wastagePer,
  });

const matchesCustomer = (row: ListRow, customer: CollectionCustomer, billNos: Set<string>) => {
  const display = (row.billDisplay || '').trim();
  if (display && billNos.has(display)) return true;
  const rowId = Number(row.customerId) || 0;
  if (customer.id > 0 && rowId > 0) return rowId === customer.id;
  return false;
};

const groupBills = (rows: ListRow[]): CollectionBill[] => {
  const map = new Map<string, CollectionBill>();
  for (const row of rows) {
    const key = (row.billDisplay || String(row.billId || '')).trim();
    if (!key) continue;
    const lineWt = rowWt(row);
    const existing = map.get(key);
    if (!existing) {
      map.set(key, {
        billDisplay: key,
        date: row.date || '',
        time: row.time || '',
        customerName: row.customerName || '',
        phone: row.phone || '',
        itemName: row.itemName || '',
        itemCount: 1,
        totalWt: lineWt,
        paid: Number(row.paid) || 0,
        payable: Number(row.payable) || 0,
        cash: row.cash == null ? undefined : Number(row.cash) || 0,
        advanceUsed: Number(row.advanceUsed) || 0,
      });
      continue;
    }
    existing.totalWt = round2(existing.totalWt + lineWt);
    existing.itemCount += 1;
    const nextItem = (row.itemName || '').trim();
    if (nextItem && !existing.itemName.split(', ').includes(nextItem)) {
      existing.itemName = existing.itemName ? `${existing.itemName}, ${nextItem}` : nextItem;
    }
  }
  return [...map.values()];
};

export const CollectionBillPicker: React.FC<{
  customer?: CollectionCustomer;
  onClose: () => void;
  onProceed: (bills: CollectionBill[], account: { due: number; advance: number }) => void;
}> = ({ customer, onClose, onProceed }) => {
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const [search, setSearch] = useState('');
  const [bills, setBills] = useState<CollectionBill[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [accountDue, setAccountDue] = useState(0);
  const [accountAdv, setAccountAdv] = useState(0);

  const load = useCallback(async (start = from, end = to) => {
    if (!customer?.id) {
      setBills([]);
      setAccountDue(0);
      setAccountAdv(0);
      return;
    }
    setLoading(true);
    try {
      const [listRes, accRes]: any[] = await Promise.all([
        billingApi.itemList(start, end),
        creditApi.customerAccount(customer.id),
      ]);
      const rows: ListRow[] = Array.isArray(listRes?.data) ? listRes.data : [];
      const account = creditData<{
        advance?: number;
        balance?: number;
        timeline?: {
          type?: string;
          docNo?: string;
          date?: string;
          time?: string;
          amount?: number | null;
          paid?: number | null;
          notes?: string;
        }[];
      }>(accRes);
      setAccountDue(Math.max(0, Number(account.balance) || 0));
      setAccountAdv(Math.max(0, Number(account.advance) || 0));
      const billNos = new Set(
        (account.timeline || [])
          .filter((row) => (row.type || '').toUpperCase() === 'BILL')
          .map((row) => (row.docNo || '').trim())
          .filter(Boolean),
      );
      const inRange = (d?: string) => {
        const day = String(d || '').slice(0, 10);
        return !!day && day >= start && day <= end;
      };
      const grouped = groupBills(rows.filter((row) => matchesCustomer(row, customer, billNos)));
      const advances: CollectionBill[] = (account.timeline || [])
        .filter((row) => (row.type || '').toUpperCase() === 'ADVANCE' && inRange(row.date))
        .map((row, i) => {
          const amt = Number(row.amount) || Number(row.paid) || 0;
          const leftoverMatch = /leftover\s+([0-9]+(?:\.[0-9]+)?)/i.exec(row.notes || '');
          const leftover = leftoverMatch ? Math.max(0, Number(leftoverMatch[1]) || 0) : amt;
          return {
            billDisplay: `ADV:${row.date || ''}|${row.time || ''}|${i}`,
            date: row.date || '',
            time: row.time || '',
            customerName: customer.name,
            phone: customer.phone,
            itemName: leftover.toFixed(3),
            itemCount: 1,
            totalWt: 0,
            paid: leftover,
            payable: 0,
            cash: leftover,
            advanceUsed: 0,
            kind: 'advance',
          };
        });
      const stamp = (row: CollectionBill) =>
        `${String(row.date || '').slice(0, 10)} ${String(row.time || '00:00:00')}`;
      const merged = [...grouped, ...advances].sort((a, b) => stamp(b).localeCompare(stamp(a)));
      setBills(merged);
      setSelected(new Set());
    } catch (err: any) {
      toast.error(err?.response?.data?.data?.error || err?.message || 'Could not load bills');
      setBills([]);
      setAccountDue(0);
      setAccountAdv(0);
    } finally {
      setLoading(false);
    }
  }, [from, to, customer]);

  useEffect(() => {
    void load(monthStart(), today());
  }, [customer?.id]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return bills;
    return bills.filter((bill) => {
      const hay = [bill.billDisplay, bill.customerName, bill.phone, bill.itemName].join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [bills, search]);

  const allVisibleSelected = visible.length > 0 && visible.every((bill) => selected.has(bill.billDisplay));

  const toggle = (key: string) => {
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected((cur) => {
      const next = new Set(cur);
      if (allVisibleSelected) {
        visible.forEach((bill) => next.delete(bill.billDisplay));
      } else {
        visible.forEach((bill) => next.add(bill.billDisplay));
      }
      return next;
    });
  };

  const proceed = () => {
    const picked = bills.filter((bill) => selected.has(bill.billDisplay));
    if (!picked.length) {
      toast.warning('Select at least one bill or advance');
      return;
    }
    onProceed(picked, { due: accountDue, advance: accountAdv });
  };

  const dueOrAdv = (bill: CollectionBill) => {
    const due = Math.max(0, bill.payable - bill.paid);
    const adv = Math.max(0, bill.paid - bill.payable);
    if (adv > 0.0005) return `Adv ${adv.toFixed(3)}`;
    return `Bal ${due.toFixed(3)}`;
  };

  const collectedByAdvance = (bill: CollectionBill) => Math.max(0, Number(bill.advanceUsed) || 0) > 0.0005;

  const collectedLabel = (bill: CollectionBill) => {
    const used = Math.max(0, Number(bill.advanceUsed) || 0);
    if (used <= 0.0005) return bill.paid.toFixed(3);
    if (used + 0.0005 >= (Number(bill.paid) || 0)) return `${bill.paid.toFixed(3)} · by advance`;
    return `${bill.paid.toFixed(3)} · by advance ${used.toFixed(3)}`;
  };

  const emptyText = customer
    ? `No bills or advance for ${customer.name || 'this customer'} in this date range`
    : 'No bills in this date range';

  return createPortal(
    <div className="gold-coll-back" onClick={onClose}>
      <div className="gold-coll-panel mst-card" onClick={(e) => e.stopPropagation()}>
        <div className="mst-card-h gold-coll-head">
          <span>Select bills{customer?.name ? ` — ${customer.name}` : ''}</span>
          <button type="button" className="mst-btn" onClick={onClose}>Close</button>
        </div>
        <div className="mst-card-b gold-coll-body">
          <div className="gold-coll-filters">
            <div className="mst-fg">
              <label>From</label>
              <input className="mst-inp" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="mst-fg">
              <label>To</label>
              <input className="mst-inp" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <div className="mst-fg gold-coll-search">
              <label>Search</label>
              <input
                className="mst-inp"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Item"
              />
            </div>
            <button className="mst-btn mst-btn-primary" type="button" disabled={loading} onClick={() => void load()}>
              {loading ? 'Loading…' : 'Load'}
            </button>
          </div>
          <div className="gold-coll-table-wrap">
            <table className="mst-table gold-coll-table">
              <thead>
                <tr>
                  <th className="gold-coll-check">
                    <input type="checkbox" checked={allVisibleSelected} onChange={toggleAll} aria-label="Select all" />
                  </th>
                  <th>Date</th>
                  <th>Item</th>
                  <th>Total wt</th>
                  <th>Collected</th>
                  <th>Due / Adv</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6} className="gold-coll-empty">Loading bills…</td></tr>
                ) : visible.length === 0 ? (
                  <tr><td colSpan={6} className="gold-coll-empty">{emptyText}</td></tr>
                ) : visible.map((bill) => (
                  <tr
                    key={bill.billDisplay}
                    className={`${bill.kind === 'advance' ? 'gold-coll-adv' : ''}${selected.has(bill.billDisplay) ? ' on' : ''}`.trim()}
                    onClick={() => toggle(bill.billDisplay)}
                  >
                    <td className="gold-coll-check" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={selected.has(bill.billDisplay)} onChange={() => toggle(bill.billDisplay)} />
                    </td>
                    <td>{fmtDate(bill.date)}</td>
                    <td>{bill.kind === 'advance' ? (bill.itemName || 'Advance') : (bill.itemName || '—')}</td>
                    <td>{bill.kind === 'advance' ? '—' : bill.totalWt.toFixed(2)}</td>
                    <td>
                      {bill.paid.toFixed(3)}
                      {collectedByAdvance(bill) ? <em>by advance</em> : null}
                    </td>
                    <td>{dueOrAdv(bill)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="gold-coll-cards">
            {loading ? (
              <div className="gold-coll-empty">Loading bills…</div>
            ) : visible.length === 0 ? (
              <div className="gold-coll-empty">{emptyText}</div>
            ) : (
              <>
                <label className="gold-coll-select-all">
                  <input type="checkbox" checked={allVisibleSelected} onChange={toggleAll} />
                  Select all
                </label>
                {visible.map((bill) => (
                  <label key={bill.billDisplay} className={`gold-coll-card${bill.kind === 'advance' ? ' gold-coll-adv' : ''}${selected.has(bill.billDisplay) ? ' on' : ''}`}>
                    <input type="checkbox" checked={selected.has(bill.billDisplay)} onChange={() => toggle(bill.billDisplay)} />
                    <div>
                      <strong>{bill.kind === 'advance' ? (bill.itemName || 'Advance') : (bill.itemName || 'Item')}</strong>
                      <em>{fmtDate(bill.date)}</em>
                      <span>
                        {bill.kind === 'advance'
                          ? `Advance ${bill.paid.toFixed(3)} g · ${dueOrAdv(bill)}`
                          : `Total ${bill.totalWt.toFixed(2)} g · Collected ${collectedLabel(bill)} g · ${dueOrAdv(bill)}`}
                      </span>
                    </div>
                  </label>
                ))}
              </>
            )}
          </div>
          <div className="gold-coll-account">
            <div>
              <span>Current due</span>
              <b className={accountDue > 0.0005 ? 'due' : ''}>{accountDue.toFixed(3)} g</b>
            </div>
            <div>
              <span>Current Advance</span>
              <b className={accountAdv > 0.0005 ? 'adv' : ''}>{accountAdv.toFixed(3)} g</b>
            </div>
          </div>
          <div className="gold-coll-acts">
            <button className="mst-btn" type="button" onClick={onClose}>Cancel</button>
            <button className="mst-btn mst-btn-primary" type="button" onClick={proceed}>
              Proceed{selected.size ? ` (${selected.size})` : ''}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};

const CollectionCustomerPick: React.FC<{
  onClose: () => void;
  onSelect: (customer: CollectionCustomer) => void;
}> = ({ onClose, onSelect }) => {
  const [term, setTerm] = useState('');
  const [hits, setHits] = useState<CollectionCustomer[]>([]);
  const [open, setOpen] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);

  const search = (value: string) => {
    setTerm(value);
    if (timer.current) window.clearTimeout(timer.current);
    if (!value.trim()) {
      setHits([]);
      setOpen(false);
      return;
    }
    timer.current = window.setTimeout(async () => {
      try {
        const q = value.trim();
        const res: any = /^\d+$/.test(q)
          ? await billingApi.searchCustomers(undefined, q)
          : await billingApi.searchCustomers(q);
        const raw = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
        const rows: CollectionCustomer[] = raw.map((row: any) => ({
          id: Number(row.id) || 0,
          name: row.name || '',
          phone: row.phone || '',
        })).filter((row: CollectionCustomer) => row.id > 0);
        setHits(rows);
        setOpen(true);
      } catch {
        toast.error('Could not search customers');
      }
    }, 280);
  };

  return createPortal(
    <div className="gold-coll-back" onClick={onClose}>
      <div className="gold-coll-panel gold-coll-pick mst-card" onClick={(e) => e.stopPropagation()}>
        <div className="mst-card-h gold-coll-head">
          <span>Select customer</span>
          <button type="button" className="mst-btn" onClick={onClose}>Close</button>
        </div>
        <div className="mst-card-b gold-coll-body">
          <div className="mst-fg gold-coll-pick-search">
            <label>Customer</label>
            <input
              className="mst-inp"
              value={term}
              placeholder="Type name or phone number"
              onChange={(e) => search(e.target.value)}
              onFocus={() => hits.length && setOpen(true)}
              autoFocus
            />
            {open && (
              <ul className="gold-coll-drop">
                {hits.length === 0 ? (
                  <li className="muted">No customers found</li>
                ) : hits.map((hit) => (
                  <li key={hit.id} onClick={() => onSelect(hit)}>
                    <strong>{hit.name}</strong>
                    {hit.phone && hit.phone !== '-' ? <em>{hit.phone}</em> : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="gold-coll-acts">
            <button className="mst-btn" type="button" onClick={onClose}>Cancel</button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export const CollectionBillButton: React.FC<{
  customer?: CollectionCustomer;
  className?: string;
}> = ({ customer, className }) => {
  const [pick, setPick] = useState(false);
  const [chosen, setChosen] = useState<CollectionCustomer | null>(customer || null);
  const [open, setOpen] = useState(false);
  const [share, setShare] = useState<CollectionBill[] | null>(null);
  const [account, setAccount] = useState({ due: 0, advance: 0 });

  const start = () => {
    if (customer?.id) {
      setChosen(customer);
      setOpen(true);
      return;
    }
    setChosen(null);
    setPick(true);
  };

  const stop = () => {
    setPick(false);
    setOpen(false);
    setChosen(null);
    setShare(null);
    setAccount({ due: 0, advance: 0 });
  };

  return (
    <>
      <button className={className || 'mst-btn mst-btn-primary'} type="button" onClick={start}>
        Collection bill
      </button>
      {pick ? (
        <CollectionCustomerPick
          onClose={stop}
          onSelect={(next) => {
            setChosen(next);
            setPick(false);
            setOpen(true);
          }}
        />
      ) : null}
      {open && chosen ? (
        <CollectionBillPicker
          customer={chosen}
          onClose={stop}
          onProceed={(bills, acc) => {
            setOpen(false);
            setShare(bills);
            setAccount(acc);
          }}
        />
      ) : null}
      {share ? (
        <CollectionShareCard
          bills={share}
          accountDue={account.due}
          accountAdv={account.advance}
          onClose={stop}
        />
      ) : null}
    </>
  );
};

export default CollectionBillPicker;
