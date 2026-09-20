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

  /* Correct the four custom video windows: preserve aspect ratio and place biomass in the upper-right screen. */
  const videoWindowFix = document.createElement('script');
  videoWindowFix.src = './video-window-fit.js?v=20260920-video-fit1';
  videoWindowFix.onerror = () => console.error('[content-fix] could not load video window fit');
  document.head.appendChild(videoWindowFix);
})();
