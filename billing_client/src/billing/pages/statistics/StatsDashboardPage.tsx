import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { billingApi } from '../../../api/billing/billing-api-service';
import { statsApi, statsData, statsError } from '../../../api/statistics/statistics-api-service';
import { routerPathNames } from '../../../routes/routerPathNames';
import { useBillDetail } from '../account-reports/BillDetailModal';
import '../admin/MonthlyBills.css';
import '../credit/Credit.css';
import '../master/Master.css';
import './Stats.css';

type Day = { date: string; sales: number; expense: number };
type UnfinishedRow = {
  billId: number;
  billDisplay: string;
  date: string;
  time: string;
  customerName: string;
  phone: string;
  itemName: string;
  itemSize: string;
};
type Dash = {
  year: number; month: number; label: string;
  sales: number; lastSales: number; salesPct: number;
  purchase: number; lastPurchase: number; purchasePct: number;
  expense: number; lastExpense: number; expensePct: number;
  profit: number; lastProfit: number; profitPct: number;
  netProfit: number; todaySales: number; todayBills: number; daily: Day[];
  exchPoint?: number;
};

const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const SALES = '#3b82f6';
const EXPENSE = '#a78bfa';

const n = (v?: number) => Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const trend = (pct: number, last: number) => last === 0 ? '— No prev. data' : `${pct >= 0 ? '▲' : '▼'} ${Math.abs(pct).toFixed(1)}% vs last month`;
const compact = (v: number) => {
  const abs = Math.abs(v);
  if (abs >= 100000) return `${(v / 100000).toFixed(1)}L`;
  if (abs >= 1000) return `${(v / 1000).toFixed(1)}k`;
  return String(Math.round(v));
};

