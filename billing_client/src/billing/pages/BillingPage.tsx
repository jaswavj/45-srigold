import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSelector } from 'react-redux';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import { adminApi } from '../../api/admin/admin-api-service';
import { BillingApiService } from '../../api/billing/billing-api-service';
import { handleThermalDispatch } from '../../api/billing/local-print-agent';
import { OrderListApiService } from '../../api/orders/order-list-api-service';
import { routerPathNames } from '../../routes/routerPathNames';
import { RootState } from '../../state/store';
import { A4Invoice } from './A4Invoice';
import { compressImage } from '../utils/compressImage';
import { calcTotalWt, calcWastageWt } from '../utils/goldCalc';
import { sriImageUrl } from '../utils/sriImages';
import './BillingPage.css';

type Product = {
  id: number;
  code: string;
  name: string;
  mrp: number;
  batchId: number;
  unitName: string;
  convertionUnit: string;
  commission: number;
  stock: number;
  categoryId?: number;
  discType?: number;
  productDiscount?: number;
};

type MenuCategory = { id: number; name: string };

type Line = {
  key: number;
  productId: number;
  code: string;
  name: string;
  qty: number;
  displayQty: number;
  displayUnit: string;
  price: number;
  discType: 1 | 2;
  discInput: number;
  discount: number;
  commissionPer: number;
  commission: number;
  total: number;
  batchId: number;
  image1: string;
  image2: string;
  metalWt: number;
  itemSize: string;
  purity: number;
  wastagePer: number;
  stoneWt: number;
  stoneWastage: number;
  stoneCost: number;
  gramRate: number;
  chargeType: string;
  chargeAmt: number;
};

const blankGold = {
  wastagePer: 0,
  stoneWt: 0,
  stoneWastage: 0,
  stoneCost: 0,
  gramRate: 0,
  chargeType: '',
  chargeAmt: 0,
};

const goldFromSaved = (item: any) => ({
  wastagePer: Number(item?.wastagePer) || 0,
  stoneWt: Number(item?.stoneWt) || 0,
  stoneWastage: Number(item?.stoneWastage) || 0,
  stoneCost: Number(item?.stoneCost) || 0,
  gramRate: Number(item?.gramRate) || 0,
  chargeType: item?.chargeType || '',
  chargeAmt: Number(item?.chargeAmt) || 0,
});

const plainNum = (n: number) => (Number(n) > 0 ? String(Number(Number(n).toFixed(3))) : '');
const moneyIn = (n: number) => (Number(n) > 0 ? Number(n).toFixed(2) : '');

type Customer = {
  id: number;
  name: string;
  phone: string;
  isEligibleForCommission: number;
  exchangePoint: number;
  advance?: number;
};

const api = new BillingApiService();
const ordersApi = new OrderListApiService();
const money = (n: number) => (Number.isFinite(n) ? n.toFixed(3) : '0.000');
const wastage = (n: number) => (Number.isFinite(n) ? n.toFixed(2) : '0.00');
const rupee = (n: number) => `₹${(Number.isFinite(n) ? n : 0).toFixed(2)}`;
const parseWt = (v: string) => {
  const n = parseFloat(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
};
const missingLineWt = (line: Pick<Line, 'price' | 'metalWt'>) =>
  !(Number(line.price) > 0) && !(Number(line.metalWt) > 0);

const wastageFromPercent = (
  finishingRaw: string,
  percentRaw: string,
  purityRaw = '',
  stoneRaw = '',
  stoneWastageRaw = '',
) => {
  const fin = parseWt(finishingRaw);
  const pct = parseWt(percentRaw);
  const pur = parseWt(purityRaw);
  const stone = parseWt(stoneRaw);
  const stoneW = parseWt(stoneWastageRaw);
  if (!(fin > 0) || !(pct > 0)) return '';
  return wastage(calcWastageWt(fin, pct, pur, stone, stoneW));
};

const CafeItemIcon: React.FC = () => (
  <svg className="cafe-item-svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <rect x="3.6" y="2.2" width="2.2" height="8.2" rx="1.1" />
    <rect x="6.9" y="2.2" width="2.2" height="8.2" rx="1.1" />
    <rect x="10.2" y="2.2" width="2.2" height="8.2" rx="1.1" />
    <path d="M3.6 9.4h8.8v1.5c0 2.5-2 4.4-4.4 4.4s-4.4-1.9-4.4-4.4V9.4z" />
    <rect x="6.9" y="14.8" width="2.2" height="7" rx="1.1" />
    <path d="M16.2 2.3c4.1 3.4 5.7 7.6 5.7 11.4 0 1.5-.8 2.4-2 2.4h-1.7V2.3z" />
    <rect x="16.2" y="16.1" width="2.4" height="5.7" rx="1.2" />
  </svg>
);

const ImageSlot: React.FC<{
  fileName: string;
  busy: boolean;
  onPick: (file: File) => void;
  onClear: () => void;
}> = ({ fileName, busy, onPick, onClear }) => (
  <label className={`pos-img-slot${fileName ? ' has' : ''}${busy ? ' busy' : ''}`} aria-busy={busy}>
    <input
      type="file"
      accept="image/*"
      disabled={busy}
      onChange={(e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (file) onPick(file);
      }}
    />
    {fileName ? (
      <>
        <img src={sriImageUrl(fileName)} alt="" />
        {!busy && (
          <button
            type="button"
            className="pos-img-x"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onClear();
            }}
          >
            ×
          </button>
        )}
      </>
    ) : (
      <span>+</span>
    )}
  </label>
);

