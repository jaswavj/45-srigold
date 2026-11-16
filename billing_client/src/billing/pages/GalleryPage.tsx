import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import { BillingApiService } from '../../api/billing/billing-api-service';
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
  fileName: string;
};

const wt = (n?: number | null) => {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return '';
  return v.toFixed(3);
};

const api = new BillingApiService();

const GalleryPage: React.FC = () => {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [item, setItem] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [viewIndex, setViewIndex] = useState<number | null>(null);

  useEffect(() => {
    let live = true;
    setLoading(true);
    api.gallery()
      .then((res: any) => {
        if (!live) return;
        setPhotos(Array.isArray(res?.data) ? res.data : []);
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

  useEffect(() => {
    if (viewIndex == null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setViewIndex(null);
      if (e.key === 'ArrowRight' && visible.length > 1) {
        setViewIndex((cur) => (cur == null ? cur : (cur + 1) % visible.length));
      }
      if (e.key === 'ArrowLeft' && visible.length > 1) {
        setViewIndex((cur) => (cur == null ? cur : (cur - 1 + visible.length) % visible.length));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [viewIndex, visible.length]);

  const viewPhoto = viewIndex == null ? null : visible[viewIndex];
  const wtText = (photo: Photo) => {
    const finishing = wt(photo.finishingWt);
    const wastage = wt(photo.metalWt);
    return [finishing ? `Finishing wt: ${finishing}` : '', wastage ? `Wastage wt: ${wastage}` : '']
      .filter(Boolean)
      .join(' · ');
  };

  return (
    <div className="mst-page gal-page">
      <h2 className="mst-title">
        <i className="fas fa-images" /> Gallery
      </h2>
      <div className="mst-card" style={{ marginBottom: 12 }}>
        <div className="mst-card-b gal-filters">
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
            {loading ? 'Loading…' : `${visible.length} photo${visible.length === 1 ? '' : 's'}`}
          </div>
        </div>
      </div>

      {!loading && visible.length === 0 && (
        <div className="mst-card">
          <div className="gal-empty">
            {photos.length === 0 ? 'No photos uploaded yet' : 'No photos for this item name'}
          </div>
        </div>
      )}

      <div className="gal-grid">
        {visible.map((photo, i) => (
          <button
            key={`${photo.billId}-${photo.fileName}-${i}`}
            type="button"
            className="gal-card"
            onClick={() => setViewIndex(i)}
            title="View photo"
          >
            <img src={sriImageUrl(photo.fileName)} alt={photo.itemName} />
            <div className="gal-cap">
              <strong>{photo.itemName || '-'}</strong>
              {wtText(photo) ? <span className="gal-wt">{wtText(photo)}</span> : null}
              <span>{photo.customerName || '-'}</span>
              <em>{[photo.date, photo.billDisplay ? `#${photo.billDisplay}` : ''].filter(Boolean).join(' · ')}</em>
            </div>
          </button>
        ))}
      </div>

      {viewPhoto && viewIndex != null && (
        <div className="gal-view-back" onClick={() => setViewIndex(null)}>
          <button className="gal-view-close" type="button" onClick={() => setViewIndex(null)}>Close</button>
          {visible.length > 1 && (
            <>
              <button
                className="gal-view-nav gal-view-prev"
                type="button"
                onClick={(e) => { e.stopPropagation(); setViewIndex((viewIndex - 1 + visible.length) % visible.length); }}
              >
                ‹
              </button>
              <button
                className="gal-view-nav gal-view-next"
                type="button"
                onClick={(e) => { e.stopPropagation(); setViewIndex((viewIndex + 1) % visible.length); }}
              >
                ›
              </button>
            </>
          )}
          <div className="gal-view-main" onClick={(e) => e.stopPropagation()}>
            <img className="gal-view-img" src={sriImageUrl(viewPhoto.fileName)} alt={viewPhoto.itemName} />
            <div className="gal-view-cap">
              <strong>{viewPhoto.itemName || '-'}</strong>
              {wtText(viewPhoto) ? <span>{wtText(viewPhoto)}</span> : null}
              <span>{[viewPhoto.customerName, viewPhoto.date, viewPhoto.billDisplay ? `#${viewPhoto.billDisplay}` : ''].filter(Boolean).join(' · ')}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GalleryPage;
