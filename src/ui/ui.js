import { DEFAULT_GRAPHICS, normalizeGraphics, PIXEL_QUALITIES, PIXEL_STYLES } from '../core/pixel-graphics.js';

export class GameUI {
  constructor(app, callbacks = {}) {
    this.app = app;
    this.callbacks = callbacks;
    this.profile = { name: 'Johannes', outfit: 'dunkelgruen', hair: 'braun' };
    this.graphics = { ...DEFAULT_GRAPHICS };
    this.mainQuest = null;
    this.sideQuests = [];
    this.visitedLocations = new Set();
    this.hudIsVisible = false;
    this.render();
    this.bindEvents();
  }

  render() {
    this.app.innerHTML = `
      <main class="game-shell market-shell">
        <canvas id="game-canvas" aria-label="Spielbare Altstadt von Trier"></canvas>
        <div class="screen-vignette"></div>
        <section class="boot-screen" id="boot-screen">
          <div class="boot-mark">SKG</div><p>Hauptmarkt wird belebt …</p><div class="loading-line"><i></i></div>
        </section>
        <section class="start-overlay main-menu" id="start-overlay" aria-label="SKG Hauptmenü">
          <header class="main-menu-title">
            <p class="eyebrow">Freitag · 19:47 · Golden Hour</p>
            <h1>SKG</h1>
            <p>Auf der Suche nach dem Goldenen Viezporz</p>
          </header>
          <div class="main-menu-layout">
            <section class="main-menu-card" aria-label="Charakter auswählen">
              <label for="character-name">Dein Name</label>
              <input id="character-name" maxlength="20" value="Johannes" autocomplete="name" />
              <div class="menu-choice-group">
                <span>Kleidung</span>
                <div class="menu-choices" data-field="outfit" role="radiogroup" aria-label="Kleidungsfarbe">
                  <button class="menu-choice beige" data-value="beige" type="button">Beige</button>
                  <button class="menu-choice dunkelgruen active" data-value="dunkelgruen" type="button">Dunkelgrün</button>
                  <button class="menu-choice weinrot" data-value="weinrot" type="button">Weinrot</button>
                  <button class="menu-choice dunkelblau" data-value="dunkelblau" type="button">Dunkelblau</button>
                  <button class="menu-choice anthrazit" data-value="anthrazit" type="button">Anthrazit</button>
                </div>
              </div>
              <div class="menu-choice-group">
                <span>Haare</span>
                <div class="menu-choices" data-field="hair" role="radiogroup" aria-label="Haarfarbe">
                  <button class="menu-choice schwarz" data-value="schwarz" type="button">Schwarz</button>
                  <button class="menu-choice braun active" data-value="braun" type="button">Braun</button>
                  <button class="menu-choice blond" data-value="blond" type="button">Blond</button>
                  <button class="menu-choice rot" data-value="rot" type="button">Rot</button>
                  <button class="menu-choice grau" data-value="grau" type="button">Grau</button>
                </div>
              </div>
              <button class="menu-start-button" id="start-game" type="button">Spiel starten <span>→</span></button>
              <div class="menu-utility" aria-label="Weitere Informationen">
                <button id="menu-settings" type="button">Einstellungen</button>
                <button id="menu-credits" type="button">Credits</button>
              </div>
              <section class="graphics-settings hidden" id="graphics-settings" aria-label="Grafikeinstellungen">
                <p>2.5D Atelier · Hauptmarkt-Test</p>
                <div class="graphics-choices" data-graphics-field="style" role="radiogroup" aria-label="Pixel-Stil">
                  <button data-value="soft" type="button">Atelier weich</button>
                  <button data-value="classic" type="button">Atelier klassisch</button>
                  <button data-value="sharp" type="button">Atelier kontrast</button>
                  <button data-value="modern" type="button">Modern 3D</button>
                </div>
                <div class="graphics-choices" data-graphics-field="quality" role="radiogroup" aria-label="Pixel-Qualität">
                  <button data-value="low" type="button">Atelier – Low</button>
                  <button data-value="medium" type="button">Atelier – Medium</button>
                  <button data-value="high" type="button">Atelier – High</button>
                </div>
                <small id="graphics-summary"></small>
              </section>
              <p class="menu-message" id="menu-message" aria-live="polite">Deine Auswahl wird automatisch gespeichert.</p>
            </section>
            <aside class="menu-character-stage" aria-label="Charaktervorschau">
              <span>Charaktervorschau</span>
              <i>Die Figur im Hintergrund ist deine Spielfigur.</i>
            </aside>
          </div>
          <p class="menu-atmosphere">Hauptmarkt · Trier · Klick zum Laufen · WASD · Mausrad zum Zoomen</p>
        </section>
        <section class="market-hud hidden" id="market-hud" aria-label="Spielinformationen">
          <div class="hud-clock" aria-label="Aktuelle Spielzeit"><span aria-hidden="true">◷</span><time id="story-clock">19:30</time></div>
          <div class="location-toast hidden" id="location-toast" role="status"><span aria-hidden="true">⌖</span><b id="location-toast-name">Hauptbahnhof</b></div>
          <aside class="hud-navigation" aria-label="Orientierung">
            <p class="hud-location-name" id="location-name">Hauptbahnhof</p>
            <button class="compass-minimap" id="open-map" aria-label="Stadtkarte öffnen" type="button">
              <span class="minimap-world" id="minimap-world" aria-hidden="true">
                <i class="minimap-water"></i><i class="minimap-road minimap-road-main"></i><i class="minimap-road minimap-road-east"></i><i class="minimap-road minimap-road-south"></i><i class="minimap-road minimap-road-west"></i><i class="minimap-road minimap-road-northwest"></i>
                <i class="minimap-place minimap-porta"></i><i class="minimap-place minimap-market"></i><i class="minimap-place minimap-dom"></i><i class="minimap-place minimap-korn"></i><i class="minimap-position"></i>
                <i class="minimap-wine" title="Weinstand"></i><i class="minimap-marker main hidden" id="minimap-quest-marker">◆</i><i class="minimap-marker side hidden" id="minimap-side-marker">!</i>
              </span>
              <i class="minimap-player-marker" aria-hidden="true"></i><span class="minimap-open-label">Karte</span>
            </button>
          </aside>
          <aside class="hud-objective" id="quest-card" aria-live="polite">
            <p class="hud-objective-kind" id="quest-kind">HAUPTQUEST</p><h2 id="quest-title">Ein Freitagabend in Trier</h2><p id="quest-objective">Triff Johannes am Weinstand.</p>
          </aside>
          <aside class="hud-side-quests" id="side-quest-card" aria-live="polite" aria-label="Freiwillige Nebenquests">
            <p class="hud-side-quest-heading"><span>✦</span> NEBENQUESTS <b id="side-quest-count">0</b></p>
            <div class="hud-side-quest-list" id="side-quest-list"></div>
          </aside>
          <button class="world-interact hidden" id="interact-button" aria-label="Mit Person sprechen"><kbd>E</kbd><span id="interact-label">Sprechen</span></button>
          <div class="mobile-controls"><div class="joystick" id="joystick" aria-label="Bewegen"><span>LAUFEN</span><i></i></div><button class="mobile-talk is-unavailable" id="mobile-interact" aria-label="Reden: Komm näher an eine Figur." data-hint="Komm näher an eine Figur." type="button" disabled><i>✦</i><span id="mobile-interact-text">REDEN</span></button></div>
        </section>
        <section class="dialogue-layer hidden" id="dialogue-layer" aria-live="polite"></section>
        <div class="memory-toast hidden" id="memory-toast" role="status"></div>
        <section class="demo-finale hidden" id="demo-finale" aria-live="assertive"><div><p class="eyebrow">Kapitel 1 abgeschlossen</p><h2>Ein Freitagabend in Trier</h2><p>Freigeschaltete Erinnerungen</p><ul id="finale-memories"></ul><blockquote>„Manche Geschichten beginnen mit einem Schatz.“<br>„Unsere begann mit einem gewöhnlichen Freitagabend.“</blockquote><strong>FORTSETZUNG FOLGT</strong><div class="finale-actions"><button id="view-memories" type="button">Erinnerungen ansehen</button><button id="free-explore" type="button">Demo frei erkunden</button><button id="restart-demo" type="button">Demo neu starten</button><button id="return-to-menu" type="button">Hauptmenü</button></div></div></section>
        <section class="city-map hidden" id="city-map" aria-label="Stadtkarte Trier">
          <div class="city-map-card">
            <button class="close-city-map" id="close-map" aria-label="Karte schließen">×</button>
            <p class="eyebrow">Trierer Altstadt · Orientierung</p>
            <h2>Dein Rundgang</h2>
            <p class="map-caption">Norden ist oben. Die Karte ist für den Spielweg verdichtet, nicht maßstabsgetreu.</p>
            <svg viewBox="0 0 620 520" role="img" aria-label="Spielkarte von Porta Nigra, Simeonstraße, Hauptmarkt, Sternstraße, Domfreihof, Brotstraße, Fleischstraße und Kornmarkt">
              <defs><linearGradient id="mapPaper" x1="0" x2="1"><stop stop-color="#21332f"/><stop offset="1" stop-color="#172622"/></linearGradient></defs>
              <rect x="8" y="8" width="604" height="504" rx="18" fill="url(#mapPaper)" stroke="#d6ab58" stroke-opacity=".55"/>
              <path class="map-blocks" d="M132 92h122v94H132zM357 86h140v118H357zM116 233h128v90H116zM370 236h156v86H370zM162 344h111v123H162zM345 344h110v123H345z"/>
              <path class="map-road main" d="M310 76V260M310 330v142"/><path class="map-road side" d="M310 294H494M310 294H136M310 362l-62 65M310 362l64 65"/>
              <path class="map-road thin" d="M180 128h116M334 132h131M190 239h102M375 236h120M194 393h67M359 393h75"/>
              <circle class="map-place porta" cx="310" cy="66" r="23"/><path class="map-arch" d="M293 74v-16c0-11 15-11 15 0v16m4 0v-16c0-11 15-11 15 0v16"/>
              <circle class="map-place market" cx="310" cy="294" r="45"/><circle class="map-fountain" cx="310" cy="294" r="14"/><path class="map-place dom" d="M494 306v-36h38v36m-30-36v-19m22 19v-19"/><circle class="map-place korn" cx="310" cy="470" r="22"/>
              <path class="map-route-line" d="M310 88V246M354 294H470M310 338v96M286 348l-44 59M334 348l45 59"/>
              <circle class="map-player-marker" id="map-player-large" cx="94" cy="100" r="9"/>
              <text class="map-target-marker" id="map-quest-target" x="284" y="281">✦</text>
              <text x="310" y="30" text-anchor="middle" class="map-north">N ↑</text>
              <text x="344" y="71" class="map-label">PORTA NIGRA</text><text x="324" y="178" class="map-label">SIMEONSTRASSE</text>
              <text x="310" y="354" text-anchor="middle" class="map-label">HAUPTMARKT</text><text x="392" y="279" class="map-label">STERNSTRASSE</text>
              <text x="493" y="250" class="map-label">DOMFREIHOF</text><text x="128" y="286" class="map-small-label">JAKOBSTR.</text>
              <text x="188" y="438" class="map-small-label">BROTSTR.</text><text x="366" y="438" class="map-small-label">FLEISCHSTR.</text><text x="310" y="507" text-anchor="middle" class="map-small-label">KORNMARKT</text>
            </svg>
            <div class="map-legend"><span><i class="legend-player"></i>Du bist hier</span><span><i class="legend-route"></i>Spielweg</span></div>
          </div>
        </section>
      </main>`;
    this.elements = {
      canvas: this.app.querySelector('#game-canvas'),
      boot: this.app.querySelector('#boot-screen'),
      start: this.app.querySelector('#start-overlay'),
      hud: this.app.querySelector('#market-hud'),
      name: this.app.querySelector('#character-name'),
      startButton: this.app.querySelector('#start-game'),
      settings: this.app.querySelector('#menu-settings'),
      credits: this.app.querySelector('#menu-credits'),
      menuMessage: this.app.querySelector('#menu-message'),
      graphicsSettings: this.app.querySelector('#graphics-settings'),
      graphicsSummary: this.app.querySelector('#graphics-summary'),
      map: this.app.querySelector('#city-map'),
      openMap: this.app.querySelector('#open-map'),
      closeMap: this.app.querySelector('#close-map'),
      locationName: this.app.querySelector('#location-name'),
      locationToast: this.app.querySelector('#location-toast'),
      locationToastName: this.app.querySelector('#location-toast-name'),
      storyClock: this.app.querySelector('#story-clock'),
      minimapWorld: this.app.querySelector('#minimap-world'),
      minimapQuestMarker: this.app.querySelector('#minimap-quest-marker'),
      minimapSideMarker: this.app.querySelector('#minimap-side-marker'),
      mapQuestTarget: this.app.querySelector('#map-quest-target'),
      joystick: this.app.querySelector('#joystick'),
      questCard: this.app.querySelector('#quest-card'),
      questKind: this.app.querySelector('#quest-kind'),
      questTitle: this.app.querySelector('#quest-title'),
      questObjective: this.app.querySelector('#quest-objective'),
      sideQuestCard: this.app.querySelector('#side-quest-card'),
      sideQuestCount: this.app.querySelector('#side-quest-count'),
      sideQuestList: this.app.querySelector('#side-quest-list'),
      interact: this.app.querySelector('#interact-button'),
      interactLabel: this.app.querySelector('#interact-label'),
      mobileInteract: this.app.querySelector('#mobile-interact'),
      mobileInteractText: this.app.querySelector('#mobile-interact-text'),
      dialogue: this.app.querySelector('#dialogue-layer'),
      memoryToast: this.app.querySelector('#memory-toast'),
      finale: this.app.querySelector('#demo-finale'),
      finaleMemories: this.app.querySelector('#finale-memories'),
      viewMemories: this.app.querySelector('#view-memories'),
      freeExplore: this.app.querySelector('#free-explore'),
      restartDemo: this.app.querySelector('#restart-demo'),
      returnToMenu: this.app.querySelector('#return-to-menu'),
    };
  }

