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

const PHONE_CARD_WIDTH = 390;

export async function downloadElementJpeg(node: HTMLElement, filename: string) {
  await inlineImages(node);
  await waitForImages(node);
  const { toJpeg } = await import('html-to-image');
  const dataUrl = await toJpeg(node, {
    quality: 0.95,
    pixelRatio: 2,
    cacheBust: true,
    backgroundColor: '#fffaf2',
    width: PHONE_CARD_WIDTH,
    style: {
      width: `${PHONE_CARD_WIDTH}px`,
      maxWidth: `${PHONE_CARD_WIDTH}px`,
    },
  });
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename.toLowerCase().endsWith('.jpg') ? filename : `${filename}.jpg`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
