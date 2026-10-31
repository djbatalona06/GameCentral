// The Game wires everything together: settings, saves, input, simulation, renderer, audio and UI.
// It owns the app flow (menus -> playing -> paused / dead / results) and the main loop.

import { TUNING } from "../config/tuning";
import { SettingsStore, PRESETS, type Settings } from "./Settings";
import { openStore } from "../save/storage";
import { SaveManager } from "../save/SaveManager";
import { AUTOSAVE_SLOT, SLOT_COUNT, newSave, type SaveFile } from "../save/schema";
import { InputManager } from "../input/InputManager";
import { KeyboardMouse } from "../input/KeyboardMouse";
import { GamepadInput } from "../input/GamepadInput";
import { TouchControls } from "../input/TouchControls";
import type { ButtonAction, InputFrame } from "../input/actions";
import { GameSim, DIFFICULTY_NAMES, type Difficulty, type SimEvent, type Snapshot } from "../sim/GameSim";
import { CHAPTERS, chapterById, totalStoryMinutes } from "../sim/chapters/registry";
import type { ChapterDef, Speaker } from "../sim/story/types";
import { SceneRenderer } from "../render/SceneRenderer";
import { AudioEngine } from "../audio/AudioEngine";
import { UIManager } from "../ui/UIManager";
import { HUD } from "../ui/HUD";
import { renderSettingsTab, padName } from "../ui/SettingsScreen";

type AppState = "menu" | "playing" | "paused" | "dead" | "results";

const TIPS = [
  "Low cover protects you while crouched. Aim to pop up and shoot.",
  "Rolling has a moment of invulnerability: use it to dodge a sniper's shot.",
  "Throw a bottle to send a guard to check the noise, then sneak past or behind them.",
  "Brutes flash white before they swing. Press Melee at that moment to counter.",
  "Heavies are armoured in front. Aim for the head, or get behind them.",
  "If a fight is too hard, lower the difficulty or adjust enemy damage in Settings.",
  "Grenades bounce. Watch the arc preview before you let go.",
  "Stay in one place too long and grenadiers will flush you out.",
];

const SPEAKER_PITCH: Record<Speaker, number> = { Ines: 1.15, Bram: 0.8, Varek: 0.65, Kessa: 1.0, "Gilt Radio": 0.9, Mercenary: 0.85, Narrator: 1 };

export class Game {
  private persistent = true;
  private settingsStore!: SettingsStore;
  private saves!: SaveManager;
  private renderer!: SceneRenderer;
  private input!: InputManager;
  private keyboard!: KeyboardMouse;
  private gamepad!: GamepadInput;
  private touch!: TouchControls;
  private audio!: AudioEngine;
  private ui!: UIManager;
  private hud!: HUD;

  private state: AppState = "menu";
  sim: GameSim | null = null;
  private save: SaveFile | null = null;
  private lastSnapshot: Snapshot | null = null;
  private acc = 0;
  private lastTime = 0;
  private frame = 0;
  private sessionPlaytime = 0;
  private menuSim: GameSim | null = null;
  private menuOrbit = 0;
  private listening: { action: ButtonAction; device: "keys" | "pad"; done: () => void } | null = null;
  private menuRepeat = 0;
  private settingsSaveTimer = 0;
  private debug = false;
  private deathTimer = 0;
  private gyro = { beta: 0, gamma: 0, active: false };

  get settings(): Settings {
    return this.settingsStore.current;
  }

  async boot(): Promise<void> {
    const params = new URLSearchParams(location.search);
    this.debug = params.has("debug");
    const { store, persistent } = await openStore();
    this.persistent = persistent;
    this.settingsStore = new SettingsStore(store);
    await this.settingsStore.load();
    this.saves = new SaveManager(store);

    const canvas = document.getElementById("game") as HTMLCanvasElement;
    const s = () => this.settings;
    this.renderer = new SceneRenderer(canvas, s);
    this.input = new InputManager(s);
    this.keyboard = new KeyboardMouse(this.input.keyboard, canvas, s);
    this.gamepad = new GamepadInput(this.input.gamepad, s);
    this.touch = new TouchControls(this.input.touch, s, document.getElementById("touch-root")!);
    this.touch.show(false);
    this.touch.onLayoutChanged = () => this.settingsChanged();
    this.audio = new AudioEngine(s);
    this.ui = new UIManager(document.getElementById("ui-root")!, document.getElementById("live")!);
    this.ui.narrate = (t) => this.settings.a11y.menuNarration && this.audio.speak(t, { interrupt: true });
    this.ui.onSound = (k) => this.audio.ui(k);
    this.hud = new HUD(document.getElementById("hud-root")!, s);
    this.hud.onSkip = () => this.sim?.skipCutscene();
    this.hud.speak = (text, speaker) => this.audio.speak(text, { pitch: SPEAKER_PITCH[speaker] });

    this.applySettings();
    this.bindGlobalEvents();
    document.getElementById("boot")?.remove();

    if (this.debug) (window as unknown as { __meridian: Game }).__meridian = this;
    const direct = params.get("chapter");
    if (direct) {
      const ch = chapterById(direct.startsWith("ch") ? direct : `ch${direct.padStart(2, "0")}`);
      if (ch?.playable) {
        this.settings.firstRunDone = true;
        this.save = newSave(0, this.settings.gameplay.difficulty);
        this.startChapter(ch, null);
        requestAnimationFrame(this.loop);
        return;
      }
    }
    this.startMenuBackdrop();
    if (!this.settings.firstRunDone) this.showFirstRun();
    else this.showTitle();
    requestAnimationFrame(this.loop);
  }

