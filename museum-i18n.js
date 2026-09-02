/*
  Internationalisation layer for the museum.

  English remains the default language. A language explicitly selected by
  the visitor is stored locally, while ?lang=en / ?lang=es makes a shared
  link open in the intended language. The museum is reloaded after a change
  because several labels are rendered into Three.js canvas textures during
  start-up and cannot be translated safely by changing HTML alone.
*/
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
      reactorTitle: 'BIORREACTOR',
      reactorPanel: 'PANEL DE CONTROL',
      on: 'ON',
      off: 'OFF',
      reactorPrompt: 'Pulsa un control para descubrir qué función cumple dentro de un fotobiorreactor.',
      reactorFallback: 'Pulsa un control para descubrir cómo mantiene vivo el cultivo cada proceso.'
    }
  };

  const reactor = {
    en: {
      light: {
        label: 'LIGHT', symbol: 'LUX',
        onText: 'LIGHT: photons feed photosynthesis, so bacteria can turn light into chemical energy.',
        offText: 'LIGHT OFF: without photons, photosynthetic energy capture slows down.'
      },
      flow: {
        label: 'FLOW', symbol: 'FLOW',
        onText: 'FLOW: circulation mixes cells, gases and dissolved compounds so the culture stays even.',
        offText: 'FLOW OFF: mixing stops, so gradients can form inside the reactor.'
      },
      nutrients: {
        label: 'FEED', symbol: 'FEED',
        onText: 'FEED: nutrients add carbon, nitrogen and minerals that cells use to build biomass.',
        offText: 'FEED OFF: the culture keeps running, but no fresh nutrients enter.'
      },
      active: {
        label: 'ACTIVATE', symbol: 'BIO',
        onText: 'ACTIVATE: bubbles make metabolism visible as the living culture produces and exchanges gases.',
        offText: 'ACTIVATE OFF: the metabolic signal quiets and the reactor returns to observation mode.'
      }
    },
    es: {
      light: {
        label: 'LUZ', symbol: 'LUX',
        onText: 'LUZ: los fotones alimentan la fotosíntesis y permiten transformar la luz en energía química.',
        offText: 'LUZ OFF: sin fotones, la captación fotosintética de energía disminuye.'
      },
      flow: {
        label: 'FLUJO', symbol: 'FLUJO',
        onText: 'FLUJO: la circulación mezcla células, gases y compuestos disueltos para mantener uniforme el cultivo.',
        offText: 'FLUJO OFF: al detenerse la mezcla pueden formarse gradientes dentro del reactor.'
      },
      nutrients: {
        label: 'NUTRIR', symbol: 'NUTRIR',
        onText: 'NUTRIR: los nutrientes aportan carbono, nitrógeno y minerales con los que las células generan biomasa.',
        offText: 'NUTRIR OFF: el cultivo continúa funcionando, pero deja de recibir nutrientes nuevos.'
      },
      active: {
        label: 'ACTIVAR', symbol: 'BIO',
        onText: 'ACTIVAR: las burbujas hacen visible el metabolismo mientras el cultivo produce e intercambia gases.',
        offText: 'ACTIVAR OFF: la señal metabólica disminuye y el reactor vuelve al modo de observación.'
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

  /*
    Copia del display del reactor (Sala 2). Vive aqui, en el mismo sistema
    ES/EN que el resto del museo: script.js la lee via
    window.MUSEUM_I18N.reactorPanel y solo cae en su copia local de
    seguridad si este fichero no hubiera cargado.
  */
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

  const esContent = {
    bacteriaLarge01: {
      lead: 'Mucho más que fotosíntesis',
      tags: ['FOTOSÍNTESIS', 'DIVERSIDAD METABÓLICA', 'PHA'],
      title: 'BACTERIAS FOTOTRÓFICAS PÚRPURAS',
      label: 'EXPLORAR +',
      body: 'Las bacterias fototróficas púrpuras (PPB) son un grupo diverso de microorganismos capaces de utilizar la luz como fuente de energía. Sin embargo, lo que las hace especialmente interesantes no es solo su capacidad fotosintética, sino también la extraordinaria variedad de estrategias metabólicas que pueden desarrollar.\n\nSegún la especie y las condiciones ambientales, estas bacterias pueden modificar su metabolismo, fijar nitrógeno, transformar compuestos orgánicos, utilizar determinados gases, intercambiar electrones con minerales o electrodos y almacenar carbono en forma de PHA (biopolímeros con posibles aplicaciones en la producción de plásticos de origen biológico). Algunas cepas también son especialmente eficientes en la producción de hidrógeno, mientras que la biomasa obtenida de su cultivo se investiga para aplicaciones alimentarias y de nutrición animal.\n\nEsta diversidad convierte a las bacterias fototróficas púrpuras en organismos importantes tanto para comprender procesos biológicos fundamentales —como la conversión de la luz en energía y la adaptación celular a las condiciones ambientales— como para investigar procesos biotecnológicos más sostenibles. Su cultivo abre posibilidades relacionadas con la producción de hidrógeno, los bioplásticos, la biomasa y los sistemas bioelectroquímicos.\n\nPero no todas se comportan del mismo modo.\n\nA partir de este punto, la exposición se centra en ocho cepas concretas y muestra las características y capacidades que diferencian a cada una.\n\n01. RHODOSPIRILLUM RUBRUM\nUna bacteria clave para comprender la fotosíntesis\n\nRhodospirillum rubrum ha desempeñado un papel importante en la historia de la investigación sobre la fotosíntesis bacteriana. Su aparato fotosintético relativamente sencillo la convirtió en uno de los primeros organismos modelo utilizados para estudiar cómo la energía de la luz se transforma, mediante la transferencia de electrones, en energía que la célula puede utilizar.\n\nSu estudio también ha ayudado a comprender la relación entre la producción de energía, la fijación de nitrógeno y el metabolismo del carbono, y ha mostrado cómo una bacteria coordina distintos procesos según sus necesidades y las condiciones ambientales.\n\nSu relevancia no se limita a la investigación fundamental. R. rubrum puede acumular PHA en forma de gránulos intracelulares. Estos compuestos actúan como reservas de carbono para la bacteria y pueden utilizarse en la producción de materiales de origen biológico y biodegradables. Actualmente, la especie también se investiga como posible ingrediente nutritivo para alimentación humana y animal.'
    },
    spaceMission: {
      title: 'RHODOSPIRILLUM RUBRUM EN EL ESPACIO',
      lead: 'Siete días a bordo de la Estación Espacial Internacional',
      tags: ['VUELO ESPACIAL', 'MICROGRAVEDAD', 'SOPORTE VITAL DE CICLO CERRADO'],
      body: 'Las futuras misiones espaciales necesitarán formas de producir alimentos, reciclar residuos y regenerar el aire y el agua sin depender de suministros constantes desde la Tierra. Una posible solución consiste en utilizar microorganismos beneficiosos dentro de ecosistemas cerrados diseñados para este fin.\n\nEn 2015, un grupo de científicos envió Rhodospirillum rubrum y otras especies bacterianas útiles a la Estación Espacial Internacional durante siete días. El cultivo original se dividió en dos grupos: uno permaneció en la Tierra y el otro viajó a la órbita terrestre baja, donde estuvo expuesto a la microgravedad y a una radiación más elevada.\n\nDespués del vuelo, el equipo reactivó ambos cultivos y los comparó. R. rubrum sobrevivió al viaje, creció con normalidad y continuó realizando sus funciones biológicas esperadas. El vuelo espacial pareció tener poco efecto sobre su rendimiento general.\n\nEstos resultados respaldan la posibilidad de utilizar esta bacteria púrpura comestible en sistemas experimentales de soporte vital. En el futuro, microorganismos como R. rubrum podrían ayudar a reciclar recursos, reducir la dependencia del suministro terrestre y quizá contribuir a alimentar a los astronautas durante misiones de larga duración.'
    },
    bacteriaSmall01: {
      lead: 'La maquinaria que convierte la luz en energía',
      tags: ['CENTRO DE REACCIÓN', 'PREMIO NOBEL'],
      label: 'VER +',
      body: 'Dentro de las bacterias fotosintéticas, unas estructuras especializadas captan la energía luminosa e inician su conversión en energía química. El centro de reacción fotosintético de Blastochloris viridis ocupa un lugar especialmente importante en la historia de la ciencia.\n\nFue el primer complejo de proteínas de membrana cuya estructura se resolvió a escala atómica. Observar su organización con este nivel de detalle permitió comprender mejor uno de los procesos esenciales de la fotosíntesis: la conversión inicial de la energía luminosa en energía química.\n\nEste descubrimiento fue mucho más allá del estudio de una sola bacteria. Abrió nuevas posibilidades para investigar la estructura de las proteínas de membrana y contribuyó a las investigaciones reconocidas con el Premio Nobel de Química de 1988.'
    },
    bacteriaSmall02: {
      lead: 'Cambiar desde dentro para adaptarse',
      tags: ['CROMATÓFOROS', 'ADAPTACIÓN'],
      label: 'VER +',
      body: 'Las bacterias no son organismos estáticos. Algunas pueden modificar su propia arquitectura celular en respuesta a las condiciones del entorno.\n\nCereibacter sphaeroides —antes conocida como Rhodobacter sphaeroides— es uno de los microorganismos fotosintéticos más estudiados y ofrece un ejemplo especialmente claro de esta capacidad de adaptación.\n\nCuando disminuye la disponibilidad de oxígeno, la bacteria desarrolla extensas membranas intracelulares conocidas como cromatóforos. Estas membranas contienen la maquinaria necesaria para la fotosíntesis. A medida que cambian las condiciones ambientales, también cambia la organización interna de la célula.\n\nLa investigación sobre C. sphaeroides ha ayudado a comprender tanto los mecanismos moleculares de transferencia de electrones durante la fotosíntesis como la manera en que los microorganismos regulan y reorganizan su metabolismo ante cambios en el entorno.'
    },
    bacteriaSmall03: {
      lead: 'Coordinar la luz, el nitrógeno y la energía',
      tags: ['FIJACIÓN DE NITRÓGENO', 'EQUILIBRIO REDOX'],
      label: 'VER +',
      body: 'Una célula debe coordinar muchos procesos al mismo tiempo. Rhodobacter capsulatus se ha convertido en un organismo modelo importante para estudiar cómo una bacteria fotosintética mantiene este equilibrio.\n\nLa investigación sobre esta especie ha revelado conexiones importantes entre la fotosíntesis, la fijación de nitrógeno y el equilibrio redox celular. Estos procesos están interrelacionados y forman parte de las redes reguladoras que controlan cómo obtiene y utiliza energía la célula.\n\nMás recientemente, los estudios estructurales han revelado una arquitectura inusualmente compacta en su complejo captador de luz y centro de reacción.\n\nSu estudio demuestra que, incluso dentro de las bacterias fototróficas púrpuras, existen distintas soluciones biológicas para captar la luz, gestionar la energía y responder a cambios en las condiciones ambientales.'
    },
    bacteriaLarge02: {
      lead: 'Una forma diferente de reproducirse',
      tags: ['HIFAS', 'GEMACIÓN', 'CICLO VITAL'],
      label: 'EXPLORAR +',
      body: 'Solemos imaginar que las bacterias se reproducen mediante una división sencilla en la que una célula genera dos células casi idénticas. Rhodomicrobium vannielii demuestra que la reproducción bacteriana puede ser bastante más compleja.\n\nEsta bacteria desarrolla extensiones filamentosas llamadas hifas. Las nuevas células se forman por gemación en los extremos de estas estructuras. Aparece una pequeña yema, crece gradualmente y finalmente se separa para formar una nueva célula.\n\nEste ciclo vital incluye procesos de diferenciación celular y etapas multicelulares poco habituales, por lo que R. vannielii es un organismo importante para estudiar la evolución de ciclos vitales bacterianos complejos.\n\nSu morfología característica también ofrece un ejemplo llamativo de la extraordinaria diversidad existente entre las bacterias fotosintéticas.'
    },
    bacteriaSmall04: {
      lead: 'Bacterias conectadas a la electricidad',
      tags: ['ELECTROACTIVIDAD', 'BIOELECTROQUÍMICA'],
      label: 'VER +',
      body: 'Algunas bacterias fototróficas púrpuras poseen una capacidad especialmente sorprendente: son electroactivas. Esto significa que pueden intercambiar electrones con elementos situados fuera de la célula.\n\nLas especies de Rhodovulum —entre ellas Rhodovulum sulfidophilum y Rhodovulum visakhapatnamense— pueden obtener electrones del hidrógeno, del hierro o incluso directamente de un electrodo.\n\nEstos procesos permiten comprender la bacteria no como un organismo aislado, sino como parte de un sistema en el que la materia biológica y los materiales conductores pueden intercambiar cargas eléctricas.\n\nLos mecanismos responsables de esta electroactividad todavía no se conocen por completo. Por ello, estas bacterias siguen siendo un campo activo de investigación y ofrecen nuevas oportunidades para estudiar las interacciones entre microorganismos, minerales y sistemas bioelectroquímicos.'
    },
    bacteriaSmall05: {
      lead: 'Vivir de un gas tóxico',
      tags: ['MONÓXIDO DE CARBONO', 'BIOHIDRÓGENO'],
      label: 'VER +',
      body: 'El monóxido de carbono (CO) es tóxico para muchos organismos. Sin embargo, Rubrivivax gelatinosus es capaz de utilizarlo como fuente de energía.\n\nEn condiciones anaerobias —en ausencia de oxígeno— algunas bacterias fototróficas púrpuras pueden oxidar el CO mediante sistemas enzimáticos especializados. En R. gelatinosus, este metabolismo también puede estar vinculado a la producción de hidrógeno.\n\nEsta capacidad ha convertido a la especie en un modelo importante para estudiar tanto la conversión biológica del monóxido de carbono como posibles procesos de producción de biohidrógeno.\n\nSu caso ilustra una de las ideas principales de esta sala: la notable flexibilidad metabólica de las bacterias fototróficas púrpuras y su capacidad para aprovechar sustancias y condiciones ambientales que resultarían desfavorables para muchos otros organismos.'
    },
    bacteriaSmall06: {
      lead: 'Cuando una capacidad biológica se convierte en una oportunidad',
      tags: ['FOTOFERMENTACIÓN', 'ELECTROACTIVIDAD'],
      label: 'VER +',
      body: 'Rhodopseudomonas palustris reúne varias de las capacidades exploradas a lo largo de la exposición.\n\nPuede utilizar la luz para favorecer la degradación anaerobia de compuestos aromáticos derivados de las plantas, contribuyendo al reciclaje de materia orgánica compleja y a procesos relacionados con el ciclo del carbono.\n\nTambién es especialmente eficaz en la producción de hidrógeno mediante fotofermentación. Entre las bacterias fototróficas púrpuras estudiadas para este proceso, determinadas cepas de R. palustris —como la cepa 42OL— han alcanzado una productividad de hidrógeno especialmente elevada.\n\nAdemás, presenta otra característica importante: la electroactividad. Algunas cepas pueden intercambiar electrones con electrodos y, al combinar electricidad y luz, utilizar estos procesos para generar productos valiosos como PHA y determinados biocombustibles.\n\nEn este punto hemos terminado de observar de cerca las bacterias. El siguiente paso consiste en comprender cómo pueden cultivarse y cómo aprovechar estas capacidades a una escala mayor.'
    },
    reactor01: {
      lead: 'Crear las condiciones adecuadas para el crecimiento microbiano',
      tags: ['CULTIVO', 'CONDICIONES CONTROLADAS', 'PROCESO'],
      title: 'FOTOBIORREACTOR',
      label: 'VER PROCESO +',
      body: 'DE LA BACTERIA AL BIOPROCESO\n\nEn la sala anterior descubrimos la notable diversidad metabólica de las bacterias fototróficas púrpuras.\n\nPero comprender lo que estos microorganismos pueden hacer es solo el principio. Para utilizar sus capacidades, el equipo investigador necesita crear entornos controlados en los que las bacterias reciban la luz, los nutrientes y las condiciones de funcionamiento adecuadas. Los fotobiorreactores hacen esto posible.\n\nDentro de estos sistemas, los microorganismos pueden cultivarse en condiciones controladas, lo que permite estudiar y desarrollar procesos relacionados con la producción de hidrógeno, los bioplásticos, la biomasa y las aplicaciones bioelectroquímicas.\n\nEn esta sala, la atención pasa del propio microorganismo al proceso.\n\nFOTOBIORREACTOR\n\nUn fotobiorreactor proporciona un entorno controlado para cultivar microorganismos fotosintéticos.\n\nEl sistema permite gestionar condiciones clave como la luz, el aporte de nutrientes y la circulación mientras crece el cultivo. Al controlar estas variables, se puede investigar cómo las bacterias fototróficas púrpuras transforman recursos y producen compuestos de posible interés.\n\nPor tanto, el reactor representa la transición entre comprender la biología de estos microorganismos y utilizar sus capacidades en procesos tecnológicos.'
    },
    window01: {
      title: 'DE LA LUZ AL HIDRÓGENO',
      lead: 'Fotofermentación',
      tags: ['HIDRÓGENO', 'FOTOFERMENTACIÓN'],
      body: 'Algunas bacterias fototróficas púrpuras pueden utilizar la energía luminosa para producir hidrógeno mediante un proceso conocido como fotofermentación.\n\nRhodopseudomonas palustris es especialmente relevante en este campo, ya que determinadas cepas presentan una alta productividad de hidrógeno.\n\nEste proceso muestra cómo el metabolismo de un microorganismo puede convertirse en la base de una posible vía de energía renovable.'
    },
    window02: {
      title: 'DEL CARBONO AL BIOPLÁSTICO',
      lead: 'Producción de PHA',
      tags: ['PHA', 'BIOPLÁSTICO'],
      body: 'Algunas bacterias fototróficas púrpuras pueden acumular carbono dentro de sus células en forma de PHA.\n\nPara el microorganismo, estos compuestos funcionan como reservas de carbono y energía. Sin embargo, para la biotecnología, el PHA resulta especialmente interesante porque puede utilizarse como base para producir materiales de origen biológico y biodegradables.\n\nEl proceso establece una conexión directa entre el metabolismo microbiano y el desarrollo de materiales alternativos.'
    },
    window03: {
      title: 'DEL CULTIVO A LA BIOMASA',
      lead: 'Aplicaciones en alimentación humana y animal',
      tags: ['BIOMASA', 'ALIMENTACIÓN'],
      body: 'El cultivo de bacterias fototróficas púrpuras también produce biomasa microbiana.\n\nEsta biomasa contiene compuestos de interés nutricional y se investiga para posibles aplicaciones en alimentación humana y animal.\n\nEl reto no consiste únicamente en producir biomasa, sino también en desarrollar sistemas de cultivo capaces de generarla de forma eficiente y a una escala adecuada.'
    },
    window04: {
      title: 'BIOELECTRICIDAD',
      lead: 'Microorganismos y electrodos',
      tags: ['ELECTROACTIVIDAD', 'BIOELECTROQUÍMICA'],
      body: 'Algunas bacterias fototróficas púrpuras son electroactivas.\n\nEsto significa que pueden intercambiar electrones con materiales externos, incluidos los electrodos.\n\nEstas interacciones permiten investigar sistemas bioelectroquímicos en los que los microorganismos vivos y los materiales conductores forman parte de un mismo proceso.\n\nLa electroactividad abre nuevas posibilidades para conectar el metabolismo microbiano con sistemas tecnológicos.'
    },
    window05: {
      title: 'ESCALADO',
      lead: 'Del laboratorio a una producción mayor',
      tags: ['ESCALADO', 'PRODUCCIÓN'],
      body: 'Un proceso biológico satisfactorio debe acabar saliendo del laboratorio.\n\nUna estrategia para reducir los costes de producción e instalación consiste en cultivar bacterias fototróficas púrpuras en reactores de bolsas de plástico de bajo coste, utilizando equipos de calidad alimentaria.\n\nEn lugar de construir un único reactor cada vez más grande, la capacidad de producción puede ampliarse operando varios reactores en paralelo.\n\nEste enfoque ofrece una forma flexible de aumentar la capacidad de cultivo y mantener, al mismo tiempo, un sistema relativamente sencillo.'
    },
    window06: {
      title: 'UN MICROORGANISMO, MUCHOS RESULTADOS',
      lead: 'Diferentes procesos, diferentes posibilidades',
      tags: ['HIDRÓGENO', 'PHA', 'BIOMASA', 'INTERCAMBIO DE ELECTRONES'],
      body: 'Las bacterias fototróficas púrpuras no conducen a un único producto o aplicación.\n\nSegún la cepa, las condiciones de cultivo y el proceso, su metabolismo puede vincularse a distintos resultados.\n\nHIDRÓGENO\nPHA\nBIOMASA\nINTERCAMBIO DE ELECTRONES\n\nEl valor de estos microorganismos reside precisamente en esta diversidad.\n\nDiferentes bacterias, diferentes procesos y diferentes posibilidades.\n\nBACTERIA → PROCESO → RESULTADO\n\nComprender el microorganismo es el primer paso. Controlar el proceso es lo que permite explorar sus capacidades a una escala mayor.'
    }
  };

  window.MUSEUM_I18N = { ui, reactor, reactorPanel, electroactivity, content: { en: {}, es: esContent } };
  window.getMuseumUiText = function getMuseumUiText(key) {
    return (ui[language] && ui[language][key]) || ui.en[key] || key;
  };
  window.getMuseumReactorText = function getMuseumReactorText(id) {
    return (reactor[language] && reactor[language][id]) || reactor.en[id];
  };
  window.getMuseumReactorPanelText = function getMuseumReactorPanelText() {
    return reactorPanel[language] || reactorPanel.en;
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

    const close = document.querySelector('.panel-close');
    if (close) close.setAttribute('aria-label', t('close'));

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
