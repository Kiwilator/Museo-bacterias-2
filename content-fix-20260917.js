/* Load the reviewed museum content/image fixes. */
(() => {
  const base = document.createElement('script');
  base.src = './content-fix-base-20260917.js?v=6';
  base.onerror = () => console.error('[content-fix] could not load base content fixes');
  document.head.appendChild(base);

  /* Keep the LOOK arrows visually separated from the mouse illustration. */
  const controlsSpacingFix = document.createElement('style');
  controlsSpacingFix.textContent = `
    #controls-popup .controls-drag-arrows {
      bottom: -8px !important;
    }
  `;
  document.head.appendChild(controlsSpacingFix);
})();