  bindEvents() {
    this.app.querySelectorAll('.menu-choices button').forEach((button) => button.addEventListener('click', () => {
      this.profile[button.parentElement.dataset.field] = button.dataset.value;
      button.parentElement.querySelectorAll('button').forEach((item) => item.classList.toggle('active', item === button));
      this.emitProfileChange();
    }));
    this.elements.name.addEventListener('input', () => {
      this.profile.name = this.elements.name.value.trim().slice(0, 20) || 'Gast';
      this.emitProfileChange();
    });
    this.elements.startButton.addEventListener('click', () => this.callbacks.onStart?.({ ...this.profile, name: this.elements.name.value.trim() || 'Gast' }));
    this.elements.settings.addEventListener('click', () => {
      const isClosed = this.elements.graphicsSettings.classList.toggle('hidden');
      this.elements.menuMessage.textContent = isClosed ? 'Einstellungen geschlossen.' : 'Hauptmarkt-Test: handgemalte 2.5D-Materialien – ohne Bildschirmfilter.';
    });
    this.elements.credits.addEventListener('click', () => {
      this.elements.menuMessage.textContent = 'SKG · Auf der Suche nach dem Goldenen Viezporz · entwickelt für Trier.';
    });
    this.elements.start.addEventListener('pointerdown', () => this.callbacks.onMenuInteraction?.(), { once: true });
    this.elements.start.querySelectorAll('button').forEach((button) => button.addEventListener('mouseenter', () => this.callbacks.onMenuHover?.()));
    this.app.querySelectorAll('[data-graphics-field] button').forEach((button) => button.addEventListener('click', () => {
      this.graphics[button.parentElement.dataset.graphicsField] = button.dataset.value;
      this.graphics = normalizeGraphics(this.graphics);
      this.syncGraphicsControls();
      this.callbacks.onGraphicsChange?.({ ...this.graphics });
    }));
    this.elements.openMap.addEventListener('click', () => this.toggleMap());
    this.elements.closeMap.addEventListener('click', () => this.toggleMap(false));
    this.elements.interact.addEventListener('click', () => this.callbacks.onInteract?.());
    this.elements.mobileInteract.addEventListener('click', () => this.callbacks.onInteract?.());
    this.elements.viewMemories.addEventListener('click', () => this.elements.finaleMemories.classList.toggle('is-expanded'));
    this.elements.freeExplore.addEventListener('click', () => this.callbacks.onFreeExplore?.());
    this.elements.restartDemo.addEventListener('click', () => this.callbacks.onRestartDemo?.());
    this.elements.returnToMenu.addEventListener('click', () => this.callbacks.onReturnToMenu?.());
    window.addEventListener('keydown', (event) => {
      if (event.code === 'KeyM') this.toggleMap();
      if (event.code === 'Escape') this.toggleMap(false);
      // Dialogue choices need a deliberate click/tap, but a simple spoken
      // line should be comfortably readable with one hand on the keyboard.
      // Capture this before the world input handler: it also uses Enter for
      // interaction, which would otherwise interrupt the current dialogue.
      if ((event.key === 'Enter' || event.code === 'NumpadEnter') && !event.repeat && !this.elements.dialogue.classList.contains('hidden')) {
        const next = this.elements.dialogue.querySelector('.dialogue-next');
        if (next) {
          event.preventDefault();
          event.stopImmediatePropagation();
          next.click();
        }
      }
    }, { capture: true });
    this.bindJoystick();
  }

