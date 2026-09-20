/* Load the reviewed museum content/image fixes. */
(() => {
  /* Remove the old controls guide from the loading screen. The standalone
     onboarding popup is the only controls tutorial and appears after load. */
  const removeLoadingControls = () => {
    document.querySelectorAll('#loading-screen .controls-loading-guide').forEach((node) => node.remove());
  };

  const loadingControlsStyle = document.createElement('style');
  loadingControlsStyle.textContent = `
    #loading-screen .controls-loading-guide {
      display: none !important;
    }
  `;
  document.head.appendChild(loadingControlsStyle);

  if (document.body) {
    removeLoadingControls();
    const observer = new MutationObserver(removeLoadingControls);
    observer.observe(document.body, { childList: true, subtree: true });
    window.setTimeout(() => observer.disconnect(), 15000);
  }

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
