

(function museumI18n() {
  const supported = ['en', 'es'];
  const queryLanguage = new URLSearchParams(window.location.search).get('lang');
  let savedLanguage = null;
  try { savedLanguage = window.localStorage.getItem('museum-language'); } catch (e) {}

  const language = supported.includes(queryLanguage)
    ? queryLanguage
    : (supported.includes(savedLanguage) ? savedLanguage : 'en');

  try { window.localStorage.setItem('museum-language', language); } catch (e) {}
  window.MUSEUM_LANGUAGE = language;

  const ui = {
    en: {
      languageSelector: 'Language selection',
      english: 'English',
      spanish: 'Spanish',
      move: 'Move',
      look: 'Look',
      drag: 'Drag',
      swipe: 'Swipe',
      intro: 'MOVE THROUGH THE SPACE AND APPROACH THE EXHIBITS TO DISCOVER MORE',
      close: 'Close',
      clickToExplore: 'CLICK TO EXPLORE',
      credits: 'CREDITS',
      reactorTitle: 'BIOREACTOR',
      reactorPanel: 'CONTROL PANEL',
      on: 'ON',
      off: 'OFF',
      reactorPrompt: 'Tap a control to learn what that process does inside a photobioreactor.',
      reactorFallback: 'Tap a control to learn how each process keeps the culture alive.'
    },
    es: {
      languageSelector: 'Selección de idioma',
      english: 'Inglés',
      spanish: 'Español',
      move: 'Moverse',
      look: 'Mirar',
      drag: 'Arrastrar',
      swipe: 'Deslizar',
      intro: 'RECORRE EL ESPACIO Y ACÉRCATE A LAS PIEZAS PARA DESCUBRIR MÁS',
      close: 'Cerrar',
      clickToExplore: 'PULSA PARA EXPLORAR',
      credits: 'CRÉDITOS',
      reactorTitle: 'BIORREACTOR',
      reactorPanel: 'PANEL DE CONTROL',
      on: 'ON',
      off: 'OFF',
      reactorPrompt: 'Pulsa un control para descubrir qué función cumple dentro de un fotobiorreactor.',
      reactorFallback: 'Pulsa un control para descubrir cómo mantiene vivo el cultivo cada proceso.'
    }
  };

  const credits = {
    en: {
      title: 'CREDITS & SOURCES',
      developmentTitle: 'DEVELOPMENT',
      scienceTitle: 'SCIENTIFIC COORDINATION & ADVISORY',
      mediaTitle: 'IMAGE & VIDEO CONTRIBUTORS',
      referencesTitle: 'REFERENCES',
      development: [
        'Sonia Rodríguez Revuelta — Lead Design & Development',
        'José Luis Rubio Tamayo — Project Direction, Coordination & Development',
        'Xabier Clemente Mintegui — Design & Technical Development'
      ],
      science: [
        'Baptiste Leroy — Scientific Coordination & PPB Species Content',
        'Daniel Melchor Puyol Santos — Scientific Coordination & Content Review',
        'Ralph Lindeboom — Scientific Advisory & Content Development',
        'Gabriel Capson-Tojo — Scientific Coordination & Contributor Liaison',
        'Luis Diaz Allegue — Scientific Contributor',
        'David Weissbrodt — Scientific & Visual Contributor',
        'Alessandra Adessi — Scientific & Visual Contributor',
        'Arpita Bose — Scientific & Visual Contributor',
        'Cristina Cavinato — Scientific & Visual Contributor',
        'Fernando Muniesa — Scientific & Visual Contributor',
        'Harun Koku — Scientific & Visual Contributor',
        'Hartmut Grammel — Scientific & Visual Contributor',
        'Andrea Turolla — Scientific & Visual Contributor',
        'Joana Fradinho — Scientific & Visual Contributor',
        'Damien Batstone — Scientific & Visual Contributor'
      ],
      media: [
        'Berber Stevens',
        'Demi Ligtenberg',
        'Marta Cerruti',
        'Heleen Ouboter',
        'Guillaume Crosset-Perrotin',
        'Maria Paula Giulianetti de Almeida',
        'Camille Mondini',
        'Mythili Ananth',
        'Amanda Prado de Nicolás',
        'Víctor Galve Santacruz',
        'María José García López'
      ],
      references: [
        { label: 'Photobioreactor experiments, 2017 — Berber Stevens, Demi Ligtenberg, Marta Cerruti, David Weissbrodt' },
        { label: 'Purple reactor, 2017 — Berber Stevens, Demi Ligtenberg, Marta Cerruti, David Weissbrodt' },
        { label: 'Reactor laboratory, 2017 — Heleen Ouboter, Marta Cerruti, David Weissbrodt' },
        { label: 'Photobioreactor experiment, 2019 — Marta Cerruti, Guillaume Crosset-Perrotin, David Weissbrodt' },
        { label: 'Photobioreactor video, 2019 — Marta Cerruti, Guillaume Crosset-Perrotin, David Weissbrodt' },
        { label: 'Purple reactor, 2019 — Marta Cerruti, David Weissbrodt' },
        { label: 'Green reactor, 2019 — Maria Paula Giulianetti de Almeida, Camille Mondini, David Weissbrodt' },
        { label: 'Reactor, culture and equipment, 2020 — Marta Cerruti, Mythili Ananth, David Weissbrodt' },
        { label: 'Acetate / butyrate bottles, 2020 — Marta Cerruti, Mythili Ananth, David Weissbrodt' },
        { label: 'Purple culture and biomass, 2020 — Marta Cerruti, Mythili Ananth, David Weissbrodt' },
        { label: 'R. rubrum, mCherry fluorescence and PHA granules — Baptiste Leroy\'s lab' },
        { label: 'R. palustris 42OL photobioreactor — Alessandra Adessi\'s lab' },
        { label: 'R. palustris TIE-1 on an electrode — Bose et al., 2014, Nature Communications (adapted with permission)' },
        { label: 'Rhodovulum sulfidophilum AB26 and bioelectrochemical device — Arpita Bose\'s lab' },
        { label: 'Rhodomicrobium spp. from freshwater wetland soil — Arpita Bose\'s lab' },
        { label: 'Blastochloris viridis (photosynthetic reaction center) — PDB 5M7J', url: 'https://doi.org/10.2210/pdb5M7J/pdb' },
        { label: 'Rhodospirillum rubrum (spaceflight) — Ilgrande et al., 2019', url: 'https://doi.org/10.1089/ast.2018.1973' },
        { label: 'Rhodovulum sulfidophilum AB26 — ISME Journal, 2021', url: 'https://doi.org/10.1038/s41396-021-01015-8' },
        { label: 'Rhodopseudomonas palustris TIE-1 — Bose et al., 2014, Nature Communications' },
        { label: 'Blastochloris viridis image — University of Bayreuth', url: 'https://www.uni-bayreuth.de/press-releases/genetic-magnetization-of-living-bacteria' },
        { label: 'Cereibacter sphaeroides image — Wikipedia', url: 'https://de.wikipedia.org/wiki/Cereibacter_sphaeroides' },
        { label: 'Rhodobacter capsulatus image — Fedotova & Zeilstra-Ryalls (2014)', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC3923116/' },
        { label: 'Rubrivivax gelatinosus image — Markov & Weaver (2008)', url: 'https://doi.org/10.1007/s12010-007-8032-z' }
      ]
    },
    es: {
      title: 'CREDITS & SOURCES',
      developmentTitle: 'DEVELOPMENT',
      scienceTitle: 'SCIENTIFIC COORDINATION & ADVISORY',
      mediaTitle: 'IMAGE & VIDEO CONTRIBUTORS',
      referencesTitle: 'REFERENCES',
      development: [
        'Sonia Rodríguez Revuelta — Lead Design & Development',
        'José Luis Rubio Tamayo — Project Direction, Coordination & Development',
        'Xabier Clemente Mintegui — Design & Technical Development'
      ],
      science: [
        'Baptiste Leroy — Scientific Coordination & PPB Species Content',
        'Daniel Melchor Puyol Santos — Scientific Coordination & Content Review',
        'Ralph Lindeboom — Scientific Advisory & Content Development',
        'Gabriel Capson-Tojo — Scientific Coordination & Contributor Liaison',
        'Luis Diaz Allegue — Scientific Contributor',
        'David Weissbrodt — Scientific & Visual Contributor',
        'Alessandra Adessi — Scientific & Visual Contributor',
        'Arpita Bose — Scientific & Visual Contributor',
        'Cristina Cavinato — Scientific & Visual Contributor',
        'Fernando Muniesa — Scientific & Visual Contributor',
        'Harun Koku — Scientific & Visual Contributor',
        'Hartmut Grammel — Scientific & Visual Contributor',
        'Andrea Turolla — Scientific & Visual Contributor',
        'Joana Fradinho — Scientific & Visual Contributor',
        'Damien Batstone — Scientific & Visual Contributor'
      ],
      media: [
        'Berber Stevens',
        'Demi Ligtenberg',
        'Marta Cerruti',
        'Heleen Ouboter',
        'Guillaume Crosset-Perrotin',
        'Maria Paula Giulianetti de Almeida',
        'Camille Mondini',
        'Mythili Ananth',
        'Amanda Prado de Nicolás',
        'Víctor Galve Santacruz',
        'María José García López'
      ],
      references: [
        { label: 'Photobioreactor experiments, 2017 — Berber Stevens, Demi Ligtenberg, Marta Cerruti, David Weissbrodt' },
        { label: 'Purple reactor, 2017 — Berber Stevens, Demi Ligtenberg, Marta Cerruti, David Weissbrodt' },
        { label: 'Reactor laboratory, 2017 — Heleen Ouboter, Marta Cerruti, David Weissbrodt' },
        { label: 'Photobioreactor experiment, 2019 — Marta Cerruti, Guillaume Crosset-Perrotin, David Weissbrodt' },
        { label: 'Photobioreactor video, 2019 — Marta Cerruti, Guillaume Crosset-Perrotin, David Weissbrodt' },
        { label: 'Purple reactor, 2019 — Marta Cerruti, David Weissbrodt' },
        { label: 'Green reactor, 2019 — Maria Paula Giulianetti de Almeida, Camille Mondini, David Weissbrodt' },
        { label: 'Reactor, culture and equipment, 2020 — Marta Cerruti, Mythili Ananth, David Weissbrodt' },
        { label: 'Acetate / butyrate bottles, 2020 — Marta Cerruti, Mythili Ananth, David Weissbrodt' },
        { label: 'Purple culture and biomass, 2020 — Marta Cerruti, Mythili Ananth, David Weissbrodt' },
        { label: 'R. rubrum, mCherry fluorescence and PHA granules — Baptiste Leroy\'s lab' },
        { label: 'R. palustris 42OL photobioreactor — Alessandra Adessi\'s lab' },
        { label: 'R. palustris TIE-1 on an electrode — Bose et al., 2014, Nature Communications (adapted with permission)' },
        { label: 'Rhodovulum sulfidophilum AB26 and bioelectrochemical device — Arpita Bose\'s lab' },
        { label: 'Rhodomicrobium spp. from freshwater wetland soil — Arpita Bose\'s lab' },
        { label: 'Blastochloris viridis (photosynthetic reaction center) — PDB 5M7J', url: 'https://doi.org/10.2210/pdb5M7J/pdb' },
        { label: 'Rhodospirillum rubrum (spaceflight) — Ilgrande et al., 2019', url: 'https://doi.org/10.1089/ast.2018.1973' },
        { label: 'Rhodovulum sulfidophilum AB26 — ISME Journal, 2021', url: 'https://doi.org/10.1038/s41396-021-01015-8' },
        { label: 'Rhodopseudomonas palustris TIE-1 — Bose et al., 2014, Nature Communications' },
        { label: 'Blastochloris viridis image — University of Bayreuth', url: 'https://www.uni-bayreuth.de/press-releases/genetic-magnetization-of-living-bacteria' },
        { label: 'Cereibacter sphaeroides image — Wikipedia', url: 'https://de.wikipedia.org/wiki/Cereibacter_sphaeroides' },
        { label: 'Rhodobacter capsulatus image — Fedotova & Zeilstra-Ryalls (2014)', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC3923116/' },
        { label: 'Rubrivivax gelatinosus image — Markov & Weaver (2008)', url: 'https://doi.org/10.1007/s12010-007-8032-z' }
      ]
    }
  };

  const applicationVisuals = {
    en: {
      room01: { kicker: 'ROOM 01', title: 'PURPLE PHOTOTROPHIC BACTERIA' },
      room02: { kicker: 'ROOM 02', title: 'PHOTOBIOREACTORS' },
      light: { title: 'LIGHT', short: 'LIGHT → ENERGY', steps: ['LIGHT', 'CULTURE', 'ENERGY'] },
      flow: { title: 'FLOW & MIXING', short: 'MIX → UNIFORM CULTURE', steps: ['CELLS', 'MIXING', 'GAS EXCHANGE'] },
      nutrients: { title: 'NUTRIENTS', short: 'FEED → GROWTH', steps: ['CARBON', 'NITROGEN', 'GROWTH'] },
      biomass: { title: 'BIOMASS', short: 'CULTURE → BIOMASS', steps: ['CULTURE', 'SEPARATION', 'BIOMASS'] },
      bag: { title: 'BAG REACTOR', short: 'LARGE LIT SURFACE', steps: ['LIGHT', 'BAG', 'CULTURE'] },
      scale: { title: 'MODULAR SCALE-UP', short: '1 → 4 → 8 → 16', steps: ['1', '4', '8', '16'] }
    },
    es: {
      room01: { kicker: 'SALA 01', title: 'BACTERIAS FOTOTRÓFICAS PÚRPURAS' },
      room02: { kicker: 'SALA 02', title: 'FOTOBIORREACTORES' },
      light: { title: 'LUZ', short: 'LUZ → ENERGÍA', steps: ['LUZ', 'CULTIVO', 'ENERGÍA'] },
      flow: { title: 'FLUJO Y MEZCLA', short: 'MEZCLA → CULTIVO HOMOGÉNEO', steps: ['CÉLULAS', 'MEZCLA', 'GASES'] },
      nutrients: { title: 'NUTRIENTES', short: 'ALIMENTO → CRECIMIENTO', steps: ['CARBONO', 'NITRÓGENO', 'CRECIMIENTO'] },
      biomass: { title: 'BIOMASA', short: 'CULTIVO → BIOMASA', steps: ['CULTIVO', 'SEPARACIÓN', 'BIOMASA'] },
      bag: { title: 'REACTOR DE BOLSA', short: 'MÁS SUPERFICIE ILUMINADA', steps: ['LUZ', 'BOLSA', 'CULTIVO'] },
      scale: { title: 'ESCALADO MODULAR', short: '1 → 4 → 8 → 16', steps: ['1', '4', '8', '16'] }
    }
  };

  const reactor = {
    en: {
      light: {
        label: 'LIGHT', symbol: 'LUX',
        onText: 'LIGHT: cells need a useful amount of light. Intensity, distance and distribution determine how evenly it reaches the culture.',
        offText: 'LIGHT OFF: the photosynthetic energy input is removed.'
      },
      flow: {
        label: 'FLOW', symbol: 'FLOW',
        onText: 'FLOW: mixing moves cells, nutrients and gases through the reactor and helps keep the culture homogeneous.',
        offText: 'FLOW OFF: gradients can form when circulation stops.'
      },
      nutrients: {
        label: 'FEED', symbol: 'FEED',
        onText: 'NUTRIENTS: carbon, nitrogen, phosphorus and other nutrients are adjusted according to the goal of the culture.',
        offText: 'FEED OFF: no fresh nutrients enter the culture.'
      },
      active: {
        label: 'ACTIVITY', symbol: 'BIO',
        onText: 'ACTIVITY: growth and gas exchange make the living culture visibly active.',
        offText: 'ACTIVITY OFF: the visible metabolic signal decreases.'
      }
    },
    es: {
      light: {
        label: 'LUZ', symbol: 'LUX',
        onText: 'LUZ: las células necesitan una cantidad útil de luz. La intensidad, la distancia y la distribución determinan cómo llega al cultivo.',
        offText: 'LUZ OFF: se elimina el aporte de energía luminosa.'
      },
      flow: {
        label: 'FLUJO', symbol: 'FLUJO',
        onText: 'FLUJO: la mezcla mueve células, nutrientes y gases por el reactor y ayuda a mantener homogéneo el cultivo.',
        offText: 'FLUJO OFF: al detenerse la circulación pueden formarse gradientes.'
      },
      nutrients: {
        label: 'NUTRIR', symbol: 'NUTRIR',
        onText: 'NUTRIENTES: carbono, nitrógeno, fósforo y otros nutrientes se ajustan según el objetivo del cultivo.',
        offText: 'NUTRIR OFF: dejan de entrar nutrientes nuevos.'
      },
      active: {
        label: 'ACTIVIDAD', symbol: 'BIO',
        onText: 'ACTIVIDAD: el crecimiento y el intercambio de gases hacen visible que el cultivo está vivo.',
        offText: 'ACTIVIDAD OFF: disminuye la señal metabólica visible.'
      }
    }
  };

  const electroactivity = {
    en: {
      title: 'ELECTRON UPTAKE',
      flow: 'electrode → e⁻ → bacterium',
      electrode: 'ELECTRODE',
      electron: 'e⁻'
    },
    es: {
      title: 'CAPTACIÓN DE ELECTRONES',
      flow: 'electrodo → e⁻ → bacteria',
      electrode: 'ELECTRODO',
      electron: 'e⁻'
    }
  };


  const reactorPanel = {
    en: {
      title: 'PHOTOBIOREACTOR',
      statusTitle: 'SYSTEM STATUS',
      idle: 'Tap a control to see what it changes inside the photobioreactor.',
      systemActive: 'SYSTEM ACTIVE',
      systemActiveText: 'CULTURE RUNNING',
      on: 'ON',
      off: 'OFF',
      labels: { light: 'LIGHT', flow: 'FLOW', nutrients: 'NUTRIENTS', active: 'ACTIVITY' },
      buttons: { light: 'LIGHT', flow: 'FLOW', nutrients: 'NUTRIENTS', active: 'ACTIVITY' },
      messages: {
        light: { onTitle: 'LIGHT', on: 'Energy for photosynthesis.',
                 offTitle: 'LIGHT OFF', off: 'The light energy input stops.' },
        flow: { onTitle: 'FLOW', on: 'The culture begins to circulate.',
                offTitle: 'FLOW OFF', off: 'Circulation stops and the culture settles.' },
        nutrients: { onTitle: 'NUTRIENTS', on: 'Nutrients enter the culture.',
                     offTitle: 'NUTRIENTS OFF', off: 'The feed line closes.' },
        active: { onTitle: 'ACTIVITY', on: 'Metabolic activity becomes visible.',
                  offTitle: 'ACTIVITY OFF', off: 'Gas production fades out.' }
      }
    },
    es: {
      title: 'FOTOBIORREACTOR',
      statusTitle: 'ESTADO DEL SISTEMA',
      idle: 'Pulsa un control para ver qué cambia dentro del fotobiorreactor.',
      systemActive: 'SISTEMA ACTIVO',
      systemActiveText: 'CULTIVO EN FUNCIONAMIENTO',
      on: 'ON',
      off: 'OFF',
      labels: { light: 'LUZ', flow: 'FLUJO', nutrients: 'NUTRIENTES', active: 'ACTIVIDAD' },
      buttons: { light: 'LUZ', flow: 'FLUJO', nutrients: 'NUTRIENTES', active: 'ACTIVIDAD' },
      messages: {
        light: { onTitle: 'LUZ', on: 'Energía para la fotosíntesis.',
                 offTitle: 'LUZ OFF', off: 'Se detiene el aporte de energía luminosa.' },
        flow: { onTitle: 'FLUJO', on: 'El cultivo comienza a circular.',
                offTitle: 'FLUJO OFF', off: 'La circulación se detiene y el cultivo se aquieta.' },
        nutrients: { onTitle: 'NUTRIENTES', on: 'Se incorporan nutrientes al cultivo.',
                     offTitle: 'NUTRIENTES OFF', off: 'Se cierra la línea de alimentación.' },
        active: { onTitle: 'ACTIVIDAD', on: 'La actividad metabólica se hace visible.',
                  offTitle: 'ACTIVIDAD OFF', off: 'La producción de gas se apaga poco a poco.' }
      }
    }
  };


  const capabilities = {
    en: {
      title: 'CAPABILITIES',
      discovered: 'CAPABILITY DISCOVERED',
      introTitle: 'DISCOVER THEIR CAPABILITIES',
      introBody: 'Interact with the exhibits.',
      pending: 'not discovered yet',
      found: 'discovered',
      short: { pha: 'PHA', nitrogen: 'N₂', electro: 'e⁻', co: 'CO', hydrogen: 'H₂', biomass: 'BIO' },
      long: {
        pha: 'PHA · CARBON STORAGE',
        nitrogen: 'N₂ · NITROGEN FIXATION',
        electro: 'e⁻ · ELECTROACTIVITY',
        co: 'CO · CARBON MONOXIDE METABOLISM',
        hydrogen: 'H₂ · HYDROGEN PRODUCTION',
        biomass: 'BIOMASS · CULTIVATION'
      },

      result: {
        pha: 'PHA ACCUMULATED',
        nitrogen: 'N₂ FIXED',
        electro: 'ELECTRONS TAKEN UP',
        co: 'CO → H₂',
        hydrogen: 'H₂ PRODUCED',
        biomass: 'SYSTEM 4 / 4'
      },
      final: {
        count: '6 / 6',
        title: 'CAPABILITIES DISCOVERED',
        lead: 'YOU HAVE DISCOVERED THEIR FULL POTENTIAL',
        body: 'Continue exploring the museum to learn about the bacteria and their applications.'
      },

      verbs: {
        pha: 'SHOW ACCUMULATION',
        nitrogen: 'OBSERVE N₂',
        electro: 'ACTIVATE ELECTRODE',
        co: 'START REACTION',
        hydrogen: 'PRODUCE H₂'
      }
    },
    es: {
      title: 'CAPACIDADES',
      discovered: 'CAPACIDAD DESCUBIERTA',
      introTitle: 'DESCUBRE SUS CAPACIDADES',
      introBody: 'Interactúa con las exposiciones.',
      pending: 'todavía sin descubrir',
      found: 'descubierta',
      short: { pha: 'PHA', nitrogen: 'N₂', electro: 'e⁻', co: 'CO', hydrogen: 'H₂', biomass: 'BIO' },
      long: {
        pha: 'PHA · ALMACENAMIENTO DE CARBONO',
        nitrogen: 'N₂ · FIJACIÓN DE NITRÓGENO',
        electro: 'e⁻ · ELECTROACTIVIDAD',
        co: 'CO · METABOLISMO DEL MONÓXIDO DE CARBONO',
        hydrogen: 'H₂ · PRODUCCIÓN DE HIDRÓGENO',
        biomass: 'BIOMASA · CULTIVO'
      },
      result: {
        pha: 'PHA ACUMULADO',
        nitrogen: 'N₂ FIJADO',
        electro: 'ELECTRONES CAPTADOS',
        co: 'CO → H₂',
        hydrogen: 'H₂ PRODUCIDO',
        biomass: 'SISTEMA 4 / 4'
      },
      final: {
        count: '6 / 6',
        title: 'CAPACIDADES DESCUBIERTAS',
        lead: 'HAS DESCUBIERTO TODO SU POTENCIAL',
        body: 'Continúa explorando el museo para conocer las bacterias y sus aplicaciones.'
      },
      verbs: {
        pha: 'MOSTRAR ACUMULACIÓN',
        nitrogen: 'OBSERVAR N₂',
        electro: 'ACTIVAR ELECTRODO',
        co: 'ACTIVAR REACCIÓN',
        hydrogen: 'PRODUCIR H₂'
      }
    }
  };


  const exhibitLabels = {
    en: {
      coHydrogen: { title: 'CO → H₂', sub: 'FROM GAS TO HYDROGEN', co: 'CO' },
      pha: { title: 'PHA', sub: 'CARBON STORAGE' },
      hydrogen: { title: 'H₂', sub: 'PHOTOBIOLOGICAL HYDROGEN PRODUCTION', tag: 'H₂' },
      nitrogen: { title: 'N₂', sub: 'NITROGEN FIXATION' }
    },
    es: {
      coHydrogen: { title: 'CO → H₂', sub: 'DEL GAS AL HIDRÓGENO', co: 'CO' },
      pha: { title: 'PHA', sub: 'RESERVA DE CARBONO' },
      hydrogen: { title: 'H₂', sub: 'FOTOPRODUCCIÓN DE HIDRÓGENO', tag: 'H₂' },
      nitrogen: { title: 'N₂', sub: 'FIJACIÓN DE NITRÓGENO' }
    }
  };

  const esContent = {
    bacteriaLarge01: {
      lead: 'Una bacteria fototrófica púrpura: fotosíntesis, pigmentos y PHA',
      tags: ['FOTOSÍNTESIS', 'PIGMENTOS', 'DIVERSIDAD METABÓLICA', 'PHA'],
      title: 'RHODOSPIRILLUM RUBRUM',
      label: 'EXPLORAR +',
      imageSources: [{ label: 'Fuente propia' }, { label: 'Fuente propia' }],
      body: 'Las bacterias fototróficas púrpuras son microorganismos capaces de usar la luz como fuente de energía. Su fotosíntesis es anoxigénica: captan energía luminosa, pero no liberan oxígeno como hacen las plantas.\n\nSus colores se deben a sus pigmentos fotosintéticos. Las bacterioclorofilas absorben parte de la luz y los carotenoides completan esa captación y ayudan a proteger la célula. Por eso los cultivos pueden verse rojos, púrpuras, marrones o anaranjados.\n\nSe investigan porque combinan varias capacidades útiles. Algunas transforman compuestos presentes en residuos o aguas residuales; otras producen biomasa, hidrógeno, pigmentos o bioplásticos; y otras sirven como modelos para entender mejor la fotosíntesis bacteriana, el intercambio de electrones y la adaptación a distintos ambientes.\n\nEn el museo, primero se muestra qué puede aportar cada bacteria y qué la hace interesante. Después se explica cómo se consiguen esos resultados mediante fotobiorreactores, es decir, sistemas de cultivo en los que se controlan la luz, la mezcla, los nutrientes y otras condiciones del proceso.\n\nMÁS ALLÁ DE LA FOTOSÍNTESIS\n\nLa luz aporta energía, pero para crecer una bacteria necesita también carbono, nitrógeno y electrones. Aquí aparece una de las características más útiles de las bacterias fototróficas púrpuras: no todas necesitan exactamente lo mismo.\n\nDistintas especies pueden aprovechar compuestos orgánicos diferentes. Algunas degradan moléculas presentes en residuos; otras producen hidrógeno; otras pueden captar electrones de minerales o de un electrodo.\n\nPor eso la fotosíntesis es solo el punto de partida. Lo interesante es cómo cada especie combina la luz con otras rutas metabólicas. Los siguientes ejemplos muestran esa diversidad.\n\nRHODOSPIRILLUM RUBRUM\n\nRhodospirillum rubrum y Rhodobacter capsulatus son dos bacterias fototróficas púrpuras muy utilizadas como modelos de estudio. Ambas convierten la energía de la luz en energía química, pero permiten investigar procesos distintos.\n\nR. rubrum puede fijar nitrógeno atmosférico y también almacenar carbono en forma de PHA. Los PHA son polímeros que la célula acumula como reserva y que pueden utilizarse para producir bioplásticos de origen biológico.'
    },
    spaceMission: {
      title: 'RHODOSPIRILLUM RUBRUM EN EL ESPACIO',
      lead: 'De una célula a futuros sistemas cerrados',
      tags: ['VUELO ESPACIAL', 'SISTEMAS CERRADOS', 'SOPORTE VITAL'],
      imageSources: [{ label: 'Fuente propia' }],
      body: 'Las futuras misiones espaciales necesitarán producir alimentos, reciclar residuos y regenerar aire y agua con menos suministros desde la Tierra. Una de las líneas de investigación estudia si determinados microorganismos pueden formar parte de esos sistemas cerrados.\n\nEn 2015, un grupo de científicos envió Rhodospirillum rubrum y otras especies bacterianas útiles a la Estación Espacial Internacional durante siete días. Un cultivo de control permaneció en la Tierra y otro viajó a órbita terrestre baja.\n\nDespués del vuelo, los cultivos se reactivaron y se compararon. Según el material científico recibido, R. rubrum sobrevivió al viaje, creció con normalidad y mantuvo sus funciones biológicas esperadas.\n\nEstos resultados apoyan su estudio en sistemas experimentales de soporte vital. R. rubrum también se investiga como posible ingrediente para alimentación humana y animal.\n\nEste cierre lleva la historia desde el comportamiento de una célula hasta su posible uso en sistemas cerrados del futuro, incluso fuera de la Tierra.'
    },
    bacteriaSmall01: {
      title: 'BLASTOCHLORIS VIRIDIS',
      lead: 'Cómo empieza a convertirse la luz en energía química',
      tags: ['CENTRO DE REACCIÓN', 'FOTOSÍNTESIS'],
      label: 'VER +',
      imageSources: [{ label: 'Fuente: Universidad de Bayreuth', url: 'https://www.uni-bayreuth.de/press-releases/genetic-magnetization-of-living-bacteria' }],
      body: 'Blastochloris viridis es importante porque ayudó a entender, a escala molecular, cómo una bacteria transforma la energía de la luz en energía química.\n\nLa pieza clave es el centro de reacción fotosintético: un conjunto de proteínas y pigmentos situado en la membrana. Allí comienza la transferencia de electrones que permite convertir la energía de la luz en una forma que la célula puede utilizar.\n\nEl centro de reacción de esta bacteria tuvo además un papel histórico: fue uno de los primeros complejos de proteínas de membrana cuya estructura pudo resolverse con gran detalle. Por eso B. viridis sigue siendo una referencia en el estudio de la fotosíntesis bacteriana.'
    },
    bacteriaSmall02: {
      title: 'CEREIBACTER SPHAEROIDES',
      lead: 'Cambiar de estrategia cuando cambia el entorno',
      tags: ['OXÍGENO', 'FOTOSÍNTESIS', 'ADAPTACIÓN'],
      label: 'VER +',
      imageSources: [{ label: 'Fuente: Cereibacter sphaeroides — Wikipedia', url: 'https://de.wikipedia.org/wiki/Cereibacter_sphaeroides' }],
      body: 'Cereibacter sphaeroides, antes llamada Rhodobacter sphaeroides, puede cambiar su forma de obtener energía según el ambiente.\n\nCuando hay suficiente oxígeno, puede obtener energía mediante respiración. Cuando el oxígeno disminuye y hay luz, activa su maquinaria fotosintética. La célula no mantiene siempre el mismo sistema: lo adapta a las condiciones.\n\nEsta capacidad de cambiar de estrategia la convierte en un organismo modelo para estudiar fotosíntesis, regulación por oxígeno, transferencia de electrones y metabolismo del carbono.'
    },
    bacteriaSmall03: {
      title: 'RHODOBACTER CAPSULATUS',
      lead: 'Regular la fotosíntesis según cambian las condiciones',
      tags: ['FOTOSÍNTESIS', 'REGULACIÓN', 'NUTRIENTES'],
      label: 'VER +',
      imageSources: [{ label: 'Fuente: Fedotova y Zeilstra-Ryalls (2014)', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC3923116/' }],
      body: 'Rhodospirillum rubrum y Rhodobacter capsulatus son dos bacterias fototróficas púrpuras muy utilizadas como modelos de estudio. Ambas convierten la energía de la luz en energía química, pero permiten investigar procesos distintos.\n\nR. capsulatus se utiliza para estudiar cómo una bacteria regula su fotosíntesis según cambian la luz, el oxígeno y la disponibilidad de nutrientes. El interés está en entender cómo decide qué rutas metabólicas activar en cada situación.'
    },
    bacteriaLarge02: {
      title: 'RHODOMICROBIUM VANNIELII',
      lead: 'Una forma diferente de reproducirse',
      tags: ['HIFAS', 'GEMACIÓN', 'CICLO CELULAR'],
      label: 'EXPLORAR +',
      imageSources: [{ label: 'Fuente propia' }, { label: 'Fuente propia' }],
      body: 'Rhodomicrobium vannielii llama la atención por su forma de reproducirse. En lugar de dividirse simplemente en dos células iguales, desarrolla prolongaciones llamadas hifas.\n\nEn el extremo de esas hifas se forma una nueva célula por gemación. Cuando está preparada, la célula hija se separa y puede iniciar su propio ciclo.\n\nEste sistema permite estudiar cómo una bacteria controla su forma, su crecimiento y la diferenciación entre distintas etapas del ciclo celular.'
    },
    bacteriaSmall04: {
      title: 'RHODOVULUM SP.',
      lead: 'Intercambiar electrones con el entorno',
      tags: ['ELECTROACTIVIDAD', 'BIOELECTROQUÍMICA'],
      label: 'VER +',
      imageSources: [{ label: 'Fuente propia' }],
      body: 'En especies de Rhodovulum se han estudiado capacidades electroactivas similares. Algunas obtienen electrones de hidrógeno, de hierro reducido o directamente de un electrodo.\n\nEstas propiedades interesan para procesos bioelectroquímicos y para transformar compuestos de bajo valor en productos útiles.'
    },
    bacteriaSmall05: {
      title: 'RUBRIVIVAX GELATINOSUS',
      lead: 'Utilizar un gas tóxico como parte de su metabolismo',
      tags: ['MONÓXIDO DE CARBONO', 'HIDRÓGENO'],
      label: 'VER +',
      imageSources: [{ label: 'Fuente: Markov y Weaver (2008)', url: 'https://doi.org/10.1007/s12010-007-8032-z' }],
      body: 'Rubrivivax gelatinosus puede utilizar monóxido de carbono (CO), un gas tóxico para muchos organismos, como parte de su metabolismo.\n\nAlgunas cepas disponen de enzimas capaces de oxidar CO. En ese proceso pueden producir dióxido de carbono e hidrógeno. De forma simplificada: el CO se transforma y parte de su energía termina en H₂.\n\nEsta capacidad se investiga porque permite estudiar formas biológicas de transformar gases y producir hidrógeno en condiciones relativamente suaves.'
    },
    bacteriaSmall06: {
      title: 'RHODOPSEUDOMONAS PALUSTRIS',
      lead: 'Versatilidad, hidrógeno e intercambio de electrones',
      tags: ['FOTOFERMENTACIÓN', 'ELECTROACTIVIDAD', 'HIDRÓGENO'],
      label: 'VER +',
      imageSources: [{ label: 'Fuente propia' }, { label: 'Fuente propia' }],
      body: 'Rhodopseudomonas palustris destaca por su versatilidad. Puede utilizar compuestos aromáticos derivados de plantas y algunas cepas producen hidrógeno mediante fotofermentación.\n\nAlgunas cepas también son electroactivas. Esto significa que pueden intercambiar electrones con materiales sólidos o con un electrodo. En un sistema controlado, el electrodo puede actuar como una fuente de electrones.'
    },
    reactor01: {
      lead: 'De la bacteria a un proceso controlado',
      tags: ['CULTIVO', 'LUZ', 'MEZCLA', 'NUTRIENTES'],
      title: 'FOTOBIORREACTOR',
      label: 'VER PROCESO +',
      imageSources: [{ label: 'Fuente propia' }, { label: 'Fuente propia' }],
      body: 'En esta parte del museo ya no se mira solo a la bacteria, sino al sistema completo que permite hacerla crecer, mantenerla estable y obtener de ella el resultado buscado.\n\nLos fotobiorreactores son esos sistemas. Gracias a ellos se puede decidir cuánta luz recibe el cultivo, cómo se mezcla, qué nutrientes se añaden y cuándo conviene recoger la biomasa o el producto generado.\n\nUn fotobiorreactor es un recipiente diseñado para cultivar microorganismos que utilizan la luz. Permite controlar las condiciones del cultivo y repetir el proceso de forma estable.\n\nNo basta con llenar un depósito de bacterias y encender una lámpara. Hay que decidir cuánta luz reciben, cómo se mezclan, qué nutrientes se añaden, cómo se controla el pH y cómo se retiran los productos.\n\nEl objetivo de esta zona es mostrar esos elementos uno a uno.'
    },
    window01: {
      title: 'LUZ',
      lead: 'La energía del cultivo',
      tags: ['LUZ', 'FOTOSÍNTESIS'],
      imageSources: [{ label: 'Fuente propia' }],
      body: 'La luz es la fuente de energía, pero no llega por igual a todas las células. Las capas exteriores pueden recibir mucha luz y las interiores pueden quedar en sombra.\n\nPor eso se ajustan la intensidad, la distancia y la distribución de las lámparas. El objetivo es que el mayor número posible de células reciba una cantidad útil de luz.'
    },
    window02: {
      title: 'FLUJO Y MEZCLA',
      lead: 'Mantener el cultivo homogéneo',
      tags: ['MEZCLA', 'INTERCAMBIO DE GASES'],
      imageSources: [{ label: 'Fuente propia' }],
      body: 'La mezcla mueve las células por el reactor y evita que unas zonas tengan muchos nutrientes mientras otras tienen pocos. También ayuda al intercambio de gases.\n\nLa mezcla debe ser suficiente para mantener el cultivo homogéneo, pero no tan fuerte que consuma energía innecesaria o dañe las células.'
    },
    window03: {
      title: 'NUTRIENTES',
      lead: 'Alimentar el proceso',
      tags: ['CARBONO', 'NITRÓGENO', 'FÓSFORO'],
      imageSources: [{ label: 'Fuente propia' }],
      body: 'Además de luz, las bacterias necesitan carbono, nitrógeno, fósforo y otros nutrientes. La cantidad de cada uno cambia la forma en que crecen y los productos que generan.\n\nPor eso alimentar un reactor no significa simplemente añadir más sustrato. Hay que ajustar la composición del medio según el objetivo del cultivo.'
    },
    window04: {
      title: 'BIOMASA',
      lead: 'Cuando el producto son las células',
      tags: ['BIOMASA', 'RECUPERACIÓN'],
      imageSources: [{ label: 'Fuente propia' }],
      body: 'En algunos procesos el producto principal son las propias células. A medida que el cultivo crece, aumenta la biomasa y llega un momento en que debe separarse del líquido.\n\nDespués puede concentrarse, secarse o procesarse según el uso previsto. La biomasa de estas bacterias se investiga, entre otros usos, para alimentación animal y otros productos biotecnológicos.'
    },
    window05: {
      title: 'REACTOR DE BOLSA',
      lead: 'Una forma sencilla de aumentar la superficie iluminada',
      tags: ['REACTOR DE BOLSA', 'ESCALADO'],
      imageSources: [{ label: 'Fuente propia' }],
      body: 'Una forma de reducir el coste del reactor es utilizar bolsas plásticas transparentes. La bolsa ofrece una superficie grande para recibir luz con una estructura relativamente sencilla.\n\nEste tipo de sistema se ha estudiado para producir biomasa y para trabajar con volúmenes mayores sin construir un reactor rígido complejo.'
    },
    window06: {
      title: 'ESCALADO MODULAR',
      lead: 'Crecer repitiendo unidades que ya funcionan',
      tags: ['ESCALADO', 'SISTEMA MODULAR'],
      imageSources: [{ label: 'Fuente propia' }],
      body: 'Aumentar la producción no obliga a construir un único reactor enorme. Otra opción es repetir muchas veces un módulo que ya funciona.\n\nEl reto pasa entonces a operar todos los módulos de forma coordinada y mantener condiciones similares entre ellos.'
    }
  };

  window.MUSEUM_I18N = { ui, reactor, reactorPanel, electroactivity, capabilities, exhibitLabels, credits, applicationVisuals, content: { en: {}, es: esContent } };
  window.getMuseumUiText = function getMuseumUiText(key) {
    return (ui[language] && ui[language][key]) || ui.en[key] || key;
  };
  window.getMuseumReactorText = function getMuseumReactorText(id) {
    return (reactor[language] && reactor[language][id]) || reactor.en[id];
  };
  window.getMuseumReactorPanelText = function getMuseumReactorPanelText() {
    return reactorPanel[language] || reactorPanel.en;
  };
  window.getMuseumCapabilityText = function getMuseumCapabilityText() {
    return capabilities[language] || capabilities.en;
  };
  window.getMuseumExhibitLabel = function getMuseumExhibitLabel(key) {
    const pack = exhibitLabels[language] || exhibitLabels.en;
    return pack[key] || exhibitLabels.en[key] || null;
  };
  window.getMuseumCreditsText = function getMuseumCreditsText() {
    return credits[language] || credits.en;
  };
  window.getMuseumApplicationText = function getMuseumApplicationText(key) {
    const pack = applicationVisuals[language] || applicationVisuals.en;
    return pack[key] || applicationVisuals.en[key] || null;
  };
  window.getMuseumElectroactivityText = function getMuseumElectroactivityText(key) {
    return (electroactivity[language] && electroactivity[language][key]) || electroactivity.en[key] || key;
  };

  function applyHtmlLanguage() {
    document.documentElement.lang = language;
    const t = window.getMuseumUiText;
    const setText = (selector, value) => {
      const node = document.querySelector(selector);
      if (node) node.textContent = value;
    };

    setText('#controls-help .hint-desktop:nth-of-type(1) .control-action', t('move'));
    setText('#controls-help .hint-desktop:nth-of-type(2) .control-action', t('look'));
    setText('#controls-help .hint-mobile:nth-of-type(3) .control-action', t('move'));
    setText('#controls-help .hint-mobile:nth-of-type(4) .control-action', t('look'));
    setText('#intro-msg p', t('intro'));
    setText('#intro-msg .hint-desktop .intro-drag', t('drag'));
    setText('#intro-msg .hint-desktop .intro-move', t('move'));
    setText('#intro-msg .hint-desktop .intro-look', t('look'));
    setText('#intro-msg .hint-mobile .intro-swipe', t('swipe'));
    setText('#intro-msg .hint-mobile .intro-move', t('move'));
    setText('#intro-msg .hint-mobile .intro-look', t('look'));
    setText('#credits-trigger', t('credits'));

    const close = document.querySelector('.panel-close');
    if (close) close.setAttribute('aria-label', t('close'));
    const creditsClose = document.querySelector('.credits-close');
    if (creditsClose) creditsClose.setAttribute('aria-label', t('close'));

    const switcher = document.getElementById('language-switcher');
    if (!switcher) return;
    switcher.setAttribute('aria-label', t('languageSelector'));
    switcher.querySelectorAll('[data-language]').forEach((button) => {
      const code = button.getAttribute('data-language');
      const active = code === language;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
      button.setAttribute('aria-label', code === 'en' ? t('english') : t('spanish'));
      button.addEventListener('click', () => {
        if (!supported.includes(code) || code === language) return;
        try { window.localStorage.setItem('museum-language', code); } catch (e) {}
        const url = new URL(window.location.href);
        url.searchParams.set('lang', code);
        window.location.assign(url.toString());
      });
    });
  }

  applyHtmlLanguage();
})();