  bindJoystick() {
    const joystick = this.elements.joystick;
    let active = false;
    const move = (event) => {
      if (!active) return;
      const point = event.touches ? event.touches[0] : event;
      const rect = joystick.getBoundingClientRect();
      const max = rect.width * .3;
      const dx = point.clientX - (rect.left + rect.width / 2);
      const dy = point.clientY - (rect.top + rect.height / 2);
      const length = Math.hypot(dx, dy) || 1;
      const x = length > max ? (dx / length) * max : dx;
      const y = length > max ? (dy / length) * max : dy;
      joystick.querySelector('i').style.transform = `translate(${x}px, ${y}px)`;
      this.callbacks.onJoystick?.(x / max, y / max);
    };
    const end = () => { active = false; joystick.querySelector('i').style.transform = ''; this.callbacks.onJoystick?.(0, 0); };
    joystick.addEventListener('pointerdown', (event) => { active = true; joystick.setPointerCapture(event.pointerId); move(event); });
    joystick.addEventListener('pointermove', move);
    joystick.addEventListener('pointerup', end);
    joystick.addEventListener('pointercancel', end);
  }

  showStart(saved, graphics = DEFAULT_GRAPHICS) {
    this.elements.boot.classList.add('hidden');
    if (saved) {
      const previousOutfits = { wald: 'dunkelgruen', blau: 'dunkelblau', kupfer: 'weinrot' };
      const previousHair = { dunkel: 'schwarz', hell: 'blond' };
      this.profile = {
        ...this.profile,
        ...saved,
        outfit: previousOutfits[saved.outfit] || saved.outfit || this.profile.outfit,
        hair: previousHair[saved.hair] || saved.hair || this.profile.hair,
      };
      this.elements.name.value = this.profile.name;
      this.app.querySelectorAll('.menu-choices button').forEach((button) => button.classList.toggle('active', button.dataset.value === this.profile[button.parentElement.dataset.field]));
    }
    this.graphics = normalizeGraphics(graphics);
    this.syncGraphicsControls();
  }

