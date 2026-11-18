import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import { BillingApiService } from '../../api/billing/billing-api-service';
import { goldAmount, goldTotalWt } from '../utils/goldCalc';
import { sriImageUrl } from '../utils/sriImages';
import './master/Master.css';
import './GalleryPage.css';

type Photo = {
  billId: number;
  billDisplay: string;
  date: string;
  customerName: string;
  itemName: string;
  metalWt?: number;
  finishingWt?: number;
  purity?: number;
  wastagePer?: number;
  stoneWt?: number;
  stoneWastage?: number;
  stoneCost?: number;
  gramRate?: number;
  chargeType?: string;
  chargeAmt?: number;
  image1: string;
  image2: string;
};

type ViewShot = {
  photo: Photo;
  slot: 1 | 2;
  fileName: string;
};

const wt = (n?: number | null, digits = 3) => {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return '';
  return v.toFixed(digits);
};

const api = new BillingApiService();

const GalleryPage: React.FC = () => {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [item, setItem] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [viewIndex, setViewIndex] = useState<number | null>(null);
  const [tab, setTab] = useState<1 | 2>(1);

  const asPhoto = (row: any): Photo => ({
    ...row,
    image1: String(row?.image1 || row?.fileName || '').trim(),
    image2: String(row?.image2 || '').trim(),
  });

  useEffect(() => {
    let live = true;
    setLoading(true);
    api.gallery()
      .then((res: any) => {
        if (!live) return;
        setPhotos(Array.isArray(res?.data) ? res.data.map(asPhoto) : []);
      })
      .catch((err: any) => {
        if (!live) return;
        toast.error(err?.response?.data?.data?.error || err?.message || 'Could not load gallery');
        setPhotos([]);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => { live = false; };
  }, []);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return photos.filter((p) => {
      const name = p.itemName || '';
      if (item && name !== item) return false;
      if (q && !name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [photos, item, search]);

  const itemNames = useMemo(() => {
    const names = new Set(photos.map((p) => (p.itemName || '').trim()).filter(Boolean));
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [photos]);

  const tabCounts = useMemo(() => ({
    1: visible.filter((p) => p.image1).length,
    2: visible.filter((p) => p.image2).length,
  }), [visible]);

  const shots = useMemo<ViewShot[]>(() => visible.flatMap((photo) => {
    const fileName = tab === 1 ? photo.image1 : photo.image2;
    return fileName ? [{ photo, slot: tab, fileName }] : [];
  }), [visible, tab]);

  useEffect(() => {
    if (viewIndex == null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setViewIndex(null);
      if (e.key === 'ArrowRight' && shots.length > 1) {
        setViewIndex((cur) => (cur == null ? cur : (cur + 1) % shots.length));
      }
      if (e.key === 'ArrowLeft' && shots.length > 1) {
        setViewIndex((cur) => (cur == null ? cur : (cur - 1 + shots.length) % shots.length));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [viewIndex, shots.length]);

  const viewShot = viewIndex == null ? null : shots[viewIndex];
  const photoCount = shots.length;
  const wtText = (photo: Photo) => {
    const finishing = wt(photo.finishingWt);
    const wastage = wt(photo.metalWt, 2);
    const parts = {
      finishing: photo.finishingWt,
      wastage: photo.metalWt,
      stoneWt: photo.stoneWt,
      stoneWastage: photo.stoneWastage,
      stoneCost: photo.stoneCost,
      gramRate: photo.gramRate,
      chargeAmt: photo.chargeAmt,
    };
    const total = goldTotalWt(parts);
    const amount = goldAmount(parts);
    return [
      finishing ? `Finishing wt: ${finishing}` : '',
      Number(photo.purity) > 0 ? `Purity ${photo.purity}` : '',
      Number(photo.wastagePer) > 0 ? `${photo.wastagePer}%` : '',
      wastage ? `Wastage wt: ${wastage}` : '',
      wt(photo.stoneWt) ? `Stone ${wt(photo.stoneWt)}` : '',
      wt(photo.stoneWastage) ? `Stone wastage ${wt(photo.stoneWastage)}` : '',
      total > 0 ? `Total ${total.toFixed(3)}` : '',
      amount > 0 ? `₹${amount.toFixed(2)}` : '',
    ].filter(Boolean).join(' · ');
  };

  return (
    <div className="mst-page gal-page">
      <h2 className="mst-title">
        <i className="fas fa-images" /> Gallery
      </h2>
      <div className="mst-card" style={{ marginBottom: 12 }}>
        <div className="mst-card-b gal-filters">
          <div className="gal-tabs" role="tablist" aria-label="Gallery photos">
            {([1, 2] as const).map((slot) => (
              <button
                key={slot}
                type="button"
                role="tab"
                aria-selected={tab === slot}
                className={`gal-tab${tab === slot ? ' on' : ''}`}
                onClick={() => {
                  setTab(slot);
                  setViewIndex(null);
                }}
              >
                Image {slot}
                <span>{loading ? '…' : tabCounts[slot]}</span>
              </button>
            ))}
          </div>
          <div className="mst-fg gal-search">
            <label>Item name</label>
            <select
              className="mst-inp"
              value={item}
              onChange={(e) => setItem(e.target.value)}
            >
              <option value="">All items</option>
              {itemNames.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>
          <div className="mst-fg gal-search">
            <label>Search item name</label>
            <input
              className="mst-inp"
              value={search}
              placeholder="Type item name"
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="gal-count">
            {loading ? 'Loading…' : `${photoCount} photo${photoCount === 1 ? '' : 's'}`}
          </div>
        </div>
      </div>

      {!loading && shots.length === 0 && (
        <div className="mst-card">
          <div className="gal-empty">
            {photos.length === 0
              ? 'No photos uploaded yet'
              : `No Image ${tab} photos${item || search ? ' for this item name' : ''}`}
          </div>
        </div>
      )}

      <div className="gal-grid">
        {shots.map((shot, i) => (
          <button
            key={`${shot.photo.billId}-${shot.slot}-${shot.fileName}-${i}`}
            type="button"
            className="gal-card"
            onClick={() => setViewIndex(i)}
            title={`View image ${shot.slot}`}
          >
            <div className="gal-shot">
              <img src={sriImageUrl(shot.fileName)} alt={`${shot.photo.itemName || 'Item'} image ${shot.slot}`} />
              <em>Image {shot.slot}</em>
            </div>
            <div className="gal-cap">
              <strong>{shot.photo.itemName || '-'}</strong>
              {wtText(shot.photo) ? <span className="gal-wt">{wtText(shot.photo)}</span> : null}
              <span>{shot.photo.customerName || '-'}</span>
              <em>{[shot.photo.date, shot.photo.billDisplay ? `#${shot.photo.billDisplay}` : ''].filter(Boolean).join(' · ')}</em>
            </div>
          </button>
        ))}
      </div>

      {viewShot && viewIndex != null && (
        <div className="gal-view-back" onClick={() => setViewIndex(null)}>
          <button className="gal-view-close" type="button" onClick={() => setViewIndex(null)}>Close</button>
          {shots.length > 1 && (
            <>
              <button
                className="gal-view-nav gal-view-prev"
                type="button"
                onClick={(e) => { e.stopPropagation(); setViewIndex((viewIndex - 1 + shots.length) % shots.length); }}
              >
                ‹
              </button>
              <button
                className="gal-view-nav gal-view-next"
                type="button"
                onClick={(e) => { e.stopPropagation(); setViewIndex((viewIndex + 1) % shots.length); }}
              >
                ›
              </button>
            </>
          )}
          <div className="gal-view-main" onClick={(e) => e.stopPropagation()}>
            <img className="gal-view-img" src={sriImageUrl(viewShot.fileName)} alt={`${viewShot.photo.itemName} image ${viewShot.slot}`} />
            <div className="gal-view-cap">
              <strong>{viewShot.photo.itemName || '-'} · Image {viewShot.slot}</strong>
              {wtText(viewShot.photo) ? <span>{wtText(viewShot.photo)}</span> : null}
              <span>{[viewShot.photo.customerName, viewShot.photo.date, viewShot.photo.billDisplay ? `#${viewShot.photo.billDisplay}` : ''].filter(Boolean).join(' · ')}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GalleryPage;
