const blobToDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

const waitForImages = (root: HTMLElement) =>
  Promise.all(
    Array.from(root.querySelectorAll('img')).map((img) => {
      if (img.complete && img.naturalWidth > 0) return Promise.resolve();
      return new Promise<void>((resolve) => {
        img.onload = () => resolve();
        img.onerror = () => resolve();
      });
    })
  );

const inlineImages = async (root: HTMLElement) => {
  const imgs = Array.from(root.querySelectorAll('img'));
  await Promise.all(
    imgs.map(async (img) => {
      const src = img.currentSrc || img.src;
      if (!src || src.startsWith('data:')) return;
      try {
        const res = await fetch(src);
        if (!res.ok) return;
        img.src = await blobToDataUrl(await res.blob());
      } catch {
        // keep original src
      }
    })
  );
};

const MAX_CANVAS = 16384;

const cardWidthOf = (node: HTMLElement) =>
  node.classList.contains('gold-share-card-wide') ? 860 : 390;

export async function downloadElementJpeg(node: HTMLElement, filename: string) {
  await inlineImages(node);
  await waitForImages(node);
  if (document.fonts?.ready) await document.fonts.ready;

  const width = cardWidthOf(node);
  const holder = document.createElement('div');
  holder.setAttribute('aria-hidden', 'true');
  holder.style.cssText = [
    'position:fixed',
    'left:-12000px',
    'top:0',
    `width:${width}px`,
    'pointer-events:none',
    'opacity:0',
    'z-index:-1',
  ].join(';');

  const clone = node.cloneNode(true) as HTMLElement;
  clone.style.width = `${width}px`;
  clone.style.maxWidth = `${width}px`;
  clone.style.minWidth = `${width}px`;
  clone.style.transform = 'none';
  clone.style.zoom = '1';
  clone.style.margin = '0';
  clone.style.position = 'relative';
  holder.appendChild(clone);
  document.body.appendChild(holder);

  try {
    await waitForImages(clone);
    const height = Math.max(clone.scrollHeight, clone.offsetHeight, 1);
    const pixelRatio = Math.max(2, Math.min(2.5, 1920 / width, MAX_CANVAS / Math.max(height, width)));
    const { toJpeg } = await import('html-to-image');
    const dataUrl = await toJpeg(clone, {
      quality: 0.95,
      pixelRatio,
      cacheBust: true,
      backgroundColor: '#fffaf2',
      width,
      height,
      style: {
        width: `${width}px`,
        maxWidth: `${width}px`,
        minWidth: `${width}px`,
        transform: 'none',
        zoom: '1',
        left: '0',
        top: '0',
        margin: '0',
        position: 'relative',
      },
    });
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = filename.toLowerCase().endsWith('.jpg') ? filename : `${filename}.jpg`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    holder.remove();
  }
}