  syncGraphicsControls() {
    this.app.querySelectorAll('[data-graphics-field] button').forEach((button) => {
      button.classList.toggle('active', button.dataset.value === this.graphics[button.parentElement.dataset.graphicsField]);
    });
    this.elements.graphicsSummary.textContent = `${PIXEL_STYLES[this.graphics.style].label} · ${PIXEL_QUALITIES[this.graphics.quality].label}`;
  }

  emitProfileChange() {
    this.callbacks.onProfileChange?.({ ...this.profile, name: this.elements.name.value.trim() || 'Gast' });
  }

  begin(profile, visitors, showHud = true) {
    this.memories = new Set();
    this.mainQuest = null;
    this.sideQuests = [];
    this.visitedLocations = new Set();
    this.hudIsVisible = false;
    this.elements.start.classList.add('hidden');
    this.elements.hud.classList.toggle('hidden', !showHud);
    this.setStoryTime('Freitag, 19:30');
    this.setSideQuests([]);
    this.updateMarket(visitors, { name: 'Hauptbahnhof Trier', zone: 'hauptbahnhof' });
  }

  revealHud() {
    this.hudIsVisible = true;
    this.elements.hud.classList.remove('hidden');
  }

  updateMarket(_visitors, location = { name: 'Hauptmarkt', zone: 'hauptmarkt' }, playerFacing = null) {
    this.visitedLocations ||= new Set();
    const names = { porta: 'Porta Nigra', simeonstrasse: 'Simeonstraße', christophstrasse: 'Christophstraße', margaretengaesschen: 'Margaretengäßchen', hauptmarkt: 'Hauptmarkt', sternstrasse: 'Sternstraße', domfreihof: 'Domfreihof', brotstrasse: 'Brotstraße', fleischstrasse: 'Fleischstraße', kornmarkt: 'Kornmarkt', hauptbahnhof: 'Hauptbahnhof' };
    // Map orientation is fixed for the entire game: Porta Nigra north,
    // Hauptmarkt in the centre, Domfreihof east and Kornmarkt south.
    const mapPositions = { porta: ['50', '14'], simeonstrasse: ['50', '42'], christophstrasse: ['25', '20'], margaretengaesschen: ['74', '27'], hauptmarkt: ['50', '57'], sternstrasse: ['67', '57'], domfreihof: ['86', '57'], brotstrasse: ['39', '80'], fleischstrasse: ['61', '80'], kornmarkt: ['50', '92'], hauptbahnhof: ['15', '18'] };
    const place = names[location.zone] || names.hauptmarkt;
    this.elements.locationName.textContent = place;
    if (this.hudIsVisible && !this.visitedLocations.has(location.zone)) this.showLocationToast(place);
    this.visitedLocations.add(location.zone);
    const [miniX, miniY] = mapPositions[location.zone] || mapPositions.hauptmarkt;
    this.elements.minimapWorld.style.setProperty('--player-x', `${miniX}%`);
    this.elements.minimapWorld.style.setProperty('--player-y', `${miniY}%`);
    if (playerFacing) {
      const angle = -Math.atan2(playerFacing.x || 0, playerFacing.z || 1) * 180 / Math.PI;
      this.elements.minimapWorld.style.setProperty('--map-rotation', `${angle}deg`);
    }
    const mapPositionsLarge = { porta: ['310', '96'], simeonstrasse: ['310', '190'], christophstrasse: ['156', '116'], margaretengaesschen: ['455', '145'], hauptmarkt: ['310', '294'], sternstrasse: ['405', '294'], domfreihof: ['514', '294'], brotstrasse: ['248', '427'], fleischstrasse: ['374', '427'], kornmarkt: ['310', '470'], hauptbahnhof: ['94', '100'] };
    const [x, y] = mapPositionsLarge[location.zone] || mapPositionsLarge.hauptmarkt;
    this.app.querySelector('#map-player-large').setAttribute('cx', x);
    this.app.querySelector('#map-player-large').setAttribute('cy', y);
  }

