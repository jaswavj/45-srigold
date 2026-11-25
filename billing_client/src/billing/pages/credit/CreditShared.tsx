import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { creditApi, creditData, creditError } from '../../../api/credit/credit-api-service';
import { useBillDetail } from '../account-reports/BillDetailModal';
import '../master/Master.css';
import './Credit.css';

export type PartyKind = 'customer' | 'supplier';

type PartyRow = { id: number; name: string; phone: string; balance: number };
type Summary = {
  totals: { dueCount: number; totalDue: number; totalAdvance: number };
  dueList: PartyRow[];
  advanceList: PartyRow[];
};

type SearchHit = { id: number; name: string; phone: string };

type TimelineRow = {
  type: string;
  docNo: string;
  amount: number | null;
  paid: number | null;
  advanceUsed?: number | null;
  pending: number | null;
  date: string;
  time: string;
  userName: string;
  refId: number;
  notes: string;
};

type Account = {
  id: number;
  name: string;
  phone: string;
  advance: number;
  balance: number;
  count: number;
  timeline: TimelineRow[];
};

const money = (n?: number | null) =>
  n == null || Number.isNaN(n) ? '—' : `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const wt = (n?: number | null) =>
  n == null || Number.isNaN(n) ? '—' : Number(n).toFixed(3);

const num = (n?: number | null) =>
  n == null || Number.isNaN(n) ? '—' : Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtAmt = (n?: number | null, asWt?: boolean) => (asWt ? wt(n) : money(n));
const fmtNum = (n?: number | null, asWt?: boolean) => (asWt ? wt(n) : num(n));

type AdvanceBillClose = { docNo: string; take: number };

const parseAdvanceDetail = (row: TimelineRow) => {
  const added = Number(row.amount) || Number(row.paid) || 0;
  const notes = (row.notes || '').trim();
  const leftoverMatch = /leftover\s+([0-9]+(?:\.[0-9]+)?)/i.exec(notes);
  const parts = notes.split('|').map((part) => part.trim()).filter(Boolean);
  const system = leftoverMatch ? (parts[parts.length - 1] || notes) : notes;
  const billsPart = system.replace(/;?\s*leftover\s+[0-9]+(?:\.[0-9]+)?/i, '').trim();
  const bills: AdvanceBillClose[] = [];
  if (billsPart) {
    billsPart.split(',').forEach((chunk) => {
      const match = chunk.trim().match(/^(.+?)\s+([0-9]+(?:\.[0-9]+)?)$/);
      if (match) bills.push({ docNo: match[1].trim(), take: Number(match[2]) });
    });
  }
  const closedFromBills = bills.reduce((sum, bill) => sum + bill.take, 0);
  const leftover = leftoverMatch
    ? Math.max(0, Number(leftoverMatch[1]) || 0)
    : Math.max(0, added - closedFromBills);
  const remark = leftoverMatch && parts.length > 1
    ? parts.slice(0, -1).join(' | ')
    : leftoverMatch || bills.length > 0 || notes === 'Customer advance' || notes === 'Supplier advance'
      ? ''
      : notes;
  return {
    added,
    leftover,
    closedDue: Math.max(0, added - leftover),
    bills,
    remark,
  };
};

export const CreditIndex: React.FC<{ kind: PartyKind }> = ({ kind }) => {
  const navigate = useNavigate();
  const isCustomer = kind === 'customer';
  const [summary, setSummary] = useState<Summary | null>(null);
  const [term, setTerm] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<SearchHit | null>(null);
  const [dueOpen, setDueOpen] = useState(false);
  const [advanceOpen, setAdvanceOpen] = useState(false);
  const timer = useRef<number | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const load = async () => {
    try {
      const res = isCustomer ? await creditApi.customerSummary() : await creditApi.supplierSummary();
      setSummary(creditData<Summary>(res));
    } catch (err) {
      toast.error(creditError(err, 'Could not load account totals'));
    }
  };

  useEffect(() => {
    load();
  }, [kind]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('click', onDoc);
    return () => document.removeEventListener('click', onDoc);
  }, []);

  const search = (value: string) => {
    setTerm(value);
    setSelected(null);
    if (timer.current) window.clearTimeout(timer.current);
    if (!value.trim()) {
      setHits([]);
      setOpen(false);
      return;
    }
    timer.current = window.setTimeout(async () => {
      try {
        const q = value.trim();
        const res = isCustomer
          ? /^\d+$/.test(q)
            ? await creditApi.searchCustomers(undefined, q)
            : await creditApi.searchCustomers(q)
          : await creditApi.searchSuppliers(q);
        setHits(creditData<SearchHit[]>(res) || []);
        setOpen(true);
      } catch (err) {
        toast.error(creditError(err, 'Search failed'));
      }
    }, 280);
  };

  const openAccount = (id: number) => {
    navigate(isCustomer ? `/app/credit/customer-balance?id=${id}` : `/app/credit/supplier-payment?id=${id}`);
  };

  const totals = summary?.totals;
  const party = isCustomer ? 'Customer' : 'Supplier';

  return (
    <div className="mst-page crd-narrow crd-index">
      <h2 className="mst-title">
        <i className={isCustomer ? 'fas fa-wallet' : 'fas fa-hand-holding-usd'} />
        {isCustomer ? 'Customers Balance' : 'Supplier Payment'}
      </h2>
      <div className="crd-stats">
        <div className="mst-card crd-stat">
          <div className="crd-stat-l">{isCustomer ? 'Balance Customers' : 'Due Suppliers'}</div>
          <div className="crd-stat-v">{totals?.dueCount ?? 0}</div>
        </div>
        <div className="mst-card crd-stat clickable" onClick={() => setDueOpen(true)}>
          <div className="crd-stat-l">{isCustomer ? 'Total Balance' : 'Total Due'}</div>
          <div className={`crd-stat-v ${(totals?.totalDue || 0) > 0 ? 'due' : 'ok'}`}>{fmtAmt(totals?.totalDue || 0, isCustomer)}</div>
        </div>
        <div className="mst-card crd-stat clickable" onClick={() => setAdvanceOpen(true)}>
          <div className="crd-stat-l">Total Advance</div>
          <div className="crd-stat-v ok">{fmtAmt(totals?.totalAdvance || 0, isCustomer)}</div>
        </div>
      </div>
      <div className="mst-card">
        <div className="mst-card-h">
          <span><i className="fas fa-search" /> Search {party}</span>
        </div>
        <div className="mst-card-b">
          <div className="crd-search-wrap" ref={wrapRef}>
            <input
              className="mst-inp"
              placeholder="Type name or phone number..."
              value={term}
              onChange={(e) => search(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && selected) openAccount(selected.id);
              }}
            />
            {open && (
              <ul className="crd-dropdown">
                {hits.length === 0 ? (
                  <li className="muted">No {party.toLowerCase()}s found</li>
                ) : (
                  hits.map((h) => (
                    <li
                      key={h.id}
                      onClick={() => {
                        setSelected(h);
                        setTerm(`${h.name}${h.phone && h.phone !== '-' ? `  |  ${h.phone}` : ''}`);
                        setOpen(false);
                      }}
                    >
                      <strong>{h.name}</strong>
                      {h.phone && h.phone !== '-' ? <span style={{ marginLeft: 8, fontSize: 12, opacity: 0.7 }}>{h.phone}</span> : null}
                    </li>
                  ))
                )}
              </ul>
            )}
          </div>
          {selected && (
            <div className="crd-selected">
              <div>
                <div style={{ fontWeight: 700 }}>{selected.name}</div>
                <div className="crd-selected-phone">{selected.phone !== '-' ? selected.phone : ''}</div>
              </div>
              <div className="crd-selected-acts">
                <button className="mst-btn mst-btn-green" type="button" onClick={() => openAccount(selected.id)}>
                  View Account <i className="fas fa-arrow-right" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {dueOpen && (
        <div className="crd-modal" onClick={() => setDueOpen(false)}>
          <div className="crd-modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="crd-modal-h">
              <div>
                <div style={{ fontWeight: 800 }}>
                  <i className="fas fa-exclamation-triangle" style={{ color: '#dc2626', marginRight: 8 }} />
                  {isCustomer ? 'Customers with Balance' : 'Suppliers with Due'}
                </div>
                <div style={{ fontSize: 12, opacity: 0.6, marginTop: 2 }}>
                  {summary?.dueList.length || 0} {party.toLowerCase()}{(summary?.dueList.length || 0) !== 1 ? 's' : ''} | Total: {fmtAmt(totals?.totalDue || 0, isCustomer)}
                </div>
              </div>
              <button className="mst-icon-btn" type="button" onClick={() => setDueOpen(false)}>&times;</button>
            </div>
            <div className="crd-modal-body">
              <table className="mst-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>{party}</th>
                    <th>Phone</th>
                    <th className="num">{isCustomer ? 'Balance' : 'Due'}</th>
                  </tr>
                </thead>
                <tbody>
                  {(summary?.dueList || []).length === 0 ? (
                    <tr><td colSpan={4} className="mst-empty">{isCustomer ? 'No outstanding balance.' : 'No outstanding dues.'}</td></tr>
                  ) : (
                    summary!.dueList.map((row, i) => (
                      <tr key={row.id} className="crd-due-row" onClick={() => row.id > 0 && openAccount(row.id)}>
                        <td>{i + 1}</td>
                        <td style={{ fontWeight: 700 }}>{row.name}</td>
                        <td>{row.phone}</td>
                        <td className="num" style={{ color: '#dc2626', fontWeight: 800 }}>{fmtAmt(row.balance, isCustomer)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {advanceOpen && (
        <div className="crd-modal" onClick={() => setAdvanceOpen(false)}>
          <div className="crd-modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="crd-modal-h">
              <div>
                <div style={{ fontWeight: 800 }}>
                  <i className="fas fa-coins" style={{ color: '#16a34a', marginRight: 8 }} />
                  {party}s with Advance
                </div>
                <div style={{ fontSize: 12, opacity: 0.6, marginTop: 2 }}>
                  {summary?.advanceList?.length || 0} {party.toLowerCase()}{(summary?.advanceList?.length || 0) !== 1 ? 's' : ''} | Total: {fmtAmt(totals?.totalAdvance || 0, isCustomer)}
                </div>
              </div>
              <button className="mst-icon-btn" type="button" onClick={() => setAdvanceOpen(false)}>&times;</button>
            </div>
            <div className="crd-modal-body">
              <table className="mst-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>{party}</th>
                    <th>Phone</th>
                    <th className="num">Advance</th>
                  </tr>
                </thead>
                <tbody>
                  {(summary?.advanceList || []).length === 0 ? (
                    <tr><td colSpan={4} className="mst-empty">No advance.</td></tr>
                  ) : (
                    summary!.advanceList.map((row, i) => (
                      <tr key={`${row.id}-${i}`} className="crd-adv-row" onClick={() => row.id > 0 && openAccount(row.id)}>
                        <td>{i + 1}</td>
                        <td style={{ fontWeight: 700 }}>{row.name}</td>
                        <td>{row.phone}</td>
                        <td className="num" style={{ color: '#16a34a', fontWeight: 800 }}>{fmtAmt(row.balance, isCustomer)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export const CreditAccount: React.FC<{ kind: PartyKind; id: number }> = ({ kind, id }) => {
  const navigate = useNavigate();
  const isCustomer = kind === 'customer';
  const { openBill, billModal } = useBillDetail();
  const [account, setAccount] = useState<Account | null>(null);
  const [advanceRow, setAdvanceRow] = useState<TimelineRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [entryType, setEntryType] = useState('COLLECTION');
  const [amount, setAmount] = useState('');
  const [payMode, setPayMode] = useState('1');
  const [payType, setPayType] = useState('1');
  const [cashPaid, setCashPaid] = useState('');
  const [bankPaid, setBankPaid] = useState('');
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState('');

  const load = async () => {
    try {
      const res = isCustomer ? await creditApi.customerAccount(id) : await creditApi.supplierAccount(id);
      const data = creditData<Account>(res);
      setAccount(data);
      const canCollect = (data.balance || 0) > 0.005;
      const nextType = canCollect ? 'COLLECTION' : 'ADVANCE';
      setEntryType(nextType);
      resetAmounts(nextType, data.balance || 0);
      setNotes('');
      setFormError('');
    } catch (err) {
      toast.error(creditError(err, 'Could not load account'));
    }
  };

  useEffect(() => {
    load();
  }, [kind, id]);

  const canCollect = (account?.balance || 0) > 0.005;

  const resetAmounts = (type: string, balance: number) => {
    const digits = isCustomer ? 3 : 2;
    if (type === 'COLLECTION') {
      setAmount(Math.max(0, balance).toFixed(digits));
      applyMode('1', Math.max(0, balance));
    } else {
      setAmount('');
      setCashPaid('');
      setBankPaid('');
      setPayMode('1');
    }
  };

  const applyMode = (mode: string, total: number) => {
    const digits = isCustomer ? 3 : 2;
    setPayMode(isCustomer ? '1' : mode);
    if (isCustomer || mode === '1') {
      setCashPaid(total.toFixed(digits));
      setBankPaid('');
    } else if (mode === '2') {
      setBankPaid(total.toFixed(digits));
      setCashPaid('');
    } else {
      setCashPaid(total.toFixed(digits));
      setBankPaid((0).toFixed(digits));
    }
  };

  const onTypeChange = (type: string) => {
    if (type === 'COLLECTION' && !canCollect) {
      setEntryType('ADVANCE');
      resetAmounts('ADVANCE', account?.balance || 0);
      return;
    }
    setEntryType(type);
    resetAmounts(type, account?.balance || 0);
    setFormError('');
  };

  const onAmount = (value: string) => {
    setAmount(value);
    applyMode(payMode, parseFloat(value) || 0);
  };

  const remaining = useMemo(() => {
    if (entryType !== 'COLLECTION' && !(isCustomer && entryType === 'ADVANCE')) return 0;
    const cash = parseFloat(cashPaid) || 0;
    const bank = parseFloat(bankPaid) || 0;
    const paid = payMode === '1' ? cash : payMode === '2' ? bank : cash + bank;
    return Math.max(0, (account?.balance || 0) - paid);
  }, [isCustomer, entryType, cashPaid, bankPaid, payMode, account]);

  const collectSplit = useMemo(() => {
    if (!isCustomer || (entryType !== 'COLLECTION' && entryType !== 'ADVANCE')) return [];
    const cash = parseFloat(cashPaid) || 0;
    const bank = parseFloat(bankPaid) || 0;
    let left = payMode === '1' ? cash : payMode === '2' ? bank : cash + bank;
    if (left <= 0) return [];
    const bills = (account?.timeline || [])
      .filter((row) => (row.type || '').toUpperCase() === 'BILL' && (row.pending || 0) > 0.0005)
      .slice()
      .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
    const rows: { docNo: string; take: number; left: number }[] = [];
    for (const bill of bills) {
      if (left <= 0.0005) break;
      const due = Number(bill.pending) || 0;
      const take = Math.min(left, due);
      rows.push({
        docNo: bill.docNo || `#${bill.refId}`,
        take,
        left: Math.max(0, due - take),
      });
      left -= take;
    }
    return rows;
  }, [isCustomer, entryType, cashPaid, bankPaid, payMode, account]);

  const advanceLeftover = useMemo(() => {
    if (!isCustomer || entryType !== 'ADVANCE') return 0;
    const cash = parseFloat(cashPaid) || 0;
    const bank = parseFloat(bankPaid) || 0;
    const paid = payMode === '1' ? cash : payMode === '2' ? bank : cash + bank;
    return Math.max(0, paid - (account?.balance || 0));
  }, [isCustomer, entryType, cashPaid, bankPaid, payMode, account]);

  const advBalanceByIndex = useMemo(() => {
    const rows = account?.timeline || [];
    const order = rows.map((row, index) => ({ row, index }));
    order.sort((a, b) => {
      const cmp = `${a.row.date} ${a.row.time}`.localeCompare(`${b.row.date} ${b.row.time}`);
      if (cmp) return cmp;
      return (Number(a.row.refId) || 0) - (Number(b.row.refId) || 0);
    });
    let adv = 0;
    const byIndex = rows.map(() => 0);
    order.forEach(({ row, index }) => {
      const type = (row.type || '').toUpperCase();
      if (type === 'BILL') {
        const paid = Number(row.paid) || 0;
        const payable = Number(row.amount) || 0;
        const used = Number(row.advanceUsed) || 0;
        adv = Math.max(0, adv - used + Math.max(0, paid - payable));
      } else if (type === 'ADVANCE') {
        const amt = Number(row.amount) || Number(row.paid) || 0;
        const leftover = /leftover\s+([0-9]+(?:\.[0-9]+)?)/i.exec(row.notes || '');
        adv += leftover ? Math.max(0, Number(leftover[1]) || 0) : amt;
      }
      byIndex[index] = adv;
    });
    return byIndex;
  }, [account?.timeline]);

  const submit = async () => {
    setFormError('');
    const amt = parseFloat(amount) || 0;
    const cash = parseFloat(cashPaid) || 0;
    const bank = parseFloat(bankPaid) || 0;
    if (entryType === 'COLLECTION' && !canCollect) {
      setFormError('No account balance due to collect.');
      return;
    }
    if (amt <= 0) {
      setFormError(isCustomer ? 'Please enter a weight greater than zero.' : 'Please enter an amount greater than zero.');
      return;
    }
    if (entryType !== 'OLD_DUE') {
      if (payMode === '1' && cash <= 0) {
        setFormError(isCustomer ? 'Please enter collected wt.' : 'Please enter cash paid amount.');
        return;
      }
      if (payMode === '2' && bank <= 0) {
        setFormError('Please enter bank paid amount.');
        return;
      }
      if (payMode === '3') {
        if (cash <= 0 && bank <= 0) {
          setFormError('Please enter cash and/or bank amount.');
          return;
        }
        if (Math.abs(cash + bank - amt) > 0.01) {
          setFormError('Cash + Bank must equal the amount.');
          return;
        }
      }
    }
    setBusy(true);
    try {
      const payload = {
        entryType,
        amount: amt,
        cashPaid: entryType === 'OLD_DUE' || payMode === '2' ? 0 : cash,
        bankPaid: entryType === 'OLD_DUE' || payMode === '1' ? 0 : bank,
        payMode: entryType === 'OLD_DUE' ? 1 : Number(payMode),
        payType: Number(payType),
        notes,
      };
      const res = isCustomer
        ? await creditApi.saveCustomerEntry(id, payload)
        : await creditApi.saveSupplierEntry(id, payload);
      const saved = creditData<{ entryType: string; newBalance?: number; newAdvance?: number }>(res);
      if (saved.entryType === 'COLLECTION') {
        toast.success(`Remaining balance: ${fmtAmt(saved.newBalance, isCustomer)}`);
      } else if (saved.entryType === 'ADVANCE') {
        const dueLeft = saved.newBalance != null ? ` Remaining due: ${fmtAmt(saved.newBalance, isCustomer)}.` : '';
        toast.success(`Total advance: ${fmtAmt(saved.newAdvance, isCustomer)}.${dueLeft}`);
      } else {
        toast.success(`Account balance: ${fmtAmt(saved.newBalance, isCustomer)}`);
      }
      await load();
    } catch (err) {
      setFormError(creditError(err, 'Error saving entry.'));
    } finally {
      setBusy(false);
    }
  };

  if (!account) {
    return <div className="mst-page"><div className="mst-empty">Loading account…</div></div>;
  }

  const amountClass = entryType === 'OLD_DUE' ? 'old' : entryType === 'ADVANCE' ? 'advance' : 'collect';
  const showPay = entryType !== 'OLD_DUE';
  const showMode = showPay && !isCustomer;
  const showCash = showPay && (isCustomer || payMode === '1' || payMode === '3');
  const showBank = showPay && !isCustomer && (payMode === '2' || payMode === '3');
  const showPayType = showPay && !isCustomer && (payMode === '2' || payMode === '3');
  const step = isCustomer ? '0.001' : '0.01';
  const digits = isCustomer ? 3 : 2;

  return (
    <div className="mst-page crd-account">
      <div className="crd-account-head">
        <button
          className="mst-btn mst-btn-outline crd-back"
          type="button"
          onClick={() => navigate(isCustomer ? '/app/credit/customer-balance' : '/app/credit/supplier-payment')}
        >
          <i className="fas fa-arrow-left" /> Back
        </button>
        <div className="crd-account-id">
          <h2 className="mst-title">
            <i className={isCustomer ? 'fas fa-user-circle' : 'fas fa-truck'} />
            {account.name}
          </h2>
          <div className="mst-note">
            {isCustomer ? 'Customer' : 'Supplier'} Account — {account.phone}
          </div>
        </div>
      </div>
      <div className="crd-layout">
          <div className="crd-stats">
            <div className="mst-card crd-stat">
              <div className="crd-stat-l">{isCustomer ? 'Total Bills' : 'Total Purchases'}</div>
              <div className="crd-stat-v">{account.count}</div>
            </div>
            <div className="mst-card crd-stat">
              <div className="crd-stat-l">Advance</div>
              <div className="crd-stat-v ok">{fmtAmt(account.advance, isCustomer)}</div>
            </div>
            <div className="mst-card crd-stat">
              <div className="crd-stat-l">Account Balance</div>
              <div className={`crd-stat-v ${account.balance > 0 ? 'due' : 'ok'}`}>{fmtAmt(account.balance, isCustomer)}</div>
            </div>
          </div>
          <div className="mst-card crd-bills">
            <div className="mst-card-h">
              <span>Transactions</span>
              {isCustomer && <span className="mst-note">Click a bill or advance to view details</span>}
            </div>
            <div className="mst-table-wrap">
              <table className="mst-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Type</th>
                    <th>{isCustomer ? 'Bill No' : 'GRN No'}</th>
                    <th className="num">{isCustomer ? 'Total wt' : 'Payable / Amt'}</th>
                    <th className="num">{isCustomer ? 'Collected wt' : 'Paid'}</th>
                    <th className="num">{isCustomer ? 'Balance' : 'Pending'}</th>
                    {isCustomer ? <th className="num">Adv balance</th> : null}
                    <th>Date / Time</th>
                    <th>{isCustomer ? 'Biller' : 'User'}</th>
                  </tr>
                </thead>
                <tbody>
                  {account.timeline.length === 0 ? (
                    <tr><td colSpan={isCustomer ? 9 : 8} className="mst-empty">No transactions found.</td></tr>
                  ) : (
                    account.timeline.map((row, i) => {
                      const type = (row.type || '').toUpperCase();
                      const pending = row.pending || 0;
                      const hasPend = (type === 'BILL' || type === 'PURCHASE') && pending > 0.005;
                      const rowClass =
                        type === 'RETURN' ? 'crd-row-return'
                          : type === 'OLD_DUE' ? 'crd-row-old'
                            : type === 'ADVANCE' ? 'crd-row-adv'
                              : type === 'COLLECTION' ? 'crd-row-col'
                                : hasPend ? 'crd-row-due' : '';
                      const badge =
                        type === 'BILL' ? (hasPend ? 'bill-due' : 'bill')
                          : type === 'PURCHASE' ? (hasPend ? 'purchase-due' : 'purchase')
                            : type === 'RETURN' ? 'return'
                              : type === 'OLD_DUE' ? 'old'
                                : type === 'ADVANCE' ? 'adv' : 'col';
                      const label =
                        type === 'COLLECTION' && !isCustomer ? 'PAYMENT'
                          : type.replace('_', ' ');
                      const canOpenBill = isCustomer && type === 'BILL' && !!(row.docNo || '').trim();
                      const canOpenAdvance = isCustomer && type === 'ADVANCE';
                      const clickable = canOpenBill || canOpenAdvance;
                      const advanceInfo = type === 'ADVANCE' ? parseAdvanceDetail(row) : null;
                      return (
                        <tr
                          key={`${type}-${i}-${row.date}-${row.time}`}
                          className={`${rowClass}${clickable ? ' mst-click-row' : ''}`}
                          onClick={() => {
                            if (canOpenAdvance) setAdvanceRow(row);
                            else if (canOpenBill) openBill(row.docNo);
                          }}
                        >
                          <td>{i + 1}</td>
                          <td><span className={`crd-badge ${badge}`}>{label}</span></td>
                          <td>
                            {type === 'ADVANCE' ? (
                              <span style={{ fontWeight: 600, fontSize: 12 }}>
                                {advanceInfo && advanceInfo.bills.length > 0
                                  ? `${advanceInfo.bills.length} bill${advanceInfo.bills.length > 1 ? 's' : ''} closed`
                                  : 'Advance added'}
                              </span>
                            ) : row.docNo || row.notes
                              ? <span style={{ fontWeight: row.docNo ? 600 : 400, fontSize: row.docNo ? undefined : 11 }}>{row.docNo || row.notes}</span>
                              : <span style={{ opacity: 0.35 }}>—</span>}
                          </td>
                          <td className="num">{fmtNum(row.amount, isCustomer)}</td>
                          <td className="num">
                            {fmtNum(row.paid, isCustomer)}
                            {isCustomer && type === 'BILL' && (Number(row.advanceUsed) || 0) > 0.0005 ? (
                              <div className="crd-by-adv">by advance</div>
                            ) : null}
                          </td>
                          <td className="num" style={{ color: hasPend || (type === 'OLD_DUE') || pending > 0 ? '#dc2626' : '#16a34a', fontWeight: 700 }}>
                            {fmtNum(row.pending, isCustomer)}
                          </td>
                          {isCustomer ? (
                            <td className={`num crd-adv-bal${(advBalanceByIndex[i] || 0) > 0.0005 ? '' : ' off'}`}>
                              {fmtNum(advBalanceByIndex[i] || 0, true)}
                            </td>
                          ) : null}
                          <td style={{ whiteSpace: 'nowrap' }}>
                            {row.date}
                            {row.time ? <><br /><span style={{ fontSize: 10, opacity: 0.6 }}>{row.time}</span></> : null}
                          </td>
                          <td>{row.userName}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        <div className="crd-right">
          <div className="mst-card">
            <div className="mst-card-h">Account Entry</div>
            <div className="mst-card-b mst-form one-col">
              <div className="mst-fg">
                <label>Entry Type</label>
                <select className="mst-sel" value={entryType} onChange={(e) => onTypeChange(e.target.value)}>
                  <option value="COLLECTION" disabled={!canCollect}>{isCustomer ? 'Collect Payment (Balance)' : 'Pay Due'}</option>
                  <option value="ADVANCE">Add Advance</option>
                  <option value="OLD_DUE">Add Old Due (Before System)</option>
                </select>
              </div>
              {!canCollect && (
                <div className="crd-hint">
                  <i className="fas fa-info-circle" /> No account balance due. You cannot collect payment until there is a due balance.
                </div>
              )}
              {isCustomer && entryType === 'ADVANCE' && canCollect && (
                <div className="crd-hint">
                  <i className="fas fa-info-circle" /> Customer has due. This wt will close oldest bills first; leftover is saved as advance.
                </div>
              )}
              <div className="mst-fg">
                <label>
                  {entryType === 'OLD_DUE'
                    ? (isCustomer ? 'Old Due wt' : 'Old Due Amount')
                    : entryType === 'ADVANCE'
                      ? (isCustomer ? 'Advance wt' : 'Advance Amount')
                      : (isCustomer ? 'Wt to collect' : 'Amount to Collect')}
                </label>
                <input className={`mst-inp crd-amt ${amountClass}`} type="number" min="0" step={step} value={amount} onChange={(e) => onAmount(e.target.value)} />
              </div>
              {showMode && (
                <div className="mst-fg">
                  <label>Pay Mode</label>
                  <select className="mst-sel" value={payMode} onChange={(e) => applyMode(e.target.value, parseFloat(amount) || 0)}>
                    <option value="1">Cash</option>
                    <option value="2">Bank</option>
                    <option value="3">Mixed</option>
                  </select>
                </div>
              )}
              {showPayType && (
                <div className="mst-fg">
                  <label>Pay Type</label>
                  <select className="mst-sel" value={payType} onChange={(e) => setPayType(e.target.value)}>
                    <option value="1">UPI</option>
                    <option value="2">Debit Card</option>
                    <option value="3">Credit Card</option>
                    <option value="4">Net Banking</option>
                    <option value="5">Wallet</option>
                  </select>
                </div>
              )}
              {showCash && (
                <div className="mst-fg">
                  <label>{isCustomer ? 'Collected wt' : 'Cash Paid'}</label>
                  <input
                    className="mst-inp"
                    type="number"
                    min="0"
                    step={step}
                    value={cashPaid}
                    onChange={(e) => {
                      const cash = parseFloat(e.target.value) || 0;
                      setCashPaid(e.target.value);
                      if (payMode === '3') setBankPaid(Math.max(0, (parseFloat(amount) || 0) - cash).toFixed(digits));
                    }}
                  />
                </div>
              )}
              {showBank && (
                <div className="mst-fg">
                  <label>Bank Paid</label>
                  <input
                    className="mst-inp"
                    type="number"
                    min="0"
                    step={step}
                    value={bankPaid}
                    onChange={(e) => {
                      const bank = parseFloat(e.target.value) || 0;
                      setBankPaid(e.target.value);
                      if (payMode === '3') setCashPaid(Math.max(0, (parseFloat(amount) || 0) - bank).toFixed(digits));
                    }}
                  />
                </div>
              )}
              <div className="mst-fg">
                <label>Notes <span style={{ fontWeight: 400 }}>(optional)</span></label>
                <input
                  className="mst-inp"
                  value={notes}
                  placeholder={entryType === 'OLD_DUE' ? 'e.g. Opening balance before go-live' : entryType === 'ADVANCE' ? 'e.g. Advance for future bills' : 'Remark or reference'}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
              {(entryType === 'COLLECTION' || (isCustomer && entryType === 'ADVANCE')) && (
                <div className="mst-fg">
                  <label>{isCustomer ? 'Remaining due wt' : 'Remaining Balance'}</label>
                  <input className="mst-inp crd-remain" readOnly value={remaining.toFixed(digits)} />
                </div>
              )}
              {isCustomer && entryType === 'ADVANCE' && (
                <div className="mst-fg">
                  <label>Leftover to advance</label>
                  <input className="mst-inp crd-remain" readOnly value={advanceLeftover.toFixed(digits)} />
                </div>
              )}
              {isCustomer && (entryType === 'COLLECTION' || entryType === 'ADVANCE') && collectSplit.length > 0 && (
                <div className="crd-split">
                  <div className="crd-split-h">
                    {entryType === 'ADVANCE'
                      ? 'Due bills will close first; leftover goes to advance'
                      : 'Will apply to oldest unpaid bills first'}
                  </div>
                  {collectSplit.map((row) => (
                    <div key={row.docNo} className="crd-split-row">
                      <span>{row.docNo}</span>
                      <span>close {row.take.toFixed(3)}</span>
                      <span className={row.left > 0.0005 ? 'due' : 'ok'}>left {row.left.toFixed(3)}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="mst-actions">
                <button className="mst-btn mst-btn-primary" type="button" disabled={busy} onClick={submit} style={{ width: '100%' }}>
                  {busy ? 'Saving…' : entryType === 'OLD_DUE' ? 'Save Old Due' : entryType === 'ADVANCE' ? 'Save Advance' : 'Submit Payment'}
                </button>
              </div>
              {formError && <div className="crd-hint" style={{ color: '#dc2626', textAlign: 'center' }}>{formError}</div>}
            </div>
          </div>
        </div>
      </div>
      {advanceRow && (() => {
        const info = parseAdvanceDetail(advanceRow);
        return (
          <div className="crd-modal" onClick={() => setAdvanceRow(null)}>
            <div className="crd-modal-box crd-adv-box" onClick={(e) => e.stopPropagation()}>
              <div className="crd-modal-h">
                <div>
                  <div style={{ fontWeight: 800 }}>
                    <i className="fas fa-coins" style={{ color: '#16a34a', marginRight: 8 }} />
                    Advance details
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.6, marginTop: 2 }}>
                    {advanceRow.date}{advanceRow.time ? ` · ${advanceRow.time}` : ''}
                    {advanceRow.userName ? ` · ${advanceRow.userName}` : ''}
                  </div>
                </div>
                <button className="mst-icon-btn" type="button" onClick={() => setAdvanceRow(null)}>&times;</button>
              </div>
              <div className="crd-modal-body crd-adv-detail">
                <div className="crd-adv-kpis">
                  <div className="crd-adv-kpi">
                    <div className="l">Added wt</div>
                    <div className="v">{wt(info.added)} g</div>
                  </div>
                  <div className="crd-adv-kpi due">
                    <div className="l">Due collected</div>
                    <div className="v">{wt(info.closedDue)} g</div>
                  </div>
                  <div className="crd-adv-kpi plus">
                    <div className="l">Advance added</div>
                    <div className="v">{wt(info.leftover)} g</div>
                  </div>
                </div>
                {info.remark ? <div className="crd-adv-remark">{info.remark}</div> : null}
                <div className="crd-split-h">Bills due collected</div>
                {info.bills.length === 0 ? (
                  <div className="crd-adv-empty">
                    {info.closedDue > 0.0005
                      ? 'Due was closed from account balance. No bill rows were applied.'
                      : 'No due bills. Full amount was added as advance.'}
                  </div>
                ) : (
                  <table className="mst-table crd-adv-bills">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Bill No</th>
                        <th className="num">Collected wt</th>
                      </tr>
                    </thead>
                    <tbody>
                      {info.bills.map((bill, i) => (
                        <tr
                          key={`${bill.docNo}-${i}`}
                          className="mst-click-row"
                          onClick={() => openBill(bill.docNo)}
                        >
                          <td>{i + 1}</td>
                          <td style={{ fontWeight: 700 }}>{bill.docNo}</td>
                          <td className="num">{wt(bill.take)} g</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                <div className="crd-adv-foot">
                  Leftover after closing due: <strong>{wt(info.leftover)} g</strong> added as advance
                </div>
              </div>
            </div>
          </div>
        );
      })()}
      {billModal}
    </div>
  );
};
