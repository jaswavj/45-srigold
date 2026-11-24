import React from 'react';
import { FINE_DIVISOR, goldAmount, goldRateAmt, goldTotalWt, GoldParts, round2 } from '../utils/goldCalc';
import { sriImageUrl } from '../utils/sriImages';

export type ShareItem = {
  name: string;
  itemSize?: string;
  itemDetails?: string;
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

export const wt = (n?: number | null, digits = 3) => {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return digits === 2 ? '0.00' : '0.000';
  return v.toFixed(digits);
};

export const fmtDate = (d?: string) => {
  if (!d) return '';
  const dt = new Date(`${String(d).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

export const fmtTime = (t?: string) => {
  const parts = String(t || '').split(':');
  if (parts.length < 2) return '';
  let h = Number(parts[0]);
  if (!Number.isFinite(h)) return '';
  const ampm = h >= 12 ? 'pm' : 'am';
  h = h % 12 || 12;
  return `${h}:${parts[1]} ${ampm}`;
};

export const rupees = (n?: number | null) => `₹${(Number(n) || 0).toFixed(2)}`;
export const has = (n?: number | null) => Number(n) > 0;

export const waPhone = (raw?: string) => {
  const digits = (raw || '').replace(/\D/g, '');
  if (digits.length < 10) return '';
  return digits.length === 10 ? `91${digits}` : digits;
};

export const Kv: React.FC<{ label: string; value?: React.ReactNode; wide?: boolean }> = ({ label, value, wide }) => {
  if (value == null || value === '') return null;
  return (
    <div className={wide ? 'kv wide' : 'kv'}>
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
};

export const Step: React.FC<{
  label: string;
  value?: React.ReactNode;
  tone?: 'minus' | 'plus' | 'final' | 'wastage' | 'total' | 'fine';
}> = ({ label, value, tone }) => {
  if (value == null || value === '') return null;
  return (
    <div className={`step${tone ? ` ${tone}` : ''}`}>
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
};

export const partsOf = (item: ShareItem): GoldParts => ({
  finishing: item.price,
  wastage: item.metalWt,
  stoneWt: item.stoneWt,
  stoneWastage: item.stoneWastage,
  purity: item.purity,
  wastagePer: item.wastagePer,
  stoneCost: item.stoneCost,
  gramRate: item.gramRate,
  chargeAmt: item.chargeAmt,
});

export const ShareCardItem: React.FC<{ item: ShareItem; note?: string }> = ({ item, note }) => {
  const lineAmt = goldAmount(partsOf(item));
  const lineWt = goldTotalWt(partsOf(item));
  const charge = (item.chargeType || '').trim();
  const finishing = Number(item.price) || 0;
  const finalWt = round2(finishing - (Number(item.stoneWt) || 0) + (Number(item.stoneWastage) || 0));
  return (
    <div className="gold-share-body">
      {note ? <div className="gold-share-bill-tag">{note}</div> : null}
      {(item.image1 || item.image2 || (item.itemDetails || '').trim()) ? (
        <div className="gold-share-media">
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
          {(item.itemDetails || '').trim() ? (
            <div className="gold-share-details">{(item.itemDetails || '').trim()}</div>
          ) : null}
        </div>
      ) : null}
      {item.name ? <div className="gold-share-item-name">{item.name}</div> : null}
      {(item.itemSize || '').trim() ? (
        <div className="gold-share-size">Size {(item.itemSize || '').trim()}</div>
      ) : null}
      <div className="gold-share-steps">
        <Step label="Finishing wt" value={has(item.price) ? `${wt(item.price)} g` : null} />
        <Step label="Stone wt" value={has(item.stoneWt) ? `− ${wt(item.stoneWt)} g` : null} tone="minus" />
        <Step label="Stone wastage" value={has(item.stoneWastage) ? `+ ${wt(item.stoneWastage)} g` : null} tone="plus" />
        <Step label="Final wt" value={finishing > 0 ? `${finalWt.toFixed(2)} g` : null} tone="final" />
        <Step label="Purity" value={has(item.purity) ? String(item.purity) : null} />
        <Step label="Percentage" value={has(item.wastagePer) ? String(item.wastagePer) : null} />
        <Step
          label="/99.5"
          value={(has(item.purity) || has(item.wastagePer) || lineWt > 0) ? String(FINE_DIVISOR) : null}
          tone="fine"
        />
        <Step label="Total wt" value={lineWt > 0 ? `${lineWt.toFixed(2)} g` : null} tone="total" />
      </div>
      <div className="gold-share-kvs">
        <Kv label="Stone cost" value={has(item.stoneCost) ? rupees(item.stoneCost) : null} />
        <Kv label="1 gram rate" value={has(item.gramRate) ? rupees(item.gramRate) : null} />
        <Kv label="Gold amount" value={has(item.gramRate) ? rupees(goldRateAmt(partsOf(item))) : null} />
        <Kv label={charge || 'Type'} value={has(item.chargeAmt) ? rupees(item.chargeAmt) : null} />
        <Kv label="Amount" value={lineAmt > 0 ? rupees(lineAmt) : null} wide />
      </div>
    </div>
  );
};