  setStoryTime(clock) {
    const match = String(clock || '').match(/\b\d{1,2}:\d{2}\b/);
    if (match) this.elements.storyClock.textContent = match[0];
  }

  setQuest({ title, objective, count, targetId = null }) {
    this.mainQuest = { title, objective, count, targetId };
    const targets = { johannes: ['285', '281'], marc: ['508', '281'], juergen: ['455', '145'], charly: ['304', '466'], weber: ['370', '416'], return: ['285', '281'], porta: ['310', '96'] };
    const miniTargets = { johannes: ['45', '56'], marc: ['85', '56'], juergen: ['74', '27'], charly: ['50', '91'], weber: ['61', '79'], return: ['45', '56'], porta: ['50', '14'] };
    const target = targets[targetId];
    this.elements.mapQuestTarget.style.display = target ? 'block' : 'none';
    if (target) {
      this.elements.mapQuestTarget.setAttribute('x', target[0]);
      this.elements.mapQuestTarget.setAttribute('y', target[1]);
    }
    this.setMinimapMarker(this.elements.minimapQuestMarker, miniTargets[targetId], Boolean(target));
    this.renderObjective(true);
  }

  setSideQuests(quests = []) {
    // Side quests should be discoverable before the player stands directly
    // beside their NPC. Keeping available encounters in this compact HUD list
    // makes the three voluntary moments feel present rather than lost.
    this.sideQuests = quests.filter((quest) => quest && quest.state !== 'completed');
    const markerPositions = { 'porta-photo': ['47', '15'], 'lost-plectrum': ['39', '78'], 'find-the-dom': ['83', '57'] };
    const nextSideQuest = this.sideQuests.find((quest) => ['active', 'found', 'discovered'].includes(quest.state)) || this.sideQuests[0];
    this.setMinimapMarker(this.elements.minimapSideMarker, markerPositions[nextSideQuest?.id], Boolean(nextSideQuest));
    this.renderSideQuestList();
    this.renderObjective(false);
  }