  // ------------------------------------------------------------------ settings

  private applySettings(): void {
    const s = this.settings;
    const root = document.documentElement;
    root.style.setProperty("--text-scale", String(s.a11y.textScale));
    document.body.classList.toggle("high-contrast", s.a11y.highContrast);
    document.body.classList.toggle("reduce-motion", s.a11y.reduceMotion);
    this.touch.applyLayout();
    document.body.classList.remove("layout-standard", "layout-oneHandedRight", "layout-oneHandedLeft");
    document.body.classList.add(`layout-${s.controls.touchLayout}`);
    this.audio.applyVolumes();
    this.renderer.applyAccessibility();
    if (this.sim) Object.assign(this.sim.opts, s.gameplay);
    this.sim?.squad.setDifficulty(s.gameplay.difficulty);
  }

  private settingsChanged(): void {
    this.applySettings();
    this.settingsSaveTimer = 0.4;
    if (this.settings.controls.gyroAim) this.requestGyro();
  }

  private requestGyro(): void {
    const D = DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> };
    if (D.requestPermission) D.requestPermission().catch(() => undefined);
  }

  // ------------------------------------------------------------------ global events

  private bindGlobalEvents(): void {
    const unlock = () => this.audio.unlock();
    window.addEventListener("pointerdown", unlock, { passive: true });
    window.addEventListener("keydown", unlock);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden && this.state === "playing") this.pause();
    });
    document.addEventListener("pointerlockchange", () => {
      if (!document.pointerLockElement && this.state === "playing" && this.keyboard.pointerLookEnabled && this.input.device === "keyboard") this.pause();
    });
    window.addEventListener("keydown", (e) => {
      if (this.listening?.device === "keys") {
        e.preventDefault();
        this.finishRebind(e.code);
      }
    });
    window.addEventListener("mousedown", (e) => {
      if (this.listening?.device === "keys") this.finishRebind(`Mouse${e.button}`);
    });
    window.addEventListener("deviceorientation", (e) => {
      if (e.beta === null || e.gamma === null) return;
      if (this.gyro.active && this.settings.controls.gyroAim && this.sim?.aiming) {
        const landscape = window.innerWidth > window.innerHeight;
        const dYaw = (landscape ? e.beta - this.gyro.beta : e.gamma - this.gyro.gamma) * (Math.PI / 180);
        const dPitch = (landscape ? e.gamma - this.gyro.gamma : e.beta - this.gyro.beta) * (Math.PI / 180);
        if (Math.abs(dYaw) < 0.3 && Math.abs(dPitch) < 0.3) {
          this.input.touch.look.yaw -= dYaw * 0.8;
          this.input.touch.look.pitch += dPitch * 0.8;
        }
      }
      this.gyro = { beta: e.beta, gamma: e.gamma, active: true };
    });
  }

  private finishRebind(code: string | number): void {
    const l = this.listening;
    if (!l) return;
    this.listening = null;
    const c = this.settings.controls;
    if (l.device === "keys" && typeof code === "string" && code !== "Escape") {
      for (const a of Object.keys(c.keys) as ButtonAction[]) c.keys[a] = c.keys[a].filter((k) => k !== code);
      c.keys[l.action] = [code];
    } else if (l.device === "pad" && typeof code === "number") {
      for (const a of Object.keys(c.pad) as ButtonAction[]) c.pad[a] = c.pad[a].filter((k) => k !== code);
      c.pad[l.action] = [code];
      this.ui.announce(`${l.action} set to ${padName(code)}`);
    }
    this.settingsChanged();
    l.done();
  }

  // ------------------------------------------------------------------ menu screens

  private startMenuBackdrop(): void {
    const ch = CHAPTERS[0];
    this.menuSim = new GameSim(ch, { ...this.settings.gameplay, invulnerable: true });
    this.renderer.load(this.menuSim);
  }

  private showFirstRun(): void {
    this.state = "menu";
    this.ui.show("firstrun", {
      init: (el) => {
        const s = this.settings;
        for (const [k, p] of Object.entries(PRESETS)) {
          const d = el.querySelector(`[data-desc="${k}"]`);
          if (d) d.textContent = p.description;
        }
        const bind = (name: string, get: () => number | boolean, set: (v: number | boolean) => void) => {
          const input = el.querySelector(`[data-bind="${name}"]`) as HTMLInputElement;
          if (input.type === "checkbox") input.checked = get() as boolean;
          else input.value = String(get());
          input.oninput = input.onchange = () => {
            set(input.type === "checkbox" ? input.checked : Number(input.value));
            this.settingsChanged();
          };
        };
        bind("textScale", () => s.a11y.textScale, (v) => (s.a11y.textScale = v as number));
        bind("subtitles", () => s.a11y.subtitles, (v) => (s.a11y.subtitles = v as boolean));
        bind("menuNarration", () => s.a11y.menuNarration, (v) => (s.a11y.menuNarration = v as boolean));
        el.querySelectorAll<HTMLButtonElement>("[data-preset]").forEach((b) => {
          b.onclick = () => {
            const key = b.dataset.preset as keyof typeof PRESETS;
            PRESETS[key].apply(s);
            this.settingsChanged();
            el.querySelector('[data-role="preset-status"]')!.textContent = `${PRESETS[key].label} preset applied.`;
            this.ui.refresh();
          };
        });
      },
      action: (a) => {
        if (a === "more-settings") this.showSettings("a11y");
        if (a === "continue") {
          this.settings.firstRunDone = true;
          this.settingsChanged();
          this.showTitle();
        }
      },
    });
  }

  private showTitle(): void {
    this.state = "menu";
    this.ui.show("title", {
      action: () => {
        this.audio.unlock();
        this.audio.setMood("explore");
        void this.showMainMenu();
      },
      back: () => false,
    });
  }

  private async showMainMenu(): Promise<void> {
    this.state = "menu";
    this.hud.show(false);
    this.touch.show(false);
    const latest = await this.saves.latest();
    this.ui.show("main-menu", {
      init: (el) => {
        const cont = el.querySelector('[data-action="continue"]') as HTMLButtonElement;
        cont.disabled = !latest;
        const info = el.querySelector('[data-role="continue-info"]')!;
        if (latest) {
          const ch = chapterById(latest.currentChapter);
          info.textContent = `Continue: Chapter ${ch?.number} — ${ch?.title} · ${formatTime(latest.playtimeSec)} played`;
        }
        (el.querySelector('[data-role="storage-warning"]') as HTMLElement).hidden = this.persistent;
      },
      action: (a) => {
        if (a === "continue" && latest) this.loadSave(latest);
        if (a === "new-game") this.showSlots("new");
        if (a === "load-game") this.showSlots("load");
        if (a === "chapters") void this.showChapters();
        if (a === "settings") this.showSettings("a11y");
        if (a === "credits") this.ui.push("credits", { action: () => this.ui.pop() });
      },
      back: () => {
        this.showTitle();
      },
    });
  }

  private showSlots(mode: "new" | "load"): void {
    const render = async (el: HTMLElement) => {
      const list = el.querySelector('[data-role="slot-list"]')!;
      list.innerHTML = "";
      el.querySelector("h1")!.textContent = mode === "new" ? "Choose a slot for your new game" : "Load a game";
      const all = await this.saves.list();
      for (const { slot, save } of all) {
        if (mode === "new" && slot === AUTOSAVE_SLOT) continue;
        const li = document.createElement("li");
        const b = document.createElement("button");
        const name = slot === AUTOSAVE_SLOT ? "Autosave backup" : `Slot ${slot + 1}`;
        const ch = save ? chapterById(save.currentChapter) : null;
        b.innerHTML = "<strong></strong><small></small>";
        b.querySelector("strong")!.textContent = name;
        b.querySelector("small")!.textContent = save
          ? `Chapter ${ch?.number}: ${ch?.title} · ${DIFFICULTY_NAMES[save.difficulty]} · ${formatTime(save.playtimeSec)} · ${new Date(save.updatedAt).toLocaleString()}`
          : "Empty";
        b.disabled = mode === "load" && !save;
        b.onclick = () => {
          if (mode === "load" && save) this.loadSave(save);
          if (mode === "new") {
            if (save && !confirm(`Overwrite ${name}? This cannot be undone.`)) return;
            this.showDifficulty(slot);
          }
        };
        li.appendChild(b);
        if (save) {
          const exp = document.createElement("button");
          exp.textContent = "Export";
          exp.setAttribute("aria-label", `Export ${name}`);
          exp.onclick = () => downloadText(`meridian-${name.replace(/\s/g, "-").toLowerCase()}.json`, this.saves.exportJson(save));
          const del = document.createElement("button");
          del.textContent = "Delete";
          del.setAttribute("aria-label", `Delete ${name}`);
          del.onclick = async () => {
            if (!confirm(`Delete ${name}? This cannot be undone.`)) return;
            await this.saves.delete(slot);
            await render(el);
          };
          li.append(exp, del);
        }
        list.appendChild(li);
      }
    };
    this.ui.push("slots", {
      init: (el) => {
        void render(el);
        const file = el.querySelector('[data-role="import-file"]') as HTMLInputElement;
        file.onchange = async () => {
          const f = file.files?.[0];
          if (!f) return;
          try {
            const all = await this.saves.list();
            const free = all.find((x) => !x.save && x.slot < SLOT_COUNT)?.slot ?? 0;
            await this.saves.importJson(await f.text(), free);
            this.ui.announce(`Save imported into slot ${free + 1}.`);
            await render(el);
          } catch (err) {
            alert((err as Error).message);
          }
        };
      },
      action: (a, _t) => {
        if (a === "back") this.ui.pop();
        if (a === "import") (document.querySelector('[data-role="import-file"]') as HTMLInputElement)?.click();
      },
    });
  }

  private showDifficulty(slot: number): void {
    this.ui.push("difficulty", {
      init: (el) => {
        el.querySelectorAll<HTMLButtonElement>("[data-difficulty]").forEach((b) => {
          if (Number(b.dataset.difficulty) === this.settings.gameplay.difficulty) b.classList.add("primary");
          b.onclick = async () => {
            const d = Number(b.dataset.difficulty) as Difficulty;
            this.settings.gameplay.difficulty = d;
            this.settingsChanged();
            this.save = newSave(slot, d);
            await this.saves.save(this.save);
            this.startChapter(CHAPTERS[0], null);
          };
        });
      },
      action: (a) => a === "back" && this.ui.pop(),
    });
  }

  private async showChapters(): Promise<void> {
    const all = (await this.saves.list()).map((x) => x.save).filter((s): s is SaveFile => !!s);
    const unlocked = new Set<string>(["ch01"]);
    for (const s of all) {
      unlocked.add(s.currentChapter);
      for (const [id, p] of Object.entries(s.chapters)) if (p.completed) unlocked.add(id);
    }
    if (this.debug) CHAPTERS.filter((c) => c.playable).forEach((c) => unlocked.add(c.id));
    this.ui.push("chapters", {
      init: (el) => {
        el.querySelector('[data-role="total-time"]')!.textContent = `${CHAPTERS.length} chapters · about ${Math.round(totalStoryMinutes() / 60)} hours of story planned. Chapters 1–3 are playable in this build.`;
        const list = el.querySelector('[data-role="chapter-list"]')!;
        for (const ch of CHAPTERS) {
          const li = document.createElement("li");
          const b = document.createElement("button");
          const open = ch.playable && unlocked.has(ch.id);
          b.innerHTML = "<strong></strong><small></small>";
          b.querySelector("strong")!.textContent = `${ch.number}. ${ch.title}`;
          const best = all.map((s) => s.chapters[ch.id]).find((p) => p?.completed);
          const treasures = ch.build ? ch.build().collectibles.length : 0;
          const found = new Set(all.flatMap((s) => s.chapters[ch.id]?.treasures ?? [])).size;
          b.querySelector("small")!.textContent = !ch.playable
            ? `Coming soon · ${ch.location} · ${ch.synopsis}`
            : `${ch.location} · ~${ch.estMinutes} min · Treasures ${found}/${treasures}${best?.bestTimeSec ? ` · Best ${formatTime(best.bestTimeSec)}` : ""}${open ? "" : " · Locked"}`;
          b.disabled = !open;
          if (!open) li.classList.add("locked");
          b.onclick = () => {
            if (!this.save) this.save = all.sort((a, b2) => b2.updatedAt.localeCompare(a.updatedAt))[0] ?? newSave(0, this.settings.gameplay.difficulty);
            this.startChapter(ch, null);
          };
          li.appendChild(b);
          list.appendChild(li);
        }
      },
      action: (a) => a === "back" && this.ui.pop(),
    });
  }

  private showSettings(tab: "a11y" | "gameplay" | "controls" | "audio" | "video"): void {
    let current = tab;
    const hooks = {
      settings: () => this.settings,
      changed: () => this.settingsChanged(),
      editTouchLayout: () => this.editTouchLayout(),
      listenForKey: (action: ButtonAction, device: "keys" | "pad", done: () => void) => {
        this.listening = { action, device, done };
      },
    };
    this.ui.push("settings", {
      init: (el) => {
        const panel = el.querySelector('[data-role="panel"]') as HTMLElement;
        const select = (t: typeof current) => {
          current = t;
          el.querySelectorAll<HTMLButtonElement>("[data-tab]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === t)));
          renderSettingsTab(panel, t, hooks);
        };
        el.querySelectorAll<HTMLButtonElement>("[data-tab]").forEach((b) => (b.onclick = () => select(b.dataset.tab as typeof current)));
        select(current);
      },
      action: async (a) => {
        if (a === "back") {
          this.listening = null;
          await this.settingsStore.save();
          this.ui.pop();
        }
        if (a === "reset" && confirm("Reset all settings to their defaults?")) {
          await this.settingsStore.reset();
          this.applySettings();
          this.ui.refresh();
        }
      },
    });
  }

  private editTouchLayout(): void {
    const wasVisible = this.touch.visible;
    this.touch.editing = true;
    this.touch.show(true);
    this.touch.root.classList.add("editing");
    document.getElementById("touch-root")!.style.zIndex = "40";
    this.ui.push("layout-editor", {
      action: (a) => {
        if (a === "reset-layout") {
          this.settings.controls.touchPositions[this.touch.orientation()] = {};
          this.settingsChanged();
          return;
        }
        this.touch.editing = false;
        this.touch.root.classList.remove("editing");
        document.getElementById("touch-root")!.style.zIndex = "";
        this.touch.show(wasVisible);
        this.ui.pop();
      },
    });
  }

  // ------------------------------------------------------------------ playing

  private loadSave(save: SaveFile): void {
    this.save = save;
    this.settings.gameplay.difficulty = save.difficulty;
    const ch = chapterById(save.currentChapter);
    if (!ch?.playable) {
      void this.showChapters();
      this.ui.announce("The next chapter isn't in this build yet. Pick a chapter to replay.");
      return;
    }
    this.startChapter(ch, save.snapshot && save.snapshot.chapterId === ch.id ? save.snapshot : null);
  }

  startChapter(ch: ChapterDef, snapshot: Snapshot | null): void {
    this.ui.clear();
    this.audio.stopSpeech();
    this.menuSim = null;
    this.sim = new GameSim(ch, { ...this.settings.gameplay }, snapshot ?? undefined, Date.now() & 0xffff);
    this.lastSnapshot = snapshot ?? this.sim.snapshot();
    this.renderer.load(this.sim);
    this.hud.reset();
    this.hud.show(true);
    if (this.sim.objective) this.hud.setObjective(this.sim.objective.text);
    const touchDevice = TouchControls.isTouchDevice();
    this.touch.show(touchDevice);
    this.keyboard.pointerLookEnabled = !touchDevice;
    this.input.reset();
    this.input.enabled = true;
    this.state = "playing";
    this.acc = 0;
    this.deathTimer = 0;
    // Flush start-of-chapter events (music, objective, dialogue).
    this.dispatchEvents();
    if (this.save) {
      this.save.currentChapter = ch.id;
      void this.persist();
    }
  }

  private pause(): void {
    if (this.state !== "playing" || !this.sim) return;
    this.state = "paused";
    this.input.enabled = false;
    this.input.reset();
    this.keyboard.exitPointerLock();
    this.touch.show(false);
    this.hud.show(false);
    this.audio.stopSpeech();
    const sim = this.sim;
    this.ui.show("pause", {
      init: (el) => {
        el.querySelector('[data-role="objective"]')!.textContent = sim.objective ? `Objective: ${sim.objective.text}` : "";
        (el.querySelector('[data-action="skip-puzzle"]') as HTMLElement).hidden = !sim.skippablePuzzle();
        const treasures = sim.world.data.collectibles.length;
        el.querySelector('[data-role="pause-stats"]')!.textContent = `Chapter ${sim.chapter.number}: ${sim.chapter.title} · Treasures ${sim.treasures.size}/${treasures} · ${DIFFICULTY_NAMES[this.settings.gameplay.difficulty]}`;
      },
      action: (a) => {
        if (a === "resume") this.resume();
        if (a === "skip-puzzle") {
          sim.skipPuzzle();
          this.resume();
        }
        if (a === "journal") this.showJournal();
        if (a === "settings") this.showSettings("a11y");
        if (a === "restart") this.restartFromCheckpoint();
        if (a === "quit") void this.quitToMenu();
      },
      back: () => this.resume(),
    });
  }

  private resume(): void {
    if (!this.sim) return;
    this.ui.clear();
    this.state = "playing";
    this.input.enabled = true;
    this.input.reset();
    this.hud.show(true);
    this.touch.show(TouchControls.isTouchDevice());
    this.applySettings();
  }

  private showJournal(): void {
    const sim = this.sim;
    this.ui.push("journal", {
      init: (el) => {
        const entries = el.querySelector('[data-role="entries"]')!;
        const known = new Set([...(this.save?.journal ?? []), ...(sim ? [...sim.journal] : [])]);
        const all = CHAPTERS.flatMap((c) => c.script?.journal ?? []).filter((j) => known.has(j.id));
        if (!all.length) entries.innerHTML = "<li><p>No notes yet.</p></li>";
        for (const j of all) {
          const li = document.createElement("li");
          if (j.sketch) {
            const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
            svg.setAttribute("viewBox", "0 0 100 100");
            svg.setAttribute("aria-hidden", "true");
            for (const [x1, y1, x2, y2] of j.sketch) {
              const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
              line.setAttribute("x1", String(x1));
              line.setAttribute("y1", String(y1));
              line.setAttribute("x2", String(x2));
              line.setAttribute("y2", String(y2));
              svg.appendChild(line);
            }
            li.appendChild(svg);
          }
          const h = document.createElement("h3");
          h.textContent = j.title;
          const p = document.createElement("p");
          p.textContent = j.text;
          li.append(h, p);
          entries.appendChild(li);
        }
        const tl = el.querySelector('[data-role="treasures"]')!;
        const found = new Set([...Object.values(this.save?.chapters ?? {}).flatMap((c) => c.treasures), ...(sim ? [...sim.treasures] : [])]);
        const items = CHAPTERS.filter((c) => c.build).flatMap((c) => c.build!().collectibles);
        for (const t of items) {
          const li = document.createElement("li");
          const h = document.createElement("h3");
          const p = document.createElement("p");
          h.textContent = found.has(t.id) ? t.name : "Undiscovered treasure";
          p.textContent = found.has(t.id) ? t.description : "Keep exploring off the main path.";
          li.append(h, p);
          tl.appendChild(li);
        }
      },
      action: (a) => a === "back" && this.ui.pop(),
    });
  }

  private restartFromCheckpoint(): void {
    if (!this.sim) return;
    const stats = this.sim.stats;
    const snap = this.lastSnapshot ? { ...this.lastSnapshot, stats: { ...stats } } : null;
    this.startChapter(this.sim.chapter, snap);
  }

  private async quitToMenu(): Promise<void> {
    await this.persist();
    this.sim = null;
    this.state = "menu";
    this.hud.show(false);
    this.touch.show(false);
    this.keyboard.exitPointerLock();
    this.startMenuBackdrop();
    await this.showMainMenu();
  }

  private showDeath(): void {
    if (!this.sim) return;
    this.state = "dead";
    this.input.enabled = false;
    this.touch.show(false);
    this.keyboard.exitPointerLock();
    const diff = this.settings.gameplay.difficulty;
    this.ui.show("death", {
      init: (el) => {
        el.querySelector('[data-role="tip"]')!.textContent = `Tip: ${TIPS[Math.floor(Math.random() * TIPS.length)]}`;
        (el.querySelector('[data-action="lower-difficulty"]') as HTMLButtonElement).hidden = diff === 0;
      },
      action: (a) => {
        if (a === "retry") this.restartFromCheckpoint();
        if (a === "lower-difficulty") {
          this.settings.gameplay.difficulty = Math.max(0, diff - 1) as Difficulty;
          if (this.save) this.save.difficulty = this.settings.gameplay.difficulty;
          this.settingsChanged();
          this.restartFromCheckpoint();
        }
        if (a === "quit") void this.quitToMenu();
      },
      back: () => false,
    });
  }

  private async showResults(): Promise<void> {
    const sim = this.sim;
    if (!sim) return;
    this.state = "results";
    this.input.enabled = false;
    this.touch.show(false);
    this.keyboard.exitPointerLock();
    const st = sim.stats;
    const total = sim.world.data.collectibles.length;
    const acc = st.shots ? st.hits / st.shots : 0;
    const medals: Array<[string, boolean]> = [
      ["Treasure Hunter: every treasure", sim.treasures.size >= total],
      ["Sharpshooter: 55% accuracy", st.shots >= 10 && acc >= 0.55],
      ["Survivor: no deaths", st.deaths === 0],
      [`Swift: under ${sim.chapter.script!.parTimeMinutes} minutes`, st.time < sim.chapter.script!.parTimeMinutes * 60],
      ["Ghost: never seen during stealth", !st.stealthBroken && st.alerts === 0],
    ];
    if (this.save) {
      const prev = this.save.chapters[sim.chapter.id];
      this.save.chapters[sim.chapter.id] = {
        completed: true,
        bestTimeSec: Math.min(prev?.bestTimeSec ?? Infinity, st.time),
        treasures: [...new Set([...(prev?.treasures ?? []), ...sim.treasures])],
        medals: [...new Set([...(prev?.medals ?? []), ...medals.filter((m) => m[1]).map((m) => m[0])])],
        lastStats: { ...st },
      };
      const next = CHAPTERS.find((c) => c.number === sim.chapter.number + 1);
      this.save.currentChapter = next?.id ?? sim.chapter.id;
      this.save.snapshot = null;
      this.save.journal = [...new Set([...this.save.journal, ...sim.journal])];
      await this.persist();
    }
    const next = CHAPTERS.find((c) => c.number === sim.chapter.number + 1);
    this.ui.show("results", {
      init: (el) => {
        el.querySelector('[data-role="chapter-name"]')!.textContent = `Chapter ${sim.chapter.number}: ${sim.chapter.title}`;
        const dl = el.querySelector('[data-role="stats"]')!;
        const rows: Array<[string, string]> = [
          ["Time", formatTime(st.time)],
          ["Treasures", `${sim.treasures.size} / ${total}`],
          ["Accuracy", st.shots ? `${Math.round(acc * 100)}%` : "—"],
          ["Headshots", String(st.headshots)],
          ["Enemies defeated", String(st.kills)],
          ["Silent takedowns", String(st.takedowns)],
          ["Deaths", String(st.deaths)],
        ];
        for (const [k, v] of rows) {
          const dt = document.createElement("dt");
          dt.textContent = k;
          const dd = document.createElement("dd");
          dd.textContent = v;
          dl.append(dt, dd);
        }
        const ul = el.querySelector('[data-role="medals"]')!;
        for (const [name, got] of medals) {
          const li = document.createElement("li");
          li.textContent = `${got ? "★" : "☆"} ${name}`;
          if (!got) li.classList.add("missed");
          ul.appendChild(li);
        }
        const nb = el.querySelector('[data-action="next"]') as HTMLButtonElement;
        if (!next?.playable) nb.textContent = next ? `Chapter ${next.number} is coming soon` : "The end, for now";
        nb.disabled = !next?.playable;
      },
      action: (a) => {
        if (a === "next" && next?.playable) this.startChapter(next, null);
        if (a === "replay") this.startChapter(sim.chapter, null);
        if (a === "menu") void this.quitToMenu();
      },
      back: () => false,
    });
  }

  /** Writes progress to the active slot and the autosave backup. */
  private async persist(): Promise<void> {
    if (!this.save) return;
    this.save.playtimeSec += this.sessionPlaytime;
    this.sessionPlaytime = 0;
    this.save.difficulty = this.settings.gameplay.difficulty;
    if (this.sim && !this.sim.completed) {
      this.save.snapshot = this.lastSnapshot;
      this.save.journal = [...new Set([...this.save.journal, ...this.sim.journal])];
      const prog = this.save.chapters[this.sim.chapter.id] ?? { completed: false, treasures: [], medals: [] };
      prog.treasures = [...new Set([...prog.treasures, ...this.sim.treasures])];
      this.save.chapters[this.sim.chapter.id] = prog;
    }
    try {
      await this.saves.save(this.save);
      await this.saves.save({ ...structuredClone(this.save), slot: AUTOSAVE_SLOT });
    } catch (err) {
      console.warn("Save failed", err);
    }
  }

  // ------------------------------------------------------------------ events from the simulation

  private dispatchEvents(): void {
    const sim = this.sim;
    if (!sim) return;
    const events = sim.events;
    sim.events = [];
    for (const ev of events) {
      this.renderer.handleEvent(ev);
      this.audio.handleEvent(ev);
      this.hud.handleEvent(ev, sim);
      this.onEvent(ev);
    }
  }

  private onEvent(ev: SimEvent): void {
    const vib = this.settings.controls.vibration;
    switch (ev.type) {
      case "checkpoint":
        this.lastSnapshot = this.sim!.snapshot();
        void this.persist();
        break;
      case "playerDied":
        this.deathTimer = 1.6;
        if (vib) navigator.vibrate?.([60, 40, 120]);
        this.gamepad.rumble(1, 1, 400);
        break;
      case "complete":
        void this.showResults();
        break;
      case "playerHurt":
        if (vib) navigator.vibrate?.(25);
        this.gamepad.rumble(0.4, 0.6, 120);
        break;
      case "explosion":
        if (vib) navigator.vibrate?.(70);
        this.gamepad.rumble(1, 0.8, 300);
        break;
      case "hitmarker":
        this.gamepad.rumble(0, 0.3, 40);
        break;
      case "treasure":
        if (vib) navigator.vibrate?.([20, 40, 20]);
        break;
      case "player":
        if (ev.ev.type === "hardLand") {
          if (vib) navigator.vibrate?.(35);
          this.gamepad.rumble(0.6, 0.3, 120);
        }
        break;
    }
  }

  // ------------------------------------------------------------------ main loop

  private loop = (t: number): void => {
    requestAnimationFrame(this.loop);
    const dt = Math.min(0.1, this.lastTime ? (t - this.lastTime) / 1000 : 1 / 60);
    this.lastTime = t;
    this.frame++;
    this.gamepad.update(dt);
    if (this.listening?.device === "pad" && this.gamepad.menuPressed.size) this.finishRebind([...this.gamepad.menuPressed][0]);
    else this.menuInput(dt);

    if (this.settingsSaveTimer > 0) {
      this.settingsSaveTimer -= dt;
      if (this.settingsSaveTimer <= 0) void this.settingsStore.save();
    }

    const sim = this.sim;
    if (sim && this.state === "playing") {
      this.acc += dt;
      const step = 1 / TUNING.sim.hz;
      let steps = 0;
      while (this.acc >= step && steps < 4) {
        const frame = this.input.poll();
        if (frame.buttons.pause.pressed) {
          this.pause();
          break;
        }
        if (frame.buttons.journal.pressed) {
          this.pause();
          this.showJournal();
          break;
        }
        if (frame.buttons.navAssist.pressed) this.hud.pingObjective();
        sim.step(step, frame);
        this.dispatchEvents();
        this.acc -= step;
        steps++;
        this.sessionPlaytime += step;
      }
      if (this.acc > step * 4) this.acc = 0;
      this.touch.setContext(sim.prompt?.label ?? null, sim.prompt?.action ?? null);
      this.touch.setAiming(sim.aiming);
      if (this.deathTimer > 0) {
        this.deathTimer -= dt;
        if (this.deathTimer <= 0) this.showDeath();
      }
    }

    if (sim) {
      this.audio.listener = { pos: sim.cam.position, yaw: sim.cam.yaw };
      this.audio.update(dt, this.state === "playing" && sim.inCombat);
      this.hud.update(dt, sim, this.input.device as InputFrame["device"], this.renderer.engine.getFps());
    } else if (this.menuSim) {
      // Slow orbit over the beach behind the menus.
      this.menuOrbit += dt * 0.05;
      const r = 26;
      this.menuSim.cam.rail = {
        position: { x: Math.sin(this.menuOrbit) * r, y: 9, z: 40 + Math.cos(this.menuOrbit) * r },
        target: { x: 0, y: 2, z: 52 },
      };
    }
    const cap = this.settings.video.fpsCap;
    if (cap === 30 && this.frame % 2 === 1) return;
    this.renderer.render(cap === 30 ? dt * 2 : dt);
  };

  /** Gamepad navigation for menus, with key-repeat when the stick is held. */
  private menuInput(dt: number): void {
    if (!this.ui.open) return;
    const g = this.gamepad;
    const p = g.menuPressed;
    if (p.has(12)) this.ui.move(0, -1);
    if (p.has(13)) this.ui.move(0, 1);
    if (p.has(14)) this.ui.move(-1, 0);
    if (p.has(15)) this.ui.move(1, 0);
    if (p.has(0)) this.ui.activate();
    if (p.has(1)) this.ui.back();
    if (p.has(9) && this.state === "paused") this.resume();
    const ax = g.menuAxis;
    if (Math.hypot(ax.x, ax.y) > 0.6) {
      this.menuRepeat -= dt;
      if (this.menuRepeat <= 0) {
        if (Math.abs(ax.x) > Math.abs(ax.y)) this.ui.move(Math.sign(ax.x), 0);
        else this.ui.move(0, Math.sign(ax.y));
        this.menuRepeat = 0.22;
      }
    } else this.menuRepeat = 0;
  }
}

export const formatTime = (sec: number): string => {
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}:${String(r).padStart(2, "0")}`;
};

function downloadText(name: string, text: string): void {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