const BillingPage: React.FC = () => {
  const login = useSelector((s: RootState) => s.loginData);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [discPer, setDiscPer] = useState(login.discPer || 100);
  const [canBillWithoutStock, setCanBillWithoutStock] = useState(false);
  const [billingType, setBillingType] = useState(1);
  const [priceEditable, setPriceEditable] = useState(true);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [menuProducts, setMenuProducts] = useState<Product[]>([]);
  const [menuCategory, setMenuCategory] = useState(0);
  const [menuQuery, setMenuQuery] = useState('');

  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerId, setCustomerId] = useState(0);
  const [customerHits, setCustomerHits] = useState<Customer[]>([]);
  const [custField, setCustField] = useState<'name' | 'phone' | null>(null);
  const [custIndex, setCustIndex] = useState(0);
  const [exchangePoint, setExchangePoint] = useState(0);
  const [exchangeUsed, setExchangeUsed] = useState(0);
  const [customerAdvance, setCustomerAdvance] = useState(0);
  const [advanceUsed, setAdvanceUsed] = useState(0);
  const savedBillExtraRef = useRef(0);
  const loadedCustomerIdRef = useRef(0);
  const [bypassCap, setBypassCap] = useState(false);
  const [isTaxBill, setIsTaxBill] = useState(false);
  const [isCommission, setIsCommission] = useState(false);

  const [search, setSearch] = useState('');
  const [nameHits, setNameHits] = useState<string[]>([]);
  const [hitIndex, setHitIndex] = useState(0);
  const [pending, setPending] = useState<Product | null>(null);
  const [qty, setQty] = useState('1');
  const [price, setPrice] = useState('');
  const [unitSel, setUnitSel] = useState('');
  const [stock, setStock] = useState<number | null>(null);
  const [draftImage1, setDraftImage1] = useState('');
  const [draftImage2, setDraftImage2] = useState('');
  const [draftMetalWt, setDraftMetalWt] = useState('');
  const [draftSize, setDraftSize] = useState('');
  const [draftPurity, setDraftPurity] = useState('');
  const [draftPercent, setDraftPercent] = useState('');
  const [draftStoneWt, setDraftStoneWt] = useState('');
  const [draftStoneWastage, setDraftStoneWastage] = useState('');
  const [draftStoneCost, setDraftStoneCost] = useState('');
  const [draftGramRate, setDraftGramRate] = useState('');
  const [draftChargeType, setDraftChargeType] = useState('');
  const [draftChargeAmt, setDraftChargeAmt] = useState('');
  const [uploadingSlot, setUploadingSlot] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const sizeRef = useRef<HTMLInputElement>(null);
  const metalWtRef = useRef<HTMLInputElement>(null);
  const finishingRef = useRef<HTMLInputElement>(null);
  const purityRef = useRef<HTMLInputElement>(null);
  const percentRef = useRef<HTMLInputElement>(null);
  const stoneWtRef = useRef<HTMLInputElement>(null);
  const stoneWastageRef = useRef<HTMLInputElement>(null);
  const stoneCostRef = useRef<HTMLInputElement>(null);
  const gramRateRef = useRef<HTMLInputElement>(null);
  const chargeTypeRef = useRef<HTMLInputElement>(null);
  const chargeAmtRef = useRef<HTMLInputElement>(null);
  const hitRef = useRef<HTMLButtonElement>(null);
  const qtyRef = useRef<HTMLInputElement>(null);
  const custNameRef = useRef<HTMLInputElement>(null);
  const custPhoneRef = useRef<HTMLInputElement>(null);
  const taxBillRef = useRef<HTMLInputElement>(null);
  const custHitRef = useRef<HTMLButtonElement>(null);
  const custSearchSeq = useRef(0);
  const autoPay = useRef(true);

  const [lines, setLines] = useState<Line[]>([]);
  const [, setLineKey] = useState(1);
  const [extraDisc, setExtraDisc] = useState('0');
  const [mode, setMode] = useState('1');
  const [payType, setPayType] = useState('1');
  const [cashPaid, setCashPaid] = useState('');
  const [bankPaid, setBankPaid] = useState('0');
  const [balance, setBalance] = useState('0');
  const [payEpoch, setPayEpoch] = useState(0);
  const [saving, setSaving] = useState(false);
  const [holding, setHolding] = useState(false);
  const [savedNo, setSavedNo] = useState('');
  const [savedStamp, setSavedStamp] = useState(-1);
  const billStampRef = useRef(0);
  const [billStamp, setBillStamp] = useState(0);
  const [quotationId, setQuotationId] = useState(0);
  const editingHoldIdRef = useRef(0);
  const loadHoldSeqRef = useRef(0);
  const loadHoldBusyIdRef = useRef(0);
  const billSessionRef = useRef(0);
  const holdSavingRef = useRef(false);
  const cartGenRef = useRef(0);
  const saleTouchGenRef = useRef(0);
  const linesStampRef = useRef(0);
  const [holdNo, setHoldNo] = useState('');

  const [saveOpen, setSaveOpen] = useState(false);
  const [keysOpen, setKeysOpen] = useState(false);
  const [orderOpen, setOrderOpen] = useState(false);
  const [orders, setOrders] = useState<any[]>([]);
  const [orderId, setOrderId] = useState(0);
  const [holdOpen, setHoldOpen] = useState(false);
  const [holds, setHolds] = useState<any[]>([]);
  const [dupeOpen, setDupeOpen] = useState(false);
  const [recent, setRecent] = useState<any[]>([]);
  const [dupeNo, setDupeNo] = useState('');
  const [history, setHistory] = useState<any[] | null>(null);
  const [historyName, setHistoryName] = useState('');
  const [a4Bill, setA4Bill] = useState<any>(null);
  const [editBillId, setEditBillId] = useState(0);
  const [editBillNo, setEditBillNo] = useState('');
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    api.options().then((res: any) => {
      if (res?.success && res.data) {
        setDiscPer(res.data.discPer ?? 100);
        setCanBillWithoutStock(!!res.data.canBillWithoutStock);
        setBillingType(res.data.billingType === 2 ? 2 : 1);
        setPriceEditable(res.data.isEditablePrice !== 0);
      }
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (billingType !== 2) return;
    api.menu().then((res: any) => {
      if (res?.success && res.data) {
        setCategories(res.data.categories || []);
        setMenuProducts(res.data.products || []);
      }
    }).catch(() => undefined);
  }, [billingType]);

  useEffect(() => {
    const billNo = (searchParams.get('edit') || '').trim();
    if (!billNo) return;
    let live = true;
    const loadSession = billSessionRef.current;
    (async () => {
      try {
        const res: any = await api.editBill(billNo);
        if (!live || loadSession !== billSessionRef.current) return;
        if (!res?.success || !res.data) {
          toast.error(res?.data?.error || 'Bill not found');
          return;
        }
        const data = res.data;
        const items: any[] = data.products || [];
        autoPay.current = false;
        setEditBillId(data.billId);
        setEditBillNo(data.billDisplay);
        setLines(items.map((item, idx) => ({
          key: idx + 1,
          productId: item.productId,
          code: item.code,
          name: item.name,
          qty: item.qty,
          displayQty: item.qty,
          displayUnit: item.unitName || '',
          price: item.price,
          discType: 1 as const,
          discInput: item.discount || 0,
          discount: item.discount || 0,
          commissionPer: item.commission || 0,
          commission: (item.commission || 0) * (item.qty || 0),
          total: item.total,
          batchId: item.batchId,
          image1: item.image1 || '',
          image2: item.image2 || '',
          metalWt: Number(item.metalWt) || 0,
          itemSize: item.itemSize || '',
          purity: Number(item.purity) || 0,
          ...goldFromSaved(item),
        })));
        setLineKey(items.length + 1);
        const first = items[0];
        setSearch(first?.name || '');
        setPending(null);
        setPrice(Number(first?.price) > 0 ? money(first.price) : '');
        setDraftMetalWt(Number(first?.metalWt) > 0 ? wastage(first.metalWt) : '');
        setDraftSize(first?.itemSize || '');
        setDraftPurity(Number(first?.purity) > 0 ? String(Number(first.purity)) : (Number(first?.price) > 0 ? '92' : ''));
        setDraftPercent(plainNum(first?.wastagePer));
        setDraftStoneWt(Number(first?.stoneWt) > 0 ? money(first.stoneWt) : '');
        setDraftStoneWastage(Number(first?.stoneWastage) > 0 ? money(first.stoneWastage) : '');
        setDraftStoneCost(Number(first?.stoneWt) > 0 ? (Number(first?.stoneCost) || 0).toFixed(2) : '');
        setDraftGramRate(moneyIn(first?.gramRate));
        setDraftChargeType(first?.chargeType || '');
        setDraftChargeAmt(moneyIn(first?.chargeAmt));
        setDraftImage1(first?.image1 || '');
        setDraftImage2(first?.image2 || '');
        const empty = (v?: string) => (!v || v === '-' ? '' : v);
        setCustomerName(empty(data.customerName));
        setCustomerPhone(empty(data.customerPhone));
        setCustomerId(data.customerId || 0);
        setIsTaxBill(false);
        setIsCommission(false);
        setExtraDisc('0');
        setMode('1');
        setPayType('1');
        setCashPaid((() => {
          const paid = (data.cashPaid || 0) + (data.bankPaid || 0);
          return paid > 0.0005 ? money(paid) : '';
        })());
        setBankPaid('0');
        setBalance(money(data.balance || 0));
        setExchangePoint(data.exchangePoint || 0);
        setCustomerAdvance(Number(data.advance) || 0);
        setAdvanceUsed(0);
        loadedCustomerIdRef.current = data.customerId || 0;
        savedBillExtraRef.current = Math.max(0, ((data.cashPaid || 0) + (data.bankPaid || 0)) - (data.payable || 0));
        toast.info(`Editing bill ${data.billDisplay}`);
      } catch (err: any) {
        if (!live) return;
        toast.error(err?.response?.data?.data?.error || 'Could not load bill for edit');
      }
    })();
    return () => { live = false; };
  }, [searchParams]);

  const gold = useMemo(() => {
    const finishing = parseWt(price);
    const wastageWt = parseWt(draftMetalWt);
    const stoneWt = parseWt(draftStoneWt);
    const stoneWastage = parseWt(draftStoneWastage);
    const totalWt = calcTotalWt(finishing, stoneWt, stoneWastage, parseWt(draftPurity), parseWt(draftPercent));
    const stoneOn = stoneWt > 0;
    const stoneCost = stoneOn ? parseWt(draftStoneCost) : 0;
    const gramRate = parseWt(draftGramRate);
    const typeCost = parseWt(draftChargeAmt);
    const rateAmt = gramRate > 0 ? Math.round((totalWt * gramRate + Number.EPSILON) * 100) / 100 : 0;
    const amount = Math.round((stoneCost + rateAmt + typeCost + Number.EPSILON) * 100) / 100;
    return {
      finishing,
      wastageWt,
      stoneWt,
      stoneWastage,
      totalWt,
      stoneOn,
      stoneCost,
      gramRate,
      rateAmt,
      typeCost,
      amount,
      chargeType: draftChargeType.trim(),
    };
  }, [price, draftMetalWt, draftStoneWt, draftStoneWastage, draftStoneCost, draftGramRate, draftChargeAmt, draftChargeType, draftPurity, draftPercent]);

  const totals = useMemo(() => ({
    priceTotal: gold.finishing,
    finishingTotal: gold.finishing,
    wastageTotal: gold.wastageWt,
    discountTotal: 0,
    commissionTotal: 0,
    grandTotal: Math.max(0, gold.totalWt),
  }), [gold]);

  const extra = 0;
  const exchCredit = 0;
  const payable = Math.max(0, totals.grandTotal);
  const cashAmt = parseFloat(cashPaid) || 0;
  const usedAdvance = Math.max(0, Number(advanceUsed) || 0);
  const paidAmt = cashAmt + usedAdvance;
  const dueAmt = Math.max(0, payable - paidAmt);
  const extraAmt = Math.max(0, paidAmt - payable);
  const weightsPending = !!search.trim() && payable < 0.001;
  const usableAdvance = Math.max(
    0,
    customerAdvance - (customerId > 0 && customerId === loadedCustomerIdRef.current ? savedBillExtraRef.current : 0)
  );
  const missingName = !customerName.trim() || customerName.trim() === '-';
  const missingPhone = !customerPhone.trim() || customerPhone.trim() === '-';
  const needsCustomer = missingName || missingPhone;

  useEffect(() => {
    if (!bypassCap && totals.priceTotal > 0 && discPer < 100) {
      const maxAllowed = (totals.priceTotal * discPer) / 100;
      if (totals.discountTotal + extra > maxAllowed) {
        const maxExtra = Math.max(0, Math.floor(maxAllowed - totals.discountTotal));
        setExtraDisc(String(maxExtra));
        toast.warn(`Max extra discount is ${discPer}% of price total.`);
      }
    }
  }, [extraDisc, totals, discPer, bypassCap]);

  useEffect(() => {
    const afterExtra = Math.max(0, totals.grandTotal - extra);
    const maxUse = Math.min(exchangePoint, afterExtra);
    if (exchangeUsed > maxUse) setExchangeUsed(maxUse);
  }, [totals.grandTotal, extra, exchangePoint, exchangeUsed]);

  useEffect(() => {
    if (!autoPay.current) return;
    setMode('1');
    setPayType('1');
    setCashPaid(payable > 0.0005 ? wastage(payable) : '');
    setBankPaid('0');
    setBalance('0');
  }, [payable, payEpoch]);

  useEffect(() => {
    setBalance(money(Math.max(0, payable - (parseFloat(cashPaid) || 0))));
  }, [payable, cashPaid]);

  useEffect(() => {
    custHitRef.current?.scrollIntoView({ block: 'nearest' });
  }, [custIndex, customerHits, custField]);

  useEffect(() => {
    hitRef.current?.scrollIntoView({ block: 'nearest' });
  }, [hitIndex, nameHits]);

  const clearCustSuggest = () => {
    custSearchSeq.current += 1;
    setCustomerHits([]);
    setCustField(null);
    setCustIndex(0);
  };

  const searchCustomers = async (query: string | undefined, phone: string | undefined, field: 'name' | 'phone') => {
    const seq = ++custSearchSeq.current;
    setCustField(field);
    setCustIndex(0);
    const tooShort = field === 'name'
      ? !query || query.trim().length < 1
      : !phone || phone.trim().length < 2;
    if (tooShort) {
      setCustomerHits([]);
      setCustField(null);
      return;
    }
    try {
      const res: any = await api.searchCustomers(query, phone);
      if (seq !== custSearchSeq.current) return;
      const hits: Customer[] = res?.data || [];
      setCustomerHits(hits);
      setCustIndex(0);
      setCustField(hits.length ? field : null);
    } catch {
      if (seq !== custSearchSeq.current) return;
      setCustomerHits([]);
      setCustField(null);
    }
  };

  const pickCustomer = (c: Customer) => {
    markSaleDraft();
    setCustomerId(c.id);
    setCustomerName(c.name);
    setCustomerPhone(c.phone === '-' ? '' : c.phone);
    setExchangePoint(c.exchangePoint || 0);
    setExchangeUsed(0);
    setCustomerAdvance(Number(c.advance) || 0);
    setAdvanceUsed(0);
    clearCustSuggest();
  };

  const onCustomerKey = (field: 'name' | 'phone') => (e: React.KeyboardEvent<HTMLInputElement>) => {
    const open = custField === field && customerHits.length > 0;
    if (!open) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCustIndex((i) => Math.min(customerHits.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCustIndex((i) => Math.max(0, i - 1));
    } else if (e.key === 'Escape') {
      e.preventDefault();
      clearCustSuggest();
    } else if (e.key === 'Enter' || (e.key === 'Tab' && !e.shiftKey)) {
      e.preventDefault();
      const pick = customerHits[Math.min(custIndex, customerHits.length - 1)] || customerHits[0];
      if (pick) pickCustomer(pick);
      if (e.key === 'Tab') {
        if (field === 'name') custPhoneRef.current?.focus();
        else searchRef.current?.focus();
      }
    }
  };

  const customerSuggest = (field: 'name' | 'phone') => (
    custField === field && customerHits.length > 0 ? (
      <div className="pos-suggest" role="listbox">
        {customerHits.map((c, i) => (
          <button
            key={c.id}
            type="button"
            role="option"
            aria-selected={i === custIndex}
            ref={i === custIndex ? custHitRef : undefined}
            className={i === custIndex ? 'on' : ''}
            onMouseEnter={() => setCustIndex(i)}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => pickCustomer(c)}
          >
            {c.name} {c.phone && c.phone !== '-' ? `· ${c.phone}` : ''}
            {Number(c.advance) > 0.001 ? ` · Adv ${money(Number(c.advance))}` : ''}
          </button>
        ))}
      </div>
    ) : null
  );

  const focusQty = () => {
    requestAnimationFrame(() => {
      sizeRef.current?.focus();
      sizeRef.current?.select();
    });
  };

  const matchesPending = (val: string, p: Product | null) => {
    if (!p) return false;
    const v = val.trim().toLowerCase();
    return v === String(p.code).toLowerCase()
      || v === String(p.name).toLowerCase()
      || v === `${p.code} - ${p.name}`.toLowerCase();
  };

  const applyProduct = (p: Product) => {
    setPending(p);
    setSearch(p.name);
    setStock(p.stock ?? 0);
    setUnitSel('');
    setNameHits([]);
    setHitIndex(0);
    focusQty();
  };

  const lookupByCode = async (code: string) => {
    const res: any = await api.productByCode(code);
    if (res?.data) {
      applyProduct(res.data);
      return true;
    }
    return false;
  };

  const lookupByName = async (name: string) => {
    const res: any = await api.productByName(name);
    if (res?.data) {
      applyProduct(res.data);
      return true;
    }
    return false;
  };

  const onSearchChange = async (value: string) => {
    markSaleDraft();
    setSearch(value);
    if (pending && value.trim().toLowerCase() !== pending.name.toLowerCase()) {
      setPending(null);
    }
    if (value.trim().length < 1) {
      setNameHits([]);
      setHitIndex(0);
      return;
    }
    const res: any = await api.searchProducts(value.trim());
    setNameHits(res?.data || []);
    setHitIndex(0);
  };

  const pickSearchHit = async (name: string) => {
    if (!(await lookupByName(name))) {
      setSearch(name);
      setPending(null);
      setNameHits([]);
      setHitIndex(0);
      focusQty();
    }
  };

  const onSearchKey = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    const open = nameHits.length > 0;
    if (open && e.key === 'ArrowDown') {
      e.preventDefault();
      setHitIndex((i) => Math.min(nameHits.length - 1, i + 1));
      return;
    }
    if (open && e.key === 'ArrowUp') {
      e.preventDefault();
      setHitIndex((i) => Math.max(0, i - 1));
      return;
    }
    if (open && e.key === 'Escape') {
      e.preventDefault();
      setNameHits([]);
      setHitIndex(0);
      return;
    }
    if (e.key !== 'Enter' && e.key !== 'Tab') return;
    e.preventDefault();
    const val = search.trim();
    if (!val) return;
    if (matchesPending(val, pending)) {
      focusQty();
      return;
    }
    if (open) {
      const name = nameHits[Math.min(hitIndex, nameHits.length - 1)] || nameHits[0];
      if (name) {
        await pickSearchHit(name);
        return;
      }
    }
    const labeled = val.match(/^(.+?)\s+-\s+(.+)$/);
    if (labeled) {
      if (await lookupByCode(labeled[1].trim())) return;
    }
    if (await lookupByCode(val)) return;
    if (await lookupByName(val)) return;
    setPending(null);
    setNameHits([]);
    setHitIndex(0);
    focusQty();
  };

  const addedQty = (productId: number) =>
    lines.filter((l) => l.productId === productId).reduce((s, l) => s + l.qty, 0);

  const visibleProducts = useMemo(() => {
    const q = menuQuery.trim().toLowerCase();
    return menuProducts.filter((p) => {
      if (menuCategory !== 0 && Number(p.categoryId) !== menuCategory) return false;
      if (!q) return true;
      return (p.name || '').toLowerCase().includes(q) || String(p.code || '').toLowerCase().includes(q);
    });
  }, [menuProducts, menuCategory, menuQuery]);

  const lineDiscountFromMaster = (subtotal: number, p: Product) => {
    const rawType = Number(p.discType) || 0;
    if (rawType !== 1 && rawType !== 2) {
      return { discType: 1 as const, discInput: 0, discount: 0 };
    }
    const discType = rawType as 1 | 2;
    let discInput = Number(p.productDiscount) || 0;
    if (discType === 2) discInput = Math.min(100, discInput);
    else discInput = Math.min(subtotal, discInput);
    const discount = discType === 2 ? (subtotal * discInput) / 100 : discInput;
    return { discType, discInput, discount };
  };

  const buildLine = (p: Product, qtyInput: number, unitPrice: number, unitChoice: string, key: number): Line => {
    const unitName = (p.unitName || '').toLowerCase();
    let actualQty = qtyInput;
    let displayUnit = p.convertionUnit || p.unitName;
    if ((unitName === 'kg' || unitName === 'kgs') && unitChoice === 'gram') {
      actualQty = qtyInput / 1000;
      displayUnit = 'Gram';
    } else if (unitName === 'kg' || unitName === 'kgs') {
      displayUnit = 'KG';
    }
    const subtotal = actualQty * unitPrice;
    const commission = isCommission ? p.commission * actualQty : 0;
    const disc = lineDiscountFromMaster(subtotal, p);
    return {
      key,
      productId: p.id,
      code: p.code,
      name: p.name,
      qty: actualQty,
      displayQty: qtyInput,
      displayUnit,
      price: unitPrice,
      discType: disc.discType,
      discInput: disc.discInput,
      discount: disc.discount,
      commissionPer: p.commission,
      commission,
      total: subtotal - disc.discount - commission,
      batchId: p.batchId,
      image1: '',
      image2: '',
      metalWt: 0,
      itemSize: '',
      purity: 0,
      ...blankGold,
    };
  };

  const draftGold = () => ({
    wastagePer: parseWt(draftPercent),
    stoneWt: parseWt(draftStoneWt),
    stoneWastage: parseWt(draftStoneWastage),
    stoneCost: parseWt(draftStoneWt) > 0 ? parseWt(draftStoneCost) : 0,
    gramRate: parseWt(draftGramRate),
    chargeType: draftChargeType.trim(),
    chargeAmt: parseWt(draftChargeAmt),
  });

  const addProduct = () => {
    const itemName = search.trim();
    if (!itemName) {
      toast.error('Enter item name');
      searchRef.current?.focus();
      return;
    }
    const unitPrice = parseWt(price);
    const metalWt = parseWt(draftMetalWt);
    const purity = parseWt(draftPurity);
    markSaleDraft();
    const stamp = linesStampRef.current;
    setLines((prev) => {
      if (linesStampRef.current !== stamp) return prev;
      const key = prev.reduce((m, l) => Math.max(m, l.key), 0) + 1;
      const itemSize = draftSize.trim();
      const line: Line = pending && matchesPending(itemName, pending)
        ? { ...buildLine(pending, 1, unitPrice, '', key), image1: draftImage1, image2: draftImage2, metalWt, itemSize, purity, ...draftGold() }
        : {
          key,
          productId: 0,
          code: '',
          name: itemName,
          qty: 1,
          displayQty: 1,
          displayUnit: '',
          price: unitPrice,
          discType: 1 as const,
          discInput: 0,
          discount: 0,
          commissionPer: 0,
          commission: 0,
          total: unitPrice,
          batchId: 0,
          image1: draftImage1,
          image2: draftImage2,
          metalWt,
          itemSize,
          purity,
          ...draftGold(),
        };
      return [...prev, line];
    });
    if (editingHoldIdRef.current <= 0) clearHoldTracking();
    setPending(null);
    setSearch('');
    setQty('1');
    setPrice('');
    setUnitSel('');
    setStock(null);
    setDraftImage1('');
    setDraftImage2('');
    setDraftMetalWt('');
    setDraftSize('');
    setDraftPurity('');
    setDraftPercent('');
    setDraftStoneWt('');
    setDraftStoneWastage('');
    setDraftStoneCost('');
    setDraftGramRate('');
    setDraftChargeType('');
    setDraftChargeAmt('');
    setNameHits([]);
    searchRef.current?.focus();
  };

  const uploadItemImage = async (file: File, slot: string) => {
    setUploadingSlot(slot);
    try {
      const compressed = await compressImage(file);
      const res: any = await api.uploadImage(compressed);
      const fileName = res?.data?.fileName || res?.fileName;
      if (!fileName) {
        toast.error('Image upload failed');
        return;
      }
      if (slot === 'draft1') setDraftImage1(fileName);
      else if (slot === 'draft2') setDraftImage2(fileName);
      else {
        const match = slot.match(/^line-(\d+)-([12])$/);
        if (match) {
          const key = Number(match[1]);
          const which = match[2] === '1' ? 'image1' : 'image2';
          setLines((prev) => prev.map((line) => (line.key === key ? { ...line, [which]: fileName } : line)));
        }
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.data?.error || err?.message || 'Image upload failed');
    } finally {
      setUploadingSlot(null);
    }
  };

  const addMenuProduct = (p: Product) => {
    const unitPrice = Number(p.mrp ?? 0);
    if (!Number.isFinite(unitPrice)) {
      toast.error('Enter quantity and price');
      return;
    }
    const already = addedQty(p.id);
    const available = (p.stock ?? 0) - already;
    if (!canBillWithoutStock && 1 > available) {
      toast.warn(`Stock limit. Available to add: ${available}`);
      return;
    }
    const existing = lines.find((l) => l.productId === p.id);
    if (existing) {
      updateLineQtyPrice(existing.key, existing.qty + 1, existing.price);
      return;
    }
    const stamp = linesStampRef.current;
    setLines((prev) => {
      if (linesStampRef.current !== stamp) return prev;
      return [...prev, buildLine(p, 1, unitPrice, '', prev.reduce((m, l) => Math.max(m, l.key), 0) + 1)];
    });
    if (editingHoldIdRef.current <= 0) clearHoldTracking();
  };

  const lineAmount = (line: Line) => (isCommission ? line.total : line.qty * line.price - line.discount);

  const changeMenuQty = (line: Line, delta: number) => {
    const next = line.qty + delta;
    if (next <= 0) {
      removeLine(line.key);
      return;
    }
    if (delta > 0) {
      const product = menuProducts.find((p) => p.id === line.productId);
      const already = addedQty(line.productId);
      const available = (product?.stock ?? 0) - already;
      if (!canBillWithoutStock && 1 > available) {
        toast.warn(`Stock limit. Available to add: ${available}`);
        return;
      }
    }
    updateLineQtyPrice(line.key, next, line.price);
  };

  const updateLineDisc = (key: number, discType: 1 | 2, discInput: number) => {
    setLines((prev) =>
      prev.map((line) => {
        if (line.key !== key) return line;
        const subtotal = line.qty * line.price;
        let input = discInput;
        if (discType === 2) input = Math.min(100, input);
        else input = Math.min(subtotal, input);
        const discount = discType === 2 ? (subtotal * input) / 100 : input;
        const commission = isCommission ? line.commissionPer * line.qty : 0;
        return { ...line, discType, discInput: input, discount, commission, total: subtotal - discount - commission };
      })
    );
  };

  const updateLineQtyPrice = (key: number, qtyVal: number, priceVal: number) => {
    setLines((prev) =>
      prev.map((line) => {
        if (line.key !== key) return line;
        const nextQty = qtyVal > 0 ? qtyVal : line.qty;
        const nextPrice = priceVal >= 0 ? priceVal : line.price;
        const subtotal = nextQty * nextPrice;
        let discInput = line.discInput;
        if (line.discType === 2) discInput = Math.min(100, discInput);
        else discInput = Math.min(subtotal, discInput);
        const discount = line.discType === 2 ? (subtotal * discInput) / 100 : discInput;
        const commission = isCommission ? line.commissionPer * nextQty : 0;
        return {
          ...line,
          qty: nextQty,
          displayQty: nextQty,
          price: nextPrice,
          discInput,
          discount,
          commission,
          total: subtotal - discount - commission,
        };
      })
    );
  };

  const removeLine = (key: number) => setLines((prev) => prev.filter((l) => l.key !== key));

  const updateLineMetalWt = (key: number, value: string) => {
    const metalWt = parseWt(value);
    setLines((prev) => prev.map((line) => (line.key === key ? { ...line, metalWt } : line)));
  };

  const updateLineSize = (key: number, value: string) => {
    setLines((prev) => prev.map((line) => (line.key === key ? { ...line, itemSize: value } : line)));
  };

  const currentGoldLine = (): Line | null => {
    const itemName = search.trim();
    if (!itemName) return null;
    const unitPrice = parseWt(price);
    const metalWt = parseWt(draftMetalWt);
    const itemSize = draftSize.trim();
    const purity = parseWt(draftPurity);
    const extra = draftGold();
    if (pending && matchesPending(itemName, pending)) {
      return { ...buildLine(pending, 1, unitPrice, '', 1), image1: draftImage1, image2: draftImage2, metalWt, itemSize, purity, ...extra };
    }
    return {
      key: 1,
      productId: 0,
      code: '',
      name: itemName,
      qty: 1,
      displayQty: 1,
      displayUnit: '',
      price: unitPrice,
      discType: 1,
      discInput: 0,
      discount: 0,
      commissionPer: 0,
      commission: 0,
      total: unitPrice,
      batchId: 0,
      image1: draftImage1,
      image2: draftImage2,
      metalWt,
      itemSize,
      purity,
      ...extra,
    };
  };

  const collectProducts = () => {
    const line = currentGoldLine();
    if (!line) return [];
    return [{
      id: line.productId,
      name: line.name,
      qty: line.qty || 1,
      price: line.price,
      discount: line.discount,
      total: isCommission ? line.total : line.qty * line.price - line.discount,
      batchId: line.batchId,
      commission: isCommission ? line.commissionPer : 0,
      image1: line.image1 || '',
      image2: line.image2 || '',
      metalWt: line.metalWt || 0,
      itemSize: (line.itemSize || '').trim(),
      purity: line.purity || 0,
      wastagePer: line.wastagePer || 0,
      stoneWt: line.stoneWt || 0,
      stoneWastage: line.stoneWastage || 0,
      stoneCost: line.stoneCost || 0,
      gramRate: line.gramRate || 0,
      chargeType: (line.chargeType || '').trim(),
      chargeAmt: line.chargeAmt || 0,
    }];
  };

  const payloadBase = () => ({
    customerName: customerName || '-',
    customerPhn: customerPhone || '-',
    customerId,
    isEligibleForCommission: 0,
    priceCategory: 3,
    isTaxBill: 0,
    finalDiscount: 0,
    payableAmount: payable,
    grandTotal: totals.grandTotal,
    priceTotal: totals.grandTotal,
    discountTotal: totals.discountTotal,
    quotationId,
    products: collectProducts(),
  });

  const holdPayloadBase = () => {
    const { quotationId: _omit, ...rest } = payloadBase();
    return rest;
  };

  const activeHoldId = () => {
    const id = Number(editingHoldIdRef.current);
    return Number.isFinite(id) && id > 0 ? id : 0;
  };

  const isEditingHold = activeHoldId() > 0;

  const clearHoldTracking = () => {
    editingHoldIdRef.current = 0;
    setQuotationId(0);
    setHoldNo('');
  };

  const markSaleDraft = () => {
    saleTouchGenRef.current = cartGenRef.current;
  };

  const applySaleDefaults = () => {
    setCustomerName('');
    setCustomerPhone('');
    setCustomerId(0);
    clearCustSuggest();
    setExchangePoint(0);
    setExchangeUsed(0);
    setCustomerAdvance(0);
    setAdvanceUsed(0);
    savedBillExtraRef.current = 0;
    loadedCustomerIdRef.current = 0;
    setBypassCap(false);
    setIsTaxBill(false);
    setIsCommission(false);
    setExtraDisc('0');
    setMode('1');
    setPayType('1');
    setCashPaid('');
    setBankPaid('0');
    setBalance('0');
  };

  const showHoldBadge = quotationId > 0 && !!holdNo && lines.length > 0;
  const showSavedBill = !!savedNo && savedStamp === billStamp && !editBillId;

  const openSave = () => {
    void saveBill();
  };

  const saveBill = async () => {
    if (showSavedBill) return;
    if (!currentGoldLine()) {
      toast.error('Enter item name.');
      searchRef.current?.focus();
      return;
    }
    const cash = parseFloat(cashPaid) || 0;
    const bank = 0;
    const paid = cash + usedAdvance;
    const due = Math.max(0, payable - paid);
    if (cash < 0) {
      toast.error('Collected wt cannot be negative.');
      return;
    }
    if (!customerName.trim() || customerName.trim() === '-') {
      toast.error('Enter customer name.');
      return;
    }
    if (!customerPhone.trim() || customerPhone.trim() === '-') {
      toast.error('Enter customer phone.');
      return;
    }
    if (gold.stoneOn && !draftStoneCost.trim()) {
      toast.error('Enter stone cost.');
      stoneCostRef.current?.focus();
      return;
    }
    setSaving(true);
    const session = billSessionRef.current;
    try {
      const payload = {
        ...payloadBase(),
        cashPaid: cash,
        bankPaid: bank,
        advanceUsed: usedAdvance,
        mode: 1,
        type: 1,
        balance: due,
        quotationId: editBillId ? 0 : quotationId,
        exchangePointUsed: editBillId ? 0 : exchangeUsed,
      };
      const res: any = editBillId
        ? await api.updateBill(editBillId, payload)
        : await api.saveBill(payload);
      if (session !== billSessionRef.current || session !== billStampRef.current) return;
      if (res?.success) {
        setSavedNo(res.data.billDisplay);
        setSavedStamp(session);
        if (quotationId > 0) clearHoldTracking();
        toast.success(editBillId ? `Bill updated: ${res.data.billDisplay}` : `Bill saved: ${res.data.billDisplay}`);
      } else {
        toast.error(res?.data?.error || (editBillId ? 'Update failed' : 'Save failed'));
      }
    } catch (e: any) {
      toast.error(e?.response?.data?.data?.error || (editBillId ? 'Update failed' : 'Save failed'));
    } finally {
      setSaving(false);
    }
  };

  const saveHold = async () => {
    if (holdSavingRef.current) return;
    if (lines.length === 0) {
      toast.error('Add products before hold.');
      return;
    }
    const existingHoldId = activeHoldId();
    const session = billSessionRef.current;
    holdSavingRef.current = true;
    setHolding(true);
    let holdSaved = false;
    try {
      const res: any = await api.saveHold({
        ...holdPayloadBase(),
        quotationId: existingHoldId > 0 ? existingHoldId : null,
      });
      if (session !== billSessionRef.current) return;
      if (res?.success) {
        holdSaved = true;
        const quotId = Number(res.data?.quotId || existingHoldId || 0);
        const quotNo = res.data?.quotNo || holdNo;
        const isUpdate = existingHoldId > 0;
        if (isUpdate) {
          if (quotId > 0) {
            editingHoldIdRef.current = quotId;
            setQuotationId(quotId);
          }
          setHoldNo(quotNo);
          toast.success(`Hold updated: ${quotNo}`);
        } else {
          toast.success(`Held as ${quotNo}`);
          setSaveOpen(false);
          resetBillingScreen();
          if (quotId > 0) {
            try {
              await printHoldDoc(quotId);
            } catch {
              /* printHoldDoc shows its own toast */
            }
          }
        }
      } else if (session === billSessionRef.current) {
        toast.error(res?.data?.error || 'Hold failed');
      }
    } catch (e: any) {
      if (!holdSaved && session === billSessionRef.current) {
        toast.error(e?.response?.data?.data?.error || e?.message || 'Hold failed');
      }
    } finally {
      holdSavingRef.current = false;
      setHolding(false);
    }
  };

  const openHolds = async () => {
    const res: any = await api.holds();
    setHolds(res?.data || []);
    setHoldOpen(true);
  };

  const dashToEmpty = (v?: string) => (!v || v === '-' ? '' : v);

  const holdLineItems = (res: any): any[] => {
    if (Array.isArray(res)) return res;
    if (Array.isArray(res?.data)) return res.data;
    if (Array.isArray(res?.data?.lines)) return res.data.lines;
    if (Array.isArray(res?.lines)) return res.lines;
    return [];
  };

  const applyHoldForm = (header: any, items: any[]) => {
    const name = header?.customerName ?? header?.cusName;
    const phone = header?.customerPhone ?? header?.cusPhn;
    const extraValue = header?.extraDiscount ?? header?.extraDisc ?? 0;
    const anyGst = items.some((item) => Number(item?.gst) > 0);
    const commissionFromTotal = items.some((item) => {
      const net = Number(item?.qty) * Number(item?.price) - Number(item?.discount || 0);
      return Number(item?.total) + 0.05 < net;
    });
    const taxFlag = header?.isTaxBill;
    const commissionFlag = header?.isCommission ?? header?.isEligibleForCommission;
    setCustomerName(dashToEmpty(name));
    setCustomerPhone(dashToEmpty(phone));
    setCustomerId(Number(header?.customerId) || 0);
    setBypassCap(true);
    setExtraDisc('0');
    setIsTaxBill(false);
    setIsCommission(false);
    saleTouchGenRef.current = cartGenRef.current;
  };

  const loadHold = async (row: any, mode: 'bill' | 'edit' = 'bill') => {
    const holdId = Number(row?.id ?? row?.quotId ?? 0);
    if (!holdId) {
      toast.error('Could not identify hold');
      return;
    }
    const holdMeta = {
      billDisplay: row.billDisplay || '',
      customerName: row.customerName,
      customerPhone: row.customerPhone,
      customerId: row.customerId || 0,
      extraDiscount: row.extraDiscount || 0,
      isTaxBill: row.isTaxBill,
      isCommission: row.isCommission,
    };
    if (loadHoldBusyIdRef.current === holdId) return;
    loadHoldBusyIdRef.current = holdId;
    const seq = ++loadHoldSeqRef.current;
    const loadSession = billSessionRef.current;
    const lineStamp = linesStampRef.current;
    editingHoldIdRef.current = holdId;
    setQuotationId(holdId);
    setHoldNo(holdMeta.billDisplay);
    applyHoldForm(holdMeta, []);
    setHoldOpen(false);

    let items: any[];
    let res: any;
    try {
      res = await api.holdDetails(holdId);
      if (seq !== loadHoldSeqRef.current) return;
      if (loadSession !== billSessionRef.current) return;
      items = holdLineItems(res);
      if (!items.length) {
        toast.error('Hold has no line items');
        if (loadSession === billSessionRef.current && editingHoldIdRef.current === holdId) {
          clearHoldTracking();
        }
        return;
      }
    } catch (err: any) {
      if (seq !== loadHoldSeqRef.current) return;
      toast.error(err?.response?.data?.data?.error || err?.message || 'Could not load hold');
      if (loadSession === billSessionRef.current && editingHoldIdRef.current === holdId) {
        clearHoldTracking();
      }
      return;
    } finally {
      if (loadHoldBusyIdRef.current === holdId) loadHoldBusyIdRef.current = 0;
    }

    const holdStillCurrent = () =>
      seq === loadHoldSeqRef.current
      && loadSession === billSessionRef.current
      && lineStamp === linesStampRef.current
      && editingHoldIdRef.current === holdId;
    if (!holdStillCurrent()) return;

    autoPay.current = false;
    setSavedNo('');
    setEditBillId(0);
    setEditBillNo('');
    setOrderId(0);
    const mapped = items.map((item, idx) => ({
      key: idx + 1,
      productId: item.productId,
      code: item.code,
      name: item.name,
      qty: item.qty,
      displayQty: item.qty,
      displayUnit: item.unitName || '',
      price: item.price,
      discType: 1 as const,
      discInput: item.discount,
      discount: item.discount,
      commissionPer: item.commission || 0,
      commission: (item.commission || 0) * item.qty,
      total: item.total,
      batchId: item.batchId,
      image1: item.image1 || '',
      image2: item.image2 || '',
      metalWt: Number(item.metalWt) || 0,
      itemSize: item.itemSize || '',
      purity: Number(item.purity) || 0,
      ...goldFromSaved(item),
    }));
    setLines((prev) => (holdStillCurrent() ? mapped : prev));
    if (!holdStillCurrent()) return;

    setLineKey(items.length + 1);
    editingHoldIdRef.current = holdId;
    setQuotationId(holdId);
    setHoldNo(holdMeta.billDisplay);
    const header = res?.data && !Array.isArray(res.data) ? { ...holdMeta, ...res.data } : holdMeta;
    if (holdStillCurrent()) applyHoldForm(header, items);
    toast.success(mode === 'edit' ? `Editing hold ${holdMeta.billDisplay}` : 'Hold loaded into bill');
  };

  const printHoldDoc = async (id: number) => {
    try {
      const res: any = await api.printHold(id);
      if (!res?.success || !res.data) {
        toast.error('Could not load hold print');
        return;
      }
      setA4Bill(res.data);
    } catch {
      toast.error('Could not load hold print');
    }
  };

  const openExchange = () => {
    const no = (savedNo || editBillNo || '').trim();
    navigate(no
      ? `${routerPathNames.admin.exchange}?billNo=${encodeURIComponent(no)}`
      : routerPathNames.admin.exchange);
  };

  const openDupe = async () => {
    const res: any = await api.recentBills();
    setRecent(res?.data || []);
    setDupeOpen(true);
  };

  const openOrders = async () => {
    try {
      const [pending, delivered] = await Promise.all([
        ordersApi.list('pending'),
        ordersApi.list('delivered'),
      ]);
      setOrders([
        ...(((pending as any)?.data) || []),
        ...(((delivered as any)?.data) || []),
      ]);
      setOrderOpen(true);
    } catch {
      toast.error('Could not load orders');
    }
  };

  const loadOrder = async (id: number) => {
    try {
      const res: any = await ordersApi.detail(id);
      const items: any[] = res?.data?.items || [];
      if (!items.length) {
        toast.error('This order has no items');
        return;
      }
      const next: Line[] = [];
      for (let idx = 0; idx < items.length; idx += 1) {
        const item = items[idx];
        let batchId = 0;
        try {
          const prod: any = await api.productByCode(item.code);
          batchId = prod?.data?.batchId || 0;
        } catch {
          batchId = 0;
        }
        next.push({
          key: idx + 1,
          productId: item.prodId,
          code: item.code,
          name: item.productName,
          qty: item.qty,
          displayQty: item.qty,
          displayUnit: '',
          price: item.price,
          discType: 1,
          discInput: 0,
          discount: 0,
          commissionPer: 0,
          commission: 0,
          total: item.total,
          batchId,
          image1: '',
          image2: '',
          metalWt: Number(item.metalWt) || 0,
          itemSize: item.itemSize || '',
          purity: Number(item.purity) || 0,
          ...blankGold,
        });
      }
      setLines(next);
      setLineKey(items.length + 1);
      setOrderId(id);
      setOrderOpen(false);
      toast.info(`Order ${res?.data?.orderNo || id} loaded`);
    } catch {
      toast.error('Could not load order');
    }
  };

  const printA4SameTab = async (billNo: string) => {
    try {
      const res: any = await api.printBill(billNo);
      if (!res?.success || !res.data) {
        toast.error('Could not load A4 invoice');
        return;
      }
      setA4Bill(res.data);
    } catch {
      toast.error('Could not load A4 invoice');
    }
  };

  const printBill = async (billNo = savedNo || editBillNo || dupeNo) => {
    if (!billNo && quotationId) {
      await printHoldDoc(quotationId);
      return;
    }
    if (!billNo) {
      toast.error('Save the bill first');
      return;
    }
    try {
      const res: any = await api.dispatchPrint(billNo);
      const result = await handleThermalDispatch(res, (no) => printA4SameTab(no || billNo));
      if (result === 'printed' || result === 'local') {
        toast.success('Receipt printed and cut');
      }
    } catch (e: any) {
      toast.error(e?.response?.data?.data?.error || e?.message || 'Thermal print failed');
    }
  };

  const showHistory = async (line: Line) => {
    const res: any = await api.productHistory(line.productId, customerId || undefined);
    setHistoryName(line.name);
    setHistory(res?.data || []);
  };

  const resetBillingScreen = () => {
    const session = billSessionRef.current + 1;
    billSessionRef.current = session;
    billStampRef.current = session;
    setBillStamp(session);
    setSavedNo('');
    setSavedStamp(-1);
    cartGenRef.current += 1;
    linesStampRef.current += 1;
    loadHoldSeqRef.current += 1;
    editingHoldIdRef.current = 0;
    autoPay.current = true;
    setLines([]);
    setLineKey(1);
    applySaleDefaults();
    setPayEpoch((n) => n + 1);
    setSearch('');
    setNameHits([]);
    setPending(null);
    setQty('1');
    setPrice('');
    setUnitSel('');
    setStock(null);
    setDraftImage1('');
    setDraftImage2('');
    setDraftMetalWt('');
    setDraftSize('');
    setDraftPurity('');
    setDraftPercent('');
    setDraftStoneWt('');
    setDraftStoneWastage('');
    setDraftStoneCost('');
    setDraftGramRate('');
    setDraftChargeType('');
    setDraftChargeAmt('');
    setUploadingSlot(null);
    setSaving(false);
    setHolding(false);
    holdSavingRef.current = false;
    loadHoldBusyIdRef.current = 0;
    saleTouchGenRef.current = -1;
    setSavedNo('');
    clearHoldTracking();
    setSaveOpen(false);
    setKeysOpen(false);
    setOrderOpen(false);
    setHoldOpen(false);
    setDupeOpen(false);
    setHistory(null);
    setHistoryName('');
    setA4Bill(null);
    setOrderId(0);
    setDupeNo('');
    setMenuCategory(0);
    setMenuQuery('');
    setEditBillId(0);
    setEditBillNo('');
    setCancelOpen(false);
    setCancelReason('');
    setCancelling(false);
    if (searchParams.get('edit')) {
      navigate(routerPathNames.billing, { replace: true });
    }
    window.setTimeout(() => custNameRef.current?.focus(), 0);
  };

  const newBill = () => {
    resetBillingScreen();
  };

  const closeSave = () => {
    setSaveOpen(false);
    if (savedNo) resetBillingScreen();
  };

  const cancelEditedBill = async () => {
    if (!editBillId) return;
    if (!cancelReason.trim()) {
      toast.warning('Enter a cancellation reason');
      return;
    }
    setCancelling(true);
    try {
      await adminApi.cancelBill(editBillId, cancelReason.trim());
      toast.success(`Bill ${editBillNo} cancelled`);
      navigate(routerPathNames.admin.monthlyBills);
    } catch (err: any) {
      toast.error(err?.response?.data?.data?.error || err?.message || 'Cancel failed');
    } finally {
      setCancelling(false);
    }
  };

  const kgProduct = pending && ['kg', 'kgs'].includes((pending.unitName || '').toLowerCase());

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void saveBill();
        return;
      }
      if (!e.altKey || e.ctrlKey || e.metaKey) return;
      const k = e.code === 'KeyO' ? 'o'
        : e.code === 'KeyR' ? 'r'
        : e.code === 'KeyS' ? 's'
        : e.code === 'KeyB' ? 'b'
        : e.code === 'KeyP' ? 'p'
        : e.code === 'KeyC' ? 'c'
        : e.key.toLowerCase();
      if (k === 'r') { e.preventDefault(); newBill(); }
      else if (k === 's') { e.preventDefault(); void saveBill(); }
      else if (k === 'b') { e.preventDefault(); void saveBill(); }
      else if (k === 'c') { e.preventDefault(); if (savedNo) newBill(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  useEffect(() => {
    if (!a4Bill) return;
    document.body.classList.add('a4-print-open');
    const close = () => setA4Bill(null);
    window.addEventListener('afterprint', close);
    const t = window.setTimeout(() => window.print(), 300);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('afterprint', close);
      document.body.classList.remove('a4-print-open');
    };
  }, [a4Bill]);

  return (
    <div className="pos-wrap pos-gold-wrap">
      {editBillNo && (
        <div className="pos-banner pos-banner-edit" style={{ margin: billingType === 2 ? '8px 12px 0' : '6px 10px 0' }}>
          Editing Sales Invoice #{editBillNo}
          <button className="pos-btn pos-btn-outline" type="button" onClick={() => navigate(routerPathNames.admin.monthlyBills)}>Back to bills</button>
        </div>
      )}

      {false && billingType === 2 ? (
        <div className="cafe">
          <div className="cafe-menu">
            <div className="cafe-cats">
              <button type="button" className={`cafe-cat${menuCategory === 0 ? ' on' : ''}`} onClick={() => setMenuCategory(0)}>
                <i className="fas fa-th-large" /> All
              </button>
              {categories.map((cat) => (
                <button key={cat.id} type="button" className={`cafe-cat${menuCategory === cat.id ? ' on' : ''}`} onClick={() => setMenuCategory(cat.id)}>{cat.name}</button>
              ))}
            </div>
            <div className="cafe-search">
              <i className="fas fa-search" />
              <input
                value={menuQuery}
                placeholder="Search menu items..."
                onChange={(e) => setMenuQuery(e.target.value)}
              />
            </div>
            <div className="cafe-grid">
              {visibleProducts.length === 0 && (
                <div className="cafe-empty">No products in this category</div>
              )}
              {visibleProducts.map((p) => {
                const qtyInCart = addedQty(p.id);
                const selected = qtyInCart > 0;
                const oos = (p.stock ?? 0) <= 0;
                return (
                  <div
                    key={p.id}
                    role="button"
                    tabIndex={0}
                    className={`cafe-card${selected ? ' in' : ''}`}
                    style={{ backgroundColor: '#fff' }}
                    onClick={() => addMenuProduct(p)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        addMenuProduct(p);
                      }
                    }}
                  >
                    {selected && <span className="cafe-qty-badge">{qtyInCart % 1 === 0 ? qtyInCart : qtyInCart.toFixed(2)}</span>}
                    <span className="cafe-card-icon"><CafeItemIcon /></span>
                    <span className="cafe-card-name">{p.name}</span>
                    <span className="cafe-card-price">{rupee(p.mrp)}</span>
                    {oos && <span className="cafe-card-oos">Out of stock</span>}
                  </div>
                );
              })}
            </div>
          </div>

          <aside className="cafe-order">
            <div className="cafe-order-head">
              <h3>Order</h3>
              <span className="cafe-order-count">{lines.length} {lines.length === 1 ? 'item' : 'items'}</span>
            </div>
            <div className="cafe-order-list">
              {lines.length === 0 && (
                <div className="cafe-order-empty">Tap a product to add it</div>
              )}
              {lines.map((line) => (
                <div key={line.key} className="cafe-line">
                  <div className="cafe-line-info">
                    <div className="cafe-line-name">{line.name}</div>
                    <div className="cafe-line-each">{rupee(line.price)} each</div>
                  </div>
                  <div className="cafe-stepper">
                    <button type="button" className="cafe-step cafe-step-minus" onClick={() => changeMenuQty(line, -1)}>-</button>
                    <span>{line.displayQty % 1 === 0 ? line.displayQty : line.displayQty.toFixed(2)}</span>
                    <button type="button" className="cafe-step cafe-step-plus" onClick={() => changeMenuQty(line, 1)}>+</button>
                  </div>
                  <div className="cafe-line-total">{rupee(lineAmount(line))}</div>
                  <button type="button" className="cafe-line-x" onClick={() => removeLine(line.key)} aria-label="Remove">×</button>
                </div>
              ))}
            </div>
            <div className="cafe-order-foot">
              <div className="cafe-order-total">
                <span>Total</span>
                <strong>{rupee(payable)}</strong>
              </div>
              <div className="cafe-order-tools">
                {!editBillId && (
                  <button className="pos-btn pos-btn-outline" type="button" onClick={openHolds}>HOLD LIST</button>
                )}
                <button className="pos-btn pos-btn-outline" type="button" onClick={() => setKeysOpen(true)}>KEYS</button>
                <button className="pos-btn pos-btn-outline" type="button" onClick={openDupe}>DUP</button>
                <button className="pos-btn pos-btn-outline" type="button" onClick={openExchange}>EXCHANGE</button>
                <button className="pos-btn pos-btn-outline" type="button" onClick={newBill}>REFRESH</button>
              </div>
              {(showSavedBill || editBillNo || showHoldBadge) && (
                <div className="pos-billno" style={{ margin: '4px 0 8px' }}>
                  {showSavedBill || editBillNo ? `Bill No - ${showSavedBill ? savedNo : editBillNo}` : ''}{showHoldBadge ? ` Hold - ${holdNo}` : ''}
                </div>
              )}
              <button
                className={`cafe-place${showSavedBill ? ' saved' : ''}`}
                type="button"
                onClick={openSave}
              >
                <i className="fas fa-check-circle" />
                {showSavedBill ? 'Bill Saved' : editBillId ? 'Update Bill' : 'Place Order'}
              </button>
            </div>
          </aside>
        </div>
      ) : (
        <>
          <div className="pos-top gold-form">
            <section className="gold-sec gold-sec-wide">
            <h3>Customer</h3>
            <div className="gold-form-row gold-form-customer">
              <div className="pos-fg gold-cust-name">
                <span className={`pos-lbl ${missingName ? 'pos-lbl-warn' : ''}`}>Customer *</span>
                <input
                  ref={custNameRef}
                  className={`pos-inp ${missingName ? 'pos-inp-warn' : ''}`}
                  value={customerName}
                  autoComplete="off"
                  placeholder="Name"
                  autoFocus
                  role="combobox"
                  aria-expanded={custField === 'name' && customerHits.length > 0}
                  aria-autocomplete="list"
                  onChange={(e) => {
                    markSaleDraft();
                    setCustomerName(e.target.value);
                    setCustomerId(0);
                    setCustomerAdvance(0);
                    setAdvanceUsed(0);
                    searchCustomers(e.target.value, undefined, 'name');
                  }}
                  onKeyDown={onCustomerKey('name')}
                />
                {customerSuggest('name')}
              </div>
              <div className="pos-fg gold-cust-phone">
                <span className={`pos-lbl ${missingPhone ? 'pos-lbl-warn' : ''}`}>Phone *</span>
                <input
                  ref={custPhoneRef}
                  className={`pos-inp ${missingPhone ? 'pos-inp-warn' : ''}`}
                  value={customerPhone}
                  autoComplete="off"
                  placeholder="Phone"
                  inputMode="tel"
                  role="combobox"
                  aria-expanded={custField === 'phone' && customerHits.length > 0}
                  aria-autocomplete="list"
                  onChange={(e) => {
                    markSaleDraft();
                    setCustomerPhone(e.target.value);
                    setCustomerId(0);
                    setCustomerAdvance(0);
                    setAdvanceUsed(0);
                    searchCustomers(undefined, e.target.value, 'phone');
                  }}
                  onKeyDown={onCustomerKey('phone')}
                />
                {customerSuggest('phone')}
              </div>
            </div>
            </section>

            <section className="gold-sec">
            <h3>Item</h3>
            <div className="gold-grid-2">
              <div className="pos-fg gold-item-name gold-span-2">
                <span className="pos-lbl">Item name</span>
                <input
                  ref={searchRef}
                  className="pos-inp pos-inp-lg"
                  value={search}
                  placeholder="Type item name"
                  onChange={(e) => onSearchChange(e.target.value)}
                  onKeyDown={onSearchKey}
                />
                {nameHits.length > 0 && (
                  <div className="pos-suggest" role="listbox">
                    {nameHits.map((name, i) => (
                      <button
                        key={name}
                        type="button"
                        role="option"
                        aria-selected={i === hitIndex}
                        ref={i === hitIndex ? hitRef : undefined}
                        className={i === hitIndex ? 'on' : ''}
                        onMouseEnter={() => setHitIndex(i)}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => pickSearchHit(name)}
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="pos-fg gold-item-size">
                <span className="pos-lbl">Size</span>
                <input
                  ref={sizeRef}
                  className="pos-inp"
                  value={draftSize}
                  placeholder="Optional"
                  onChange={(e) => setDraftSize(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter' && e.key !== 'Tab') return;
                    e.preventDefault();
                    finishingRef.current?.focus();
                    finishingRef.current?.select();
                  }}
                />
              </div>
              <div className="pos-fg gold-item-amt">
                <span className="pos-lbl">Finishing wt</span>
                <input
                  ref={finishingRef}
                  className="pos-inp"
                  value={price}
                  placeholder="0.000"
                  inputMode="decimal"
                  onChange={(e) => {
                    const value = e.target.value;
                    const had = parseWt(price) > 0;
                    setPrice(value);
                    if (!(parseWt(value) > 0)) {
                      setDraftPurity('');
                      setDraftMetalWt('');
                      return;
                    }
                    const nextPurity = draftPurity.trim() ? draftPurity : (!had ? '92' : draftPurity);
                    if (!had) setDraftPurity((cur) => (cur.trim() ? cur : '92'));
                    setDraftMetalWt(wastageFromPercent(value, draftPercent, nextPurity, draftStoneWt, draftStoneWastage));
                  }}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter' && e.key !== 'Tab') return;
                    e.preventDefault();
                    stoneWtRef.current?.focus();
                    stoneWtRef.current?.select();
                  }}
                />
              </div>
              <div className="pos-fg gold-item-imgs gold-span-2">
                <span className="pos-lbl">Photos</span>
                <div className="pos-img-slots">
                  <ImageSlot
                    fileName={draftImage1}
                    busy={uploadingSlot === 'draft1'}
                    onPick={(file) => void uploadItemImage(file, 'draft1')}
                    onClear={() => setDraftImage1('')}
                  />
                  <ImageSlot
                    fileName={draftImage2}
                    busy={uploadingSlot === 'draft2'}
                    onPick={(file) => void uploadItemImage(file, 'draft2')}
                    onClear={() => setDraftImage2('')}
                  />
                </div>
              </div>
            </div>
            </section>

            <section className="gold-sec">
            <h3>Weight</h3>
            <div className="gold-grid-2">
              <div className="pos-fg gold-item-stone">
                <span className="pos-lbl">Stone wt</span>
                <input
                  ref={stoneWtRef}
                  className="pos-inp"
                  value={draftStoneWt}
                  placeholder="0.000"
                  inputMode="decimal"
                  onChange={(e) => {
                    const value = e.target.value;
                    setDraftStoneWt(value);
                    if (!(parseWt(value) > 0)) setDraftStoneCost('');
                    setDraftMetalWt(wastageFromPercent(price, draftPercent, draftPurity, value, draftStoneWastage));
                  }}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter' && e.key !== 'Tab') return;
                    e.preventDefault();
                    stoneWastageRef.current?.focus();
                    stoneWastageRef.current?.select();
                  }}
                />
              </div>
              <div className="pos-fg gold-item-stone-w">
                <span className="pos-lbl">Stone wastage</span>
                <input
                  ref={stoneWastageRef}
                  className="pos-inp"
                  value={draftStoneWastage}
                  placeholder="0.000"
                  inputMode="decimal"
                  onChange={(e) => {
                    const value = e.target.value;
                    setDraftStoneWastage(value);
                    setDraftMetalWt(wastageFromPercent(price, draftPercent, draftPurity, draftStoneWt, value));
                  }}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter' && e.key !== 'Tab') return;
                    e.preventDefault();
                    const next = parseWt(draftStoneWt) > 0 ? stoneCostRef.current : purityRef.current;
                    next?.focus();
                    next?.select();
                  }}
                />
              </div>
              <div className="pos-fg gold-item-stone-cost gold-span-2">
                <span className={`pos-lbl ${gold.stoneOn && !draftStoneCost.trim() ? 'pos-lbl-warn' : ''}`}>
                  Stone cost{gold.stoneOn ? ' *' : ''}
                </span>
                <input
                  ref={stoneCostRef}
                  className={`pos-inp ${gold.stoneOn && !draftStoneCost.trim() ? 'pos-inp-warn' : ''} ${gold.stoneOn ? '' : 'pos-inp-muted'}`}
                  value={draftStoneCost}
                  placeholder={gold.stoneOn ? '0.00' : 'Enter stone wt first'}
                  inputMode="decimal"
                  disabled={!gold.stoneOn}
                  onChange={(e) => setDraftStoneCost(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter' && e.key !== 'Tab') return;
                    e.preventDefault();
                    purityRef.current?.focus();
                    purityRef.current?.select();
                  }}
                />
              </div>
              <div className="pos-fg gold-item-purity">
                <span className="pos-lbl">Purity</span>
                <input
                  ref={purityRef}
                  className="pos-inp"
                  value={draftPurity}
                  placeholder="92"
                  inputMode="decimal"
                  onChange={(e) => {
                    const value = e.target.value;
                    setDraftPurity(value);
                    setDraftMetalWt(wastageFromPercent(price, draftPercent, value, draftStoneWt, draftStoneWastage));
                  }}
                  onBlur={() => {
                    if (parseWt(price) > 0 && !draftPurity.trim()) {
                      setDraftPurity('92');
                      setDraftMetalWt(wastageFromPercent(price, draftPercent, '92', draftStoneWt, draftStoneWastage));
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter' && e.key !== 'Tab') return;
                    e.preventDefault();
                    percentRef.current?.focus();
                    percentRef.current?.select();
                  }}
                />
              </div>
              <div className="pos-fg gold-item-percent">
                <span className="pos-lbl">Percentage</span>
                <input
                  ref={percentRef}
                  className="pos-inp"
                  value={draftPercent}
                  placeholder="6"
                  inputMode="decimal"
                  onChange={(e) => {
                    setDraftPercent(e.target.value);
                    setDraftMetalWt(wastageFromPercent(price, e.target.value, draftPurity, draftStoneWt, draftStoneWastage));
                  }}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter' && e.key !== 'Tab') return;
                    e.preventDefault();
                    gramRateRef.current?.focus();
                    gramRateRef.current?.select();
                  }}
                />
              </div>
              <div className="pos-fg gold-item-wt gold-span-2">
                <span className="pos-lbl">Wastage wt <em>auto</em></span>
                <input
                  ref={metalWtRef}
                  className="pos-inp pos-inp-muted"
                  value={draftMetalWt}
                  placeholder="0.00"
                  readOnly
                  tabIndex={-1}
                />
              </div>
            </div>
            </section>

            <section className="gold-sec">
            <h3>Charges</h3>
            <div className="gold-grid-2">
              <div className="pos-fg gold-item-rate gold-span-2">
                <span className="pos-lbl">1 gram rate</span>
                <input
                  ref={gramRateRef}
                  className="pos-inp"
                  value={draftGramRate}
                  placeholder="0.00"
                  inputMode="decimal"
                  onChange={(e) => setDraftGramRate(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter' && e.key !== 'Tab') return;
                    e.preventDefault();
                    chargeTypeRef.current?.focus();
                    chargeTypeRef.current?.select();
                  }}
                />
              </div>
              <div className="pos-fg gold-item-type">
                <span className="pos-lbl">Type</span>
                <input
                  ref={chargeTypeRef}
                  className="pos-inp"
                  value={draftChargeType}
                  placeholder="Agmark cost"
                  onChange={(e) => setDraftChargeType(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter' && e.key !== 'Tab') return;
                    e.preventDefault();
                    chargeAmtRef.current?.focus();
                    chargeAmtRef.current?.select();
                  }}
                  />
                </div>
              <div className="pos-fg gold-item-type-cost">
                <span className="pos-lbl">Type cost</span>
                <input
                  ref={chargeAmtRef}
                  className="pos-inp"
                  value={draftChargeAmt}
                  placeholder="0.00"
                  inputMode="decimal"
                  onChange={(e) => setDraftChargeAmt(e.target.value)}
                />
              </div>
            </div>
            </section>

            <section className="gold-sec gold-sec-wide">
            <h3>Result</h3>
            <div className="gold-sum">
              <div className="gold-sum-card">
                <div className="gold-sum-kicker">Total weight</div>
                <div className="gold-sum-row"><span>Finishing</span><b>{money(gold.finishing)}</b></div>
                <div className="gold-sum-row"><span>Wastage</span><b>{wastage(gold.wastageWt)}</b></div>
                <div className="gold-sum-row"><span>Stone</span><b>− {money(gold.stoneWt)}</b></div>
                <div className="gold-sum-row"><span>Stone wastage</span><b>+ {money(gold.stoneWastage)}</b></div>
                <div className="gold-sum-row total"><span>Total wt</span><b>{wastage(payable)} g</b></div>
              </div>
              <div className="gold-sum-card gold-sum-money">
                <div className="gold-sum-kicker">Amount</div>
                <div className="gold-sum-row"><span>Stone cost</span><b>{rupee(gold.stoneCost)}</b></div>
                <div className="gold-sum-row"><span>{wastage(gold.totalWt)} g × {rupee(gold.gramRate)}</span><b>{rupee(gold.rateAmt)}</b></div>
                <div className="gold-sum-row"><span>{gold.chargeType || 'Type cost'}</span><b>{rupee(gold.typeCost)}</b></div>
                <div className="gold-sum-row total"><span>Total amount</span><b>{rupee(gold.amount)}</b></div>
              </div>
            </div>
            </section>

            <section className="gold-sec gold-sec-wide">
            <h3>Collection</h3>
            <div className="gold-form-row gold-form-pay">
              <div className="pos-fg gold-collect">
                <span className="pos-lbl pos-lbl-em">Collected wt</span>
                <input
                  className="pos-inp pos-inp-pay"
                  value={cashPaid}
                  placeholder="0.000"
                  inputMode="decimal"
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => { autoPay.current = false; setCashPaid(e.target.value); }}
                />
              </div>
              <div className={`pos-save-due-chip gold-due-chip ${dueAmt > 0.001 ? 'has-due' : extraAmt > 0.001 ? (weightsPending ? 'advance' : 'over-paid') : 'settled'}`}>
                <span>{dueAmt > 0.001 ? 'Due' : extraAmt > 0.001 ? (weightsPending ? 'Advance' : 'Extra') : 'Due'}</span>
                <strong>{money(dueAmt > 0.001 ? dueAmt : extraAmt)}</strong>
              </div>
              {usableAdvance > 0.001 && (
                <div className="pos-save-advance gold-advance">
                  <span>Advance {money(usableAdvance)}</span>
                  <button
                    className="pos-btn pos-btn-outline"
                    type="button"
                    disabled={payable < 0.001}
                    onClick={() => {
                      const uncovered = Math.max(0, payable - cashAmt);
                      if (uncovered < 0.001) {
                        const use = Math.min(usableAdvance, payable);
                        setAdvanceUsed(use);
                        setCashPaid(money(Math.max(0, payable - use)));
                      } else {
                        setAdvanceUsed(Math.min(usableAdvance, uncovered));
                      }
                    }}
                  >
                    Use advance
                  </button>
                  {usedAdvance > 0.001 && (
                    <button className="pos-btn pos-btn-outline" type="button" onClick={() => setAdvanceUsed(0)}>
                      Clear {money(usedAdvance)}
                    </button>
                  )}
                </div>
              )}
            </div>
            </section>
          </div>

          <div className="pos-bottom gold-bottom">
            <div className="pos-footer">
              <div className="pos-total-box gold-foot-totals">
                <div>
                  <span>Total wt</span>
                  <strong>{wastage(payable)} g</strong>
                </div>
                <div>
                  <span>Amount</span>
                  <strong className="gold-foot-amt">{rupee(gold.amount)}</strong>
                </div>
              </div>
              <div className="pos-acts gold-acts">
                <button className="pos-btn pos-btn-outline gold-desk-only" type="button" onClick={openDupe}>Last Bills</button>
                <button className="pos-btn gold-list-btn" type="button" onClick={() => navigate(routerPathNames.billingList)}>LIST</button>
                <button className="pos-btn pos-btn-outline" type="button" title="Alt+R" onClick={newBill}>REFRESH</button>
                <button
                  className={`pos-btn gold-save-btn ${showSavedBill ? 'pos-btn-saved' : 'pos-btn-navy'}`}
                  type="button"
                  title="Alt+S"
                  disabled={saving || showSavedBill || !!uploadingSlot}
                  onClick={() => void saveBill()}
                >
                  {showSavedBill ? 'BILL SAVED' : saving ? (editBillId ? 'Updating…' : 'Saving…') : (editBillId ? 'UPDATE' : 'SAVE')}
                </button>
                {(showSavedBill || editBillNo) && <div className="pos-billno">Bill No - {showSavedBill ? savedNo : editBillNo}</div>}
                {showHoldBadge && <div className="pos-billno">Hold - {holdNo}</div>}
              </div>
            </div>
          </div>
        </>
      )}

      {keysOpen && (
        <div className="pos-modal-back" onClick={() => setKeysOpen(false)}>
          <div className="pos-modal pos-keys-modal" onClick={(e) => e.stopPropagation()}>
            <div className="pos-modal-head">
              <h4>Shortcut keys</h4>
              <button className="pos-btn pos-btn-outline" type="button" onClick={() => setKeysOpen(false)}>Close</button>
            </div>
            <table className="pos-table pos-table-fit">
              <tbody>
                <tr><td>Refresh / new bill</td><td><kbd className="pos-kbd">Alt</kbd> + <kbd className="pos-kbd">R</kbd></td></tr>
                <tr><td>Save bill</td><td><kbd className="pos-kbd">Alt</kbd> + <kbd className="pos-kbd">S</kbd></td></tr>
                <tr><td>Print</td><td><kbd className="pos-kbd">Alt</kbd> + <kbd className="pos-kbd">P</kbd></td></tr>
              </tbody>
            </table>
            <div style={{ marginTop: 10, fontSize: 12, color: 'var(--color-text-muted)' }}>
              After a bill is saved, Close / Alt+C refreshes the page for the next bill.
            </div>
          </div>
        </div>
      )}

      {cancelOpen && (
        <div className="pos-modal-back" onClick={() => !cancelling && setCancelOpen(false)}>
          <div className="pos-modal" style={{ width: 'min(460px, 100%)' }} onClick={(e) => e.stopPropagation()}>
            <div className="pos-modal-head">
              <h4>Cancel Bill #{editBillNo}</h4>
              <button className="pos-btn pos-btn-outline" type="button" disabled={cancelling} onClick={() => setCancelOpen(false)}>Close</button>
            </div>
            <div className="pos-fg">
              <span className="pos-lbl">Reason</span>
              <input
                className="pos-inp"
                value={cancelReason}
                placeholder="Reason for cancellation"
                onChange={(e) => setCancelReason(e.target.value)}
              />
            </div>
            <div className="pos-acts pos-acts-end" style={{ marginTop: 14 }}>
              <button className="pos-btn pos-btn-outline" type="button" disabled={cancelling} onClick={() => setCancelOpen(false)}>Back</button>
              <button className="pos-btn pos-btn-danger" type="button" disabled={cancelling} onClick={cancelEditedBill}>
                {cancelling ? 'Cancelling...' : 'Confirm Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}

      {orderOpen && (
        <div className="pos-modal-back" onClick={() => setOrderOpen(false)}>
          <div className="pos-modal" onClick={(e) => e.stopPropagation()}>
            <div className="pos-modal-head">
              <h4>Pending Orders</h4>
              <button className="pos-btn pos-btn-outline" type="button" onClick={() => setOrderOpen(false)}>Close</button>
            </div>
            <table className="pos-table">
              <thead><tr><th>Order No</th><th>Table</th><th>Date</th><th>Time</th><th></th></tr></thead>
              <tbody>
                {orders.length === 0 && (
                  <tr><td colSpan={5}>No pending orders.</td></tr>
                )}
                {orders.map((o) => (
                  <tr key={o.id}>
                    <td>{o.orderNo}</td>
                    <td>{o.tableName}</td>
                    <td>{o.date}</td>
                    <td>{o.time}</td>
                    <td>
                      <button className="pos-btn" type="button" onClick={() => loadOrder(o.id)}>Bill This</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {holdOpen && (
        <div className="pos-modal-back" onClick={() => setHoldOpen(false)}>
          <div className="pos-modal" style={{ width: 'min(980px, 100%)' }} onClick={(e) => e.stopPropagation()}>
            <div className="pos-modal-head">
              <h4>Hold List</h4>
              <button className="pos-btn pos-btn-outline" type="button" onClick={() => setHoldOpen(false)}>Close</button>
            </div>
            <table className="pos-table">
              <thead><tr><th>No</th><th>Customer</th><th>Phone</th><th>Payable</th><th>Date</th><th></th></tr></thead>
              <tbody>
                {holds.length === 0 && (
                  <tr><td colSpan={6}>No holds.</td></tr>
                )}
                {holds.map((h) => (
                  <tr key={h.id}>
                    <td>{h.billDisplay}</td><td>{h.customerName}</td><td>{h.customerPhone}</td>
                    <td>{h.payable}</td><td>{h.date} {h.time}</td>
                    <td>
                      <div className="pos-acts">
                        <button
                          className="pos-btn"
                          type="button"
                          onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                          onClick={(e) => { e.stopPropagation(); void loadHold(h, 'edit'); }}
                        >
                          Edit
                        </button>
                        <button
                          className="pos-btn pos-btn-outline"
                          type="button"
                          onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                          onClick={(e) => { e.stopPropagation(); void printHoldDoc(h.id); }}
                        >
                          Print
                        </button>
                        <button
                          className="pos-btn"
                          type="button"
                          onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                          onClick={(e) => { e.stopPropagation(); void loadHold(h, 'bill'); }}
                        >
                          Bill
                        </button>
                        <button className="pos-btn pos-btn-outline" type="button" onClick={() => api.cancelHold(h.id).then(openHolds)}>Cancel</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {dupeOpen && (
        <div className="pos-modal-back" onClick={() => setDupeOpen(false)}>
          <div className="pos-modal" onClick={(e) => e.stopPropagation()}>
            <h4>Last Bills</h4>
            <button className="pos-btn" type="button" onClick={() => printBill(dupeNo)}>Print selected</button>
            <table className="pos-table">
              <thead><tr><th>Bill No</th><th>Name</th><th>Total</th><th>Paid</th><th>Date</th></tr></thead>
              <tbody>
                {recent.map((b) => (
                  <tr key={b.id} onClick={() => setDupeNo(b.billDisplay)} style={{ background: dupeNo === b.billDisplay ? '#e8f0fe' : undefined }}>
                    <td>{b.billDisplay}</td><td>{b.customerName}</td><td>{b.total}</td><td>{b.paid}</td><td>{b.date} {b.time}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {history && (
        <div className="pos-modal-back" onClick={() => setHistory(null)}>
          <div className="pos-modal" onClick={(e) => e.stopPropagation()}>
            <h4>Last 6 Bills — {historyName}</h4>
            <table className="pos-table">
              <thead><tr><th>Bill No</th><th>Date</th><th>Customer</th><th>Qty</th><th>Price</th><th>Disc</th><th>Total</th></tr></thead>
              <tbody>
                {history.map((h, i) => (
                  <tr key={i}>
                    <td>{h.billNo}</td><td>{h.date} {h.time}</td><td>{h.customerName}</td>
                    <td>{h.qty}</td><td>{h.price}</td><td>{h.discount}</td><td>{h.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {uploadingSlot && createPortal(
        <div className="app-loading-overlay" role="status" aria-live="polite" aria-label="Uploading photo">
          <div className="app-loading-box">
            <span className="app-loading-gif" aria-hidden="true" />
            <span>Uploading photo…</span>
          </div>
        </div>,
        document.body
      )}

      {a4Bill && createPortal(
        <div className="a4-print-host">
          <div className="a4-print-bar no-print">
            <button className="go" type="button" onClick={() => window.print()}>Print</button>
            <button className="stop" type="button" onClick={() => setA4Bill(null)}>Close</button>
          </div>
          <A4Invoice bill={a4Bill} />
        </div>,
        document.body
      )}
    </div>
  );
};

export default BillingPage;