  renderSideQuestList() {
    const states = {
      available: 'FREIWILLIG',
      discovered: 'ENTDECKT',
      active: 'AKTIV',
      found: 'GEFUNDEN',
      completed: 'ERLEDIGT',
    };
    this.elements.sideQuestCount.textContent = String(this.sideQuests.length);
    this.elements.sideQuestCard.classList.toggle('hidden', this.sideQuests.length === 0);
    this.elements.sideQuestList.innerHTML = this.sideQuests.map((quest) => `
      <article class="hud-side-quest-entry is-${this.escape(quest.state)}">
        <div><b>${this.escape(quest.title)}</b><p>${this.escape(quest.objective)}</p></div>
        <em>${states[quest.state] || 'FREIWILLIG'}</em>
      </article>`).join('');
  }

  renderObjective(animate) {
    const activeSideQuest = this.sideQuests?.find((quest) => quest.state === 'active' || quest.state === 'found');
    const quest = this.mainQuest || activeSideQuest;
    if (!quest) return;
    const isMain = quest === this.mainQuest;
    this.elements.questKind.textContent = isMain ? 'HAUPTQUEST' : 'NEBENQUEST';
    this.elements.questTitle.textContent = quest.title;
    this.elements.questObjective.textContent = quest.objective;
    this.elements.questCard.classList.toggle('is-side-quest', !isMain);
    if (animate) {
      this.elements.questCard.classList.remove('is-updated');
      requestAnimationFrame(() => this.elements.questCard.classList.add('is-updated'));
      window.clearTimeout(this.questUpdateTimer);
      this.questUpdateTimer = window.setTimeout(() => this.elements.questCard.classList.remove('is-updated'), 2800);
    }
  }