const fmtDate = (d: string) => {
  const dt = new Date(`${String(d).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

const startOfDay = (d: Date) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

const daysSinceBill = (dateStr: string) => {
  const billed = startOfDay(new Date(`${String(dateStr).slice(0, 10)}T00:00:00`));
  if (Number.isNaN(billed.getTime())) return 0;
  return Math.floor((startOfDay(new Date()).getTime() - billed.getTime()) / 86400000);
};

const overdueRows = (rows: UnfinishedRow[], minDays: number, maxDays?: number) =>
  rows.filter((row) => {
    const days = daysSinceBill(row.date);
    if (days < minDays) return false;
    if (maxDays != null && days > maxDays) return false;
    return true;
  });

const whoLine = (row: UnfinishedRow) => {
  const name = row.customerName || 'No name';
  const phone = row.phone ? ` · ${row.phone}` : '';
  const item = row.itemName ? ` · ${row.itemName}` : '';
  const days = daysSinceBill(row.date);
  return `${name}${phone}${item} · ${days} day${days === 1 ? '' : 's'}`;
};

const fmtTime = (t: string) => {
  const parts = String(t || '').split(':');
  if (parts.length < 2) return t || '';
  let h = Number(parts[0]);
  if (!Number.isFinite(h)) return t;
  const m = parts[1];
  const ampm = h >= 12 ? 'pm' : 'am';
  h = h % 12 || 12;
  return `${h}:${m} ${ampm}`;
};

const useNarrow = () => {
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const on = () => setNarrow(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return narrow;
};

const ChartTip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const rows = payload.filter((p: any) => p.dataKey === 'sales' || p.dataKey === 'expense');
  if (!rows.length) return null;
  const title = rows[0]?.payload?.label || label;
  return (
    <div className="st-tip">
      <div className="st-tip-d">{title}</div>
      {rows.map((p: any) => (
        <div key={p.dataKey} className="st-tip-row">
          <i style={{ background: p.color || p.fill }} />
          <span>{p.name}</span>
          <b>₹ {n(p.value)}</b>
        </div>
      ))}
    </div>
  );
};

const DailyCandle: React.FC<{
  title: string;
  data: { date: string; label: string; day: string; sales: number; expense: number }[];
  dataKey: 'sales' | 'expense';
  name: string;
  from: string;
  to: string;
  height: number;
  barMax: number;
  xTickInterval: number;
}> = ({ title, data, dataKey, name, from, to, height, barMax, xTickInterval }) => (
  <div className="mst-card st-chart-card">
    <div className="mst-card-h">{title}</div>
    <div className="mst-card-b st-chart-body">
      {data.length === 0 ? (
        <div className="mst-empty">No days in this month.</div>
      ) : (
        <div className="st-chart-fit" style={{ height }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barCategoryGap="18%">
              <defs>
                <linearGradient id={`${dataKey}Bar`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={from} />
                  <stop offset="100%" stopColor={to} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
              <XAxis
                dataKey="day"
                tick={{ fill: 'var(--color-text-muted)', fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                interval={xTickInterval}
              />
              <YAxis
                tickFormatter={compact}
                tick={{ fill: 'var(--color-text-muted)', fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                width={34}
              />
              <Tooltip content={<ChartTip />} cursor={{ fill: 'rgba(15, 23, 42, 0.05)' }} />
              <Bar dataKey={dataKey} name={name} fill={`url(#${dataKey}Bar)`} radius={[4, 4, 0, 0]} maxBarSize={barMax} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  </div>
);

const PieTip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  return (
    <div className="st-tip">
      <div className="st-tip-row">
        <i style={{ background: p.payload.color }} />
        {p.name}: ₹ {n(p.value)} ({((p.percent || 0) * 100).toFixed(1)}%)
      </div>
    </div>
  );
};

const StatsDashboardPage: React.FC = () => {
  const narrow = useNarrow();
  const now = new Date();
  const navigate = useNavigate();
  const { openBill, billModal } = useBillDetail();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [data, setData] = useState<Dash | null>(null);
  const [unfinished, setUnfinished] = useState<UnfinishedRow[]>([]);
  const [pieIndex, setPieIndex] = useState(0);
  const [overdueAlert, setOverdueAlert] = useState<{ days: 5 | 8; rows: UnfinishedRow[] } | null>(null);
  const [overdueEight, setOverdueEight] = useState<UnfinishedRow[]>([]);

  const loadUnfinished = async () => {
    try {
      const res: any = await billingApi.itemList(undefined, undefined, true);
      const rows: UnfinishedRow[] = Array.isArray(res?.data) ? res.data : [];
      setUnfinished(rows);
      return rows;
    } catch {
      setUnfinished([]);
      return [] as UnfinishedRow[];
    }
  };

  const openOverdueAlerts = (rows: UnfinishedRow[]) => {
    const five = overdueRows(rows, 5, 7);
    const eight = overdueRows(rows, 8);
    setOverdueEight(eight);
    if (five.length) setOverdueAlert({ days: 5, rows: five });
    else if (eight.length) setOverdueAlert({ days: 8, rows: eight });
    else setOverdueAlert(null);
  };

  const closeOverdueAlert = () => {
    if (overdueAlert?.days === 5 && overdueEight.length) {
      setOverdueAlert({ days: 8, rows: overdueEight });
      return;
    }
    setOverdueAlert(null);
  };

  const load = async (y = year, m = month, withAlerts = false) => {
    try {
      const dash = statsData<Dash>(await statsApi.dashboard(y, m));
      setData(dash);
      const rows = await loadUnfinished();
      if (withAlerts) openOverdueAlerts(rows);
    } catch (err) {
      toast.error(statsError(err, 'Could not load dashboard'));
    }
  };

  useEffect(() => { void load(year, month, true); }, []);

  const years = Array.from({ length: 6 }, (_, i) => now.getFullYear() + 1 - i);
  const daily = data?.daily || [];
  const pieData = useMemo(() => {
    if (!data) return [];
    return [
      { name: 'Income', value: Math.max(0, Number(data.sales || 0)), color: SALES },
      { name: 'Expense', value: Math.max(0, Number(data.expense || 0)), color: EXPENSE },
    ].filter((s) => s.value > 0);
  }, [data]);
  const pieTotal = pieData.reduce((sum, s) => sum + s.value, 0);
  const mixSlice = pieData[Math.min(pieIndex, Math.max(0, pieData.length - 1))];
  const chartDays = useMemo(() => daily.map((d) => ({
    ...d,
    label: String(d.date || ''),
    day: String(d.date || '').slice(0, 2),
  })), [daily]);
  const dayCount = chartDays.length;
  const chartH = narrow ? 188 : 228;
  const barMax = dayCount > 28 ? 7 : dayCount > 20 ? 9 : dayCount > 14 ? 12 : 16;
  const xTickInterval = dayCount > 24 ? 2 : dayCount > 16 ? 1 : 0;

  const editBill = (row: UnfinishedRow) => {
    if (!row.billDisplay) {
      toast.error('Bill number missing');
      return;
    }
    navigate(`${routerPathNames.billing}?edit=${encodeURIComponent(row.billDisplay)}`);
  };

  return (
    <div className="mst-page">
      <div className="mst-card st-filter" style={{ marginBottom: 12 }}>
        <div className="mst-card-b st-filter-row">
          <div className="mst-fg">
            <label>Year</label>
            <select className="mst-sel" value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div className="mst-fg">
            <label>Month</label>
            <select className="mst-sel" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
              {months.map((name, i) => <option key={name} value={i + 1}>{name}</option>)}
            </select>
          </div>
          <div className="st-filter-acts">
            <button className="mst-btn mst-btn-primary" type="button" onClick={() => load()}>Load</button>
            {(year !== now.getFullYear() || month !== now.getMonth() + 1) && (
              <button className="mst-btn mst-btn-outline" type="button" onClick={() => { setYear(now.getFullYear()); setMonth(now.getMonth() + 1); load(now.getFullYear(), now.getMonth() + 1); }}>Current Month</button>
            )}
          </div>
        </div>
      </div>
      {data && (
        <>
          <div className="st-kpis st-kpis-2">
            <div className="st-kpi sales">
              <span className="st-kpi-art st-kpi-art-chart" aria-hidden />
              <i className="st-kpi-deco fas fa-chart-line" aria-hidden />
              <div className="st-kpi-body">
                <div className="st-kpi-l">Collected Wt</div>
                <div className="st-kpi-v">{Number(data.sales || 0).toFixed(3)}</div>
                <div className="st-kpi-t">{trend(data.salesPct, data.lastSales)}</div>
              </div>
            </div>
            <div className="st-kpi expense">
              <span className="st-kpi-art st-kpi-art-wave" aria-hidden />
              <i className="st-kpi-deco fas fa-wallet" aria-hidden />
              <div className="st-kpi-body">
                <div className="st-kpi-l">Total Expense</div>
                <div className="st-kpi-v">₹ {n(data.expense)}</div>
                <div className="st-kpi-t">{trend(data.expensePct, data.lastExpense)}</div>
              </div>
            </div>
          </div>
          <div className="mst-note st-today">Today: ₹ {n(data.todaySales)} across {data.todayBills} bills · Showing {data.label}</div>
          <div className="st-charts">
            <DailyCandle
              title={`Daily Income — ${data.label}`}
              data={chartDays}
              dataKey="sales"
              name="Income"
              from="#60a5fa"
              to={SALES}
              height={chartH}
              barMax={barMax}
              xTickInterval={xTickInterval}
            />
            <DailyCandle
              title={`Daily Expense — ${data.label}`}
              data={chartDays}
              dataKey="expense"
              name="Expense"
              from="#c4b5fd"
              to={EXPENSE}
              height={chartH}
              barMax={barMax}
              xTickInterval={xTickInterval}
            />
            <div className="mst-card st-chart-card st-chart-mix">
              <div className="mst-card-h">Month Mix — {data.label}</div>
              <div className="mst-card-b st-chart-body">
                {pieTotal <= 0 ? (
                  <div className="mst-empty">No income or expense in this month.</div>
                ) : (
                  <div className="st-mix">
                    <div className="st-mix-pie">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={pieData}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            innerRadius={58}
                            outerRadius={84}
                            paddingAngle={4}
                            onMouseEnter={(_, i) => setPieIndex(i)}
                            onClick={(_, i) => setPieIndex(i)}
                          >
                            {pieData.map((s, i) => (
                              <Cell
                                key={s.name}
                                fill={s.color}
                                stroke="var(--color-bg-surface)"
                                strokeWidth={pieIndex === i ? 4 : 2}
                              />
                            ))}
                          </Pie>
                          <Tooltip content={<PieTip />} />
                        </PieChart>
                      </ResponsiveContainer>
                      {mixSlice ? (
                        <div className="st-mix-center">
                          <span>{mixSlice.name}</span>
                          <b>₹ {n(mixSlice.value)}</b>
                        </div>
                      ) : null}
                    </div>
                    <div className="st-mix-stats">
                      {pieData.map((s, i) => (
                        <button
                          key={s.name}
                          type="button"
                          className={`st-mix-stat${pieIndex === i ? ' on' : ''}`}
                          onClick={() => setPieIndex(i)}
                        >
                          <span className="st-mix-k">
                            <i style={{ background: s.color }} />
                            {s.name}
                          </span>
                          <strong>₹ {n(s.value)}</strong>
                          <em>{((s.value / pieTotal) * 100).toFixed(1)}% of month</em>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="mst-card" style={{ marginTop: 12 }}>
            <div className="mst-card-h">Unfinished Bills ({unfinished.length})</div>
            <div className="mst-card-b">
              {unfinished.length === 0 ? (
                <div className="mst-empty">No bills with finishing wt not entered.</div>
              ) : (
                <div className="mb-cards">
                  {unfinished.map((row, i) => (
                    <article className="mb-card gold-dash-unfinished" key={`${row.billId}-${i}`}>
                      <div className="mb-card-body">
                        <div>
                          <h3 className="mb-name">{row.customerName || '-'}</h3>
                          <p className="mb-invoice">
                            {row.itemName || '-'}
                            {row.itemSize ? ` · ${row.itemSize}` : ''}
                            {row.billDisplay ? ` · #${row.billDisplay}` : ''}
                          </p>
                          <p className="mb-meta">
                            {fmtDate(row.date)} · {fmtTime(row.time)}
                            {row.phone ? ` · ${row.phone}` : ''}
                          </p>
                        </div>
                        <div className="mb-amt">Not added</div>
                      </div>
                      <div className="mb-actions">
                        <button className="mb-act" type="button" onClick={() => openBill(row.billDisplay)}>
                          <i className="fas fa-eye" /> View
                        </button>
                        <button className="mb-act mb-act-print" type="button" onClick={() => editBill(row)}>
                          <i className="fas fa-pen" /> Edit
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
      {overdueAlert && (
        <div className="st-overdue-back" onClick={closeOverdueAlert}>
          <div className={`st-overdue ${overdueAlert.days === 8 ? 'late' : ''}`} onClick={(e) => e.stopPropagation()}>
            <h3>
              {overdueAlert.days === 8 ? 'Unfinished 8 days and above' : 'Unfinished 5 to 7 days'}
            </h3>
            <p>
              {overdueAlert.rows.length} bill{overdueAlert.rows.length === 1 ? '' : 's'} still without finishing wt
              {overdueAlert.days === 5 && overdueEight.length > 0 ? '. Next alert: 8 days and above.' : '.'}
            </p>
            <ul>
              {overdueAlert.rows.map((row, i) => (
                <li key={`${row.billId}-${i}`}>{whoLine(row)}</li>
              ))}
            </ul>
            <div className="st-overdue-acts">
              <button className="mst-btn mst-btn-primary" type="button" onClick={closeOverdueAlert}>
                {overdueAlert.days === 5 && overdueEight.length > 0 ? 'Next' : 'OK'}
              </button>
            </div>
          </div>
        </div>
      )}
      {billModal}
    </div>
  );
};

export default StatsDashboardPage;
