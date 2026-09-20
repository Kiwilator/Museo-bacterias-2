/* Load the reviewed museum content/image fixes. */
(() => {
  const base = document.createElement('script');
  base.src = './content-fix-base-20260917.js?v=5';
  base.onerror = () => console.error('[content-fix] could not load base content fixes');
  document.head.appendChild(base);
})();