  setMinimapMarker(marker, position, visible) {
    marker.classList.toggle('hidden', !visible || !position);
    if (!visible || !position) return;
    marker.style.setProperty('--marker-x', `${position[0]}%`);
    marker.style.setProperty('--marker-y', `${position[1]}%`);
  }

  showLocationToast(location) {
    window.clearTimeout(this.locationToastTimer);
    this.elements.locationToastName.textContent = location;
    this.elements.locationToast.classList.remove('hidden', 'is-visible');
    requestAnimationFrame(() => this.elements.locationToast.classList.add('is-visible'));
    this.locationToastTimer = window.setTimeout(() => {
      this.elements.locationToast.classList.remove('is-visible');
      window.setTimeout(() => this.elements.locationToast.classList.add('hidden'), 260);
    }, 2100);
  }

  showInteraction(label) {
    const visible = Boolean(label);
    this.elements.interact.classList.toggle('hidden', !visible);
    this.elements.mobileInteract.classList.remove('hidden');
    this.elements.mobileInteract.disabled = !visible;
    this.elements.mobileInteract.classList.toggle('is-unavailable', !visible);
    if (visible) {
      this.elements.interactLabel.textContent = label;
      const action = label.includes('Optionale Nebenquest')
        ? 'NEBENQUEST'
        : label.includes('Plektrum')
          ? 'AUFHEBEN'
          : label.includes('zusammensitzen')
        ? 'SITZEN'
        : label.includes('ansehen') || label.includes('zusehen')
          ? 'ANSEHEN'
          : label.includes('helfen')
            ? 'HELFEN'
            : 'REDEN';
      this.elements.mobileInteractText.textContent = action;
      this.elements.mobileInteract.dataset.hint = label;
      this.elements.mobileInteract.setAttribute('aria-label', `${action}: ${label}`);
    } else {
      this.elements.mobileInteractText.textContent = 'REDEN';
      this.elements.mobileInteract.dataset.hint = 'Komm näher an eine Figur.';
      this.elements.mobileInteract.setAttribute('aria-label', 'Reden: Komm näher an eine Figur.');
    }
  }

  showDialogue(lines, onFinished) {
    let index = 0;
    const renderLine = () => {
      const line = lines[index];
      const finalLine = index === lines.length - 1;
      this.elements.dialogue.innerHTML = `<article class="dialogue-card"><div class="dialogue-portrait"><i>${this.escape(line.speaker.slice(0, 1))}</i></div><div class="dialogue-copy"><b>${this.escape(line.speaker)}</b><p>${this.escape(line.text)}</p><button class="dialogue-next" type="button">${finalLine ? 'Weiter' : 'Weiter'} <span>→</span></button></div></article>`;
      this.elements.dialogue.querySelector('button').addEventListener('click', () => {
        index += 1;
        if (index < lines.length) renderLine();
        else {
          this.elements.dialogue.classList.add('hidden');
          this.elements.dialogue.innerHTML = '';
          onFinished?.();
        }
      });
    };
    this.elements.dialogue.classList.remove('hidden');
    renderLine();
  }

