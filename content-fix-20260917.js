/*
  Museo Bacterias Púrpura — content/image corrections from the reviewed
  museum-content document (2026-09-17).
  This file only corrects content mappings and source labels; it does not
  change the scene, GLBs, interactions or layout.
*/
(() => {
  const VERSION = '?v=20260917-content1';

  try {
    const content = (typeof museumContent !== 'undefined') ? museumContent : null;
    if (content) {
      // 01 · Rhodospirillum rubrum: keep only the R. rubrum PHA image.
      // The previous second image belonged to Rhodobacter capsulatus.
      if (content.bacteriaLarge01) {
        content.bacteriaLarge01.images = [
          './assets/images/pha-granules-tem.jpg' + VERSION
        ];
        content.bacteriaLarge01.imageSources = [
          { label: 'Own source · scientific team' }
        ];
      }

      // 02 · Blastochloris viridis: the source document shows both the
      // PDB 5M7J reaction centre and the Bayreuth electron micrograph.
      if (content.bacteriaSmall01) {
        content.bacteriaSmall01.images = [
          'https://www.ebi.ac.uk/pdbe/static/entry/5m7j_deposited_chain_front_image-800x800.png',
          './assets/images/blastochloris-viridis.png' + VERSION
        ];
        content.bacteriaSmall01.imageSources = [
          { label: 'Source: PDB 5M7J · PDBe', url: 'https://doi.org/10.2210/pdb5M7J/pdb' },
          { label: 'Source: University of Bayreuth', url: 'https://www.uni-bayreuth.de/press-releases/genetic-magnetization-of-living-bacteria' }
        ];
      }

      // Rhodovulum: use the SEM/EDS image corresponding to
      // Rhodovulum visakhapatnamense AB26, not the duplicated lab-device photo.
      if (content.bacteriaSmall04) {
        content.bacteriaSmall04.images = [
          './assets/images/electroactivity-electrode-sem.jpg' + VERSION
        ];
        content.bacteriaSmall04.imageSources = [
          {
            label: 'Source: ISME Journal (2021) · Rhodovulum visakhapatnamense AB26',
            url: 'https://doi.org/10.1038/s41396-021-01015-8'
          }
        ];
      }

      // NUTRIENTS: use the cultivation system / feed-lines image from the
      // supplied scientific material instead of the generic culture image.
      if (content.window03) {
        content.window03.images = [
          './assets/images/process-overview.jpg' + VERSION
        ];
        content.window03.imageSources = [
          { label: 'Own source · scientific team' }
        ];
      }

      // Rhodomicrobium: distinguish the museum animation from the microscopy
      // supplied by Arpita Bose's laboratory.
      if (content.bacteriaLarge02) {
        content.bacteriaLarge02.imageSources = [
          { label: 'Museum animation / own visualisation' },
          { label: 'Source: Arpita Bose laboratory' }
        ];
      }

      // Space-mission image comes from the original scientific material.
      if (content.spaceMission) {
        content.spaceMission.imageSources = [
          { label: 'Source: original scientific material' }
        ];
      }
    }
  } catch (error) {
    console.error('[content-fix] museum content patch failed', error);
  }

  try {
    const i18n = window.MUSEUM_I18N;
    const es = i18n && i18n.content && i18n.content.es;

    if (es) {
      if (es.bacteriaLarge01) {
        es.bacteriaLarge01.imageSources = [
          { label: 'Fuente propia · equipo científico' }
        ];
      }

      if (es.bacteriaSmall01) {
        es.bacteriaSmall01.imageSources = [
          { label: 'Fuente: PDB 5M7J · PDBe', url: 'https://doi.org/10.2210/pdb5M7J/pdb' },
          { label: 'Fuente: Universidad de Bayreuth', url: 'https://www.uni-bayreuth.de/press-releases/genetic-magnetization-of-living-bacteria' }
        ];
      }

      if (es.bacteriaSmall04) {
        es.bacteriaSmall04.imageSources = [
          {
            label: 'Fuente: ISME Journal (2021) · Rhodovulum visakhapatnamense AB26',
            url: 'https://doi.org/10.1038/s41396-021-01015-8'
          }
        ];
      }

      if (es.window03) {
        es.window03.imageSources = [
          { label: 'Fuente propia · equipo científico' }
        ];
      }

      if (es.bacteriaLarge02) {
        es.bacteriaLarge02.imageSources = [
          { label: 'Animación propia / visualización del museo' },
          { label: 'Fuente: laboratorio de Arpita Bose' }
        ];
      }

      if (es.spaceMission) {
        es.spaceMission.imageSources = [
          { label: 'Fuente: material científico original' }
        ];
      }
    }

    // Correct the species attached to the AB26 / ISME 2021 material in both
    // language versions of the credits/references.
    ['en', 'es'].forEach((lang) => {
      const references = i18n && i18n.credits && i18n.credits[lang] && i18n.credits[lang].references;
      if (!Array.isArray(references)) return;

      references.forEach((item) => {
        if (!item || typeof item.label !== 'string') return;
        item.label = item.label.replace(
          /Rhodovulum sulfidophilum AB26/g,
          'Rhodovulum visakhapatnamense AB26'
        );
      });
    });
  } catch (error) {
    console.error('[content-fix] i18n/source patch failed', error);
  }
})();
