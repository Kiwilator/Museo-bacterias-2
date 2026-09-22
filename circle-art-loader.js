/* Loads the six replacement artworks for the circular PPB displays.
   The original image assets and index.html references remain untouched so
   removing this loader restores the previous visuals. */
(() => {
  if (window.__CIRCLE_ART_LOADER__) return;
  window.__CIRCLE_ART_LOADER__ = true;

  const files = [1, 2, 3, 4, 5, 6].map((n) =>
    `./assets/images/circle-art-${String(n).padStart(2, '0')}-data.js?v=20260922-circle1`
  );
  const ids = [1, 2, 3, 4, 5, 6].map((n) =>
    `ppb-bacteria-${String(n).padStart(2, '0')}`
  );

  let loaded = 0;
  const apply = () => {
    if (loaded !== files.length) return;
    ids.forEach((id, index) => {
      const image = document.getElementById(id);
      const data = window[`CIRCLE_ART_${String(index + 1).padStart(2, '0')}`];
      if (image && data) image.src = data;
    });
    console.log('[circle-art] 6/6 replacement artworks applied');
  };

  files.forEach((src) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = () => { loaded += 1; apply(); };
    script.onerror = () => console.error('[circle-art] failed to load', src);
    document.head.appendChild(script);
  });
})();
