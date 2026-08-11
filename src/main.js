import { GameEngine } from './core/engine.js';
import { Soundscape } from './audio/soundscape.js';
import { CityStrollQuest } from './quests/city-stroll.js';
import { GameUI } from './ui/ui.js';
import { DEFAULT_GRAPHICS, normalizeGraphics } from './core/pixel-graphics.js';
import './styles.css';

const PROFILE_KEY = 'skg-hauptmarkt-profile-v1';
const GRAPHICS_KEY = 'skg-v3-pixel-graphics-v1';

class HauptmarktSlice {
  constructor(app) {
    this.app = app;
    this.engine = null;
    this.menuEngine = null;
    this.quest = null;
    this.chapterResult = null;
    this.graphics = this.readGraphics();
    this.audio = new Soundscape(.4);
    this.lastUiUpdate = 0;
    this.ui = new GameUI(app, {
      onStart: (profile) => this.start(profile),
      onProfileChange: (profile) => this.updateMenuProfile(profile),
      onMenuInteraction: () => this.activateMenuAudio(),
      onMenuHover: () => this.audio.hover(),
      onJoystick: (x, y) => this.engine?.setJoystick(x, y),
      onInteract: () => this.quest?.interact(this.engine?.getPosition()),
      onReturnToMenu: () => this.returnToMenu(),
      onFreeExplore: () => this.freeExplore(),
      onRestartDemo: () => this.restartDemo(),
      onGraphicsChange: (graphics) => this.updateGraphics(graphics),
    });
    this.ui.showStart(this.readProfile(), this.graphics);
    this.startMenuScene(this.ui.profile);
  }

  readProfile() {
    try { return JSON.parse(localStorage.getItem(PROFILE_KEY)) || null; } catch { return null; }
  }

  persistProfile(profile) {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  }

  readGraphics() {
    try { return normalizeGraphics(JSON.parse(localStorage.getItem(GRAPHICS_KEY)) || DEFAULT_GRAPHICS); } catch { return { ...DEFAULT_GRAPHICS }; }
  }

  persistGraphics(graphics) {
    localStorage.setItem(GRAPHICS_KEY, JSON.stringify(graphics));
  }

  activateMenuAudio() {
    this.audio.activate();
    this.audio.startMarket();
  }

  updateMenuProfile(profile) {
    this.persistProfile(profile);
    this.menuEngine?.setPreviewStyle(profile);
  }

  updateGraphics(graphics) {
    this.graphics = normalizeGraphics(graphics);
    this.persistGraphics(this.graphics);
    this.menuEngine?.setGraphicsSettings(this.graphics);
    this.engine?.setGraphicsSettings(this.graphics);
  }

  startMenuScene(profile) {
    try {
      this.menuEngine?.destroy();
      this.menuEngine = new GameEngine(this.ui.elements.canvas, profile, {}, this.graphics);
      this.menuEngine.setMenuPresentation(true);
    } catch (error) {
      this.ui.showWebGLError(error);
    }
  }

  start(profile) {
    this.persistProfile(profile);
    this.menuEngine?.destroy();
    this.menuEngine = null;
    this.engine?.destroy();
    this.activateMenuAudio();
    try {
      this.engine = new GameEngine(this.ui.elements.canvas, profile, {
        onFrame: (frame) => this.onFrame(frame),
        onInteract: (position) => this.quest?.interact(position),
        onIntroEnd: () => {
          this.ui.revealHud();
          this.quest?.begin(this.engine?.clock.elapsedTime || 0);
        },
        onCinematicEnd: () => this.ui.showEnding(this.chapterResult),
      }, this.graphics);
      this.ui.begin(profile, this.engine.world.visitorCount, true);
      this.quest = new CityStrollQuest({
        world: this.engine.world,
        playerName: profile.name,
        callbacks: {
          onQuestChange: (quest) => this.ui.setQuest(quest),
          onSideQuestChange: (quests) => this.ui.setSideQuests(quests),
          onPrompt: (label) => this.ui.showInteraction(label),
          onDialogue: (lines, done) => this.ui.showDialogue(lines, done),
          onChat: (chat, done) => this.ui.showChat(chat, done),
          onChoice: (choice, done) => this.ui.showChoice(choice, done),
          onMemory: (memory) => this.ui.showMemory(memory),
          onTutorial: (text) => this.ui.showTutorial(text),
          onTimeOfDay: (clock) => this.ui.setStoryTime(clock),
          onProgress: (finale) => this.audio.progress(finale),
          onWineMoment: () => this.engine?.beginWineMoment(this.engine.world.wineStandPoint),
          onWineMomentEnd: () => this.engine?.endWineMoment(),
          onCinematic: (target, duration) => this.engine?.beginCinematic(target, duration),
          onChapterComplete: (result) => { this.chapterResult = result; },
        },
      });
      this.engine.beginStationIntro();
    } catch (error) {
      this.ui.showWebGLError(error);
    }
  }

  onFrame(frame) {
    this.quest?.update(frame);
    const now = performance.now();
    if (now - this.lastUiUpdate < 350) return;
    this.lastUiUpdate = now;
    this.audio.setZone(frame.location?.zone || 'hauptmarkt');
    this.ui.updateMarket(frame.visitorCount, frame.location, frame.playerFacing);
  }

  returnToMenu() {
    this.engine?.destroy();
    this.engine = null;
    this.quest = null;
    this.chapterResult = null;
    this.lastUiUpdate = 0;
    this.ui.returnToMenu(this.readProfile());
    this.startMenuScene(this.ui.profile);
  }

  freeExplore() {
    this.ui.hideEnding();
    this.engine?.resumeExploration();
  }

  restartDemo() {
    this.quest?.reset();
    const profile = { ...this.ui.profile };
    this.ui.hideEnding();
    this.start(profile);
  }
}

new HauptmarktSlice(document.querySelector('#app'));