  showChat(chat, onFinished) {
    const messages = chat?.messages || [];
    this.elements.dialogue.innerHTML = `<article class="dialogue-card group-chat-card"><div class="group-chat-heading"><span>GRUPPENCHAT</span><b>${this.escape(chat?.title || 'SKG')}</b></div><div class="group-chat-messages">${messages.map((message) => `<p><b>${this.escape(message.speaker)}</b>${this.escape(message.text)}</p>`).join('')}</div><button class="dialogue-next" type="button">Weiter <span>→</span></button></article>`;
    this.elements.dialogue.querySelector('button').addEventListener('click', () => {
      this.elements.dialogue.classList.add('hidden');
      this.elements.dialogue.innerHTML = '';
      onFinished?.();
    });
    this.elements.dialogue.classList.remove('hidden');
  }

  showTutorial(text) {
    window.clearTimeout(this.tutorialTimer);
    this.elements.memoryToast.textContent = `Tipp: ${text}`;
    this.elements.memoryToast.classList.remove('hidden');
    this.tutorialTimer = window.setTimeout(() => this.elements.memoryToast.classList.add('hidden'), 5200);
  }

  showChoice({ speaker, text, choices = [] }, onChosen) {
    this.elements.dialogue.innerHTML = `<article class="dialogue-card dialogue-choice-card"><div class="dialogue-portrait"><i>${this.escape(String(speaker || '?').slice(0, 1))}</i></div><div class="dialogue-copy"><b>${this.escape(speaker || '')}</b><p>${this.escape(text || '')}</p><div class="dialogue-choice-list">${choices.map((choice) => `<button class="dialogue-choice" type="button" data-choice="${this.escape(choice.id)}">${this.escape(choice.label)}</button>`).join('')}</div></div></article>`;
    this.elements.dialogue.querySelectorAll('button').forEach((button) => button.addEventListener('click', () => {
      this.elements.dialogue.classList.add('hidden');
      this.elements.dialogue.innerHTML = '';
      onChosen?.(button.dataset.choice);
    }));
    this.elements.dialogue.classList.remove('hidden');
  }

  showMemory(label) {
    this.memories ||= new Set();
    this.memories.add(label);
    window.clearTimeout(this.memoryTimer);
    this.elements.memoryToast.textContent = `Erinnerung: ${label}`;
    this.elements.memoryToast.classList.remove('hidden');
    this.memoryTimer = window.setTimeout(() => this.elements.memoryToast.classList.add('hidden'), 3800);
  }

  showEnding({ memories = [] } = {}) {
    const complete = [...new Set(memories.length ? memories : this.memories || [])];
    this.elements.finaleMemories.innerHTML = complete.map((memory) => `<li>${this.escape(memory)}</li>`).join('');
    this.elements.finaleMemories.classList.remove('is-expanded');
    this.elements.finale.classList.remove('hidden');
  }

  hideEnding() {
    this.elements.finale.classList.add('hidden');
  }

  returnToMenu(saved) {
    this.elements.finale.classList.add('hidden');
    this.elements.dialogue.classList.add('hidden');
    this.elements.dialogue.innerHTML = '';
    this.elements.hud.classList.add('hidden');
    this.elements.start.classList.remove('hidden');
    this.showStart(saved);
  }

  escape(value) {
    return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
  }

  toggleMap(force) {
    const open = typeof force === 'boolean' ? force : this.elements.map.classList.contains('hidden');
    this.elements.map.classList.toggle('hidden', !open);
  }

  showWebGLError() {
    this.elements.boot.classList.add('hidden');
    this.elements.start.innerHTML = '<div class="ending-card"><p class="eyebrow">Leider nicht spielbar</p><h1>WebGL wird benötigt.</h1><p>Öffne SKG in einem aktuellen Browser mit aktivierter Hardwarebeschleunigung.</p></div>';
  }
}
