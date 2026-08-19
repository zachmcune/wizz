// In-match settings overlay: sound controls, display options, and leave match.
import type { AudioManager } from '../../audio/audio';
import type { Settings } from '../../storage/settings';
import { saveSettings } from '../../storage/settings';
import { el } from './dom';

export interface MatchSettingsDeps {
  settings: Settings;
  audio: AudioManager;
  onSettingsChange: (settings: Settings) => void;
  onLeaveMatch: () => void;
  onReplayTips?: () => void;
}

export class MatchSettingsScreen {
  readonly root = el('div', 'menu-screen settings-screen');
  private tipsCheck: HTMLInputElement;
  private namesCheck: HTMLInputElement;
  private muteCheck: HTMLInputElement;
  private volumeSlider: HTMLInputElement;
  private qualitySelect: HTMLSelectElement;

  constructor(private deps: MatchSettingsDeps) {
    const title = el('h1', 'menu-title', 'Settings');
    const card = el('div', 'settings-card');

    const soundSection = el('div', 'settings-section');
    soundSection.append(el('h2', 'settings-heading', 'Sound'));

    const muteRow = el('label', 'settings-row');
    this.muteCheck = el('input') as HTMLInputElement;
    this.muteCheck.type = 'checkbox';
    this.muteCheck.checked = deps.settings.muted;
    muteRow.append(this.muteCheck, el('span', 'settings-label', 'Mute sound'));
    this.muteCheck.addEventListener('change', () => this.applyMute(this.muteCheck.checked));

    const volumeRow = el('div', 'settings-row');
    volumeRow.append(el('span', 'settings-label', 'Volume'));
    this.volumeSlider = el('input', 'settings-slider') as HTMLInputElement;
    this.volumeSlider.type = 'range';
    this.volumeSlider.min = '0';
    this.volumeSlider.max = '100';
    this.volumeSlider.value = String(Math.round(deps.settings.volume * 100));
    this.volumeSlider.disabled = deps.settings.muted;
    this.volumeSlider.addEventListener('input', () => this.applyVolume(Number(this.volumeSlider.value) / 100));
    volumeRow.append(this.volumeSlider);

    soundSection.append(muteRow, volumeRow);

    const displaySection = el('div', 'settings-section');
    displaySection.append(el('h2', 'settings-heading', 'Display'));

    const namesRow = el('label', 'settings-row');
    this.namesCheck = el('input') as HTMLInputElement;
    this.namesCheck.type = 'checkbox';
    this.namesCheck.checked = deps.settings.showBuildingNames;
    namesRow.append(this.namesCheck, el('span', 'settings-label', 'Show building names'));
    this.namesCheck.addEventListener('change', () => this.applyShowBuildingNames(this.namesCheck.checked));

    const qualityRow = el('label', 'settings-row');
    qualityRow.append(el('span', 'settings-label', 'Graphics'));
    this.qualitySelect = el('select', 'settings-select') as HTMLSelectElement;
    const qualityOptions: { value: Settings['graphicsQuality']; label: string }[] = [
      { value: 'auto', label: 'Auto' },
      { value: 'low', label: 'Low' },
      { value: 'medium', label: 'Medium' },
      { value: 'high', label: 'High' },
    ];
    for (const opt of qualityOptions) {
      const option = document.createElement('option');
      option.value = opt.value;
      option.textContent = opt.label;
      if (opt.value === deps.settings.graphicsQuality) option.selected = true;
      this.qualitySelect.appendChild(option);
    }
    this.qualitySelect.addEventListener('change', () => {
      this.applyGraphicsQuality(this.qualitySelect.value as Settings['graphicsQuality']);
    });
    qualityRow.append(this.qualitySelect);
    const qualityHint = el(
      'p',
      'settings-hint',
      'Auto picks Low on Chromebooks and most phones. Low cuts resolution, antialias, and extra VFX.',
    );

    displaySection.append(namesRow, qualityRow, qualityHint);

    const tipsSection = el('div', 'settings-section');
    tipsSection.append(el('h2', 'settings-heading', 'Help'));
    const tipsRow = el('label', 'settings-row');
    this.tipsCheck = el('input') as HTMLInputElement;
    this.tipsCheck.type = 'checkbox';
    this.tipsCheck.checked = deps.settings.showTips;
    this.tipsCheck.dataset.testid = 'settings-show-tips';
    tipsRow.append(this.tipsCheck, el('span', 'settings-label', 'Show tips'));
    this.tipsCheck.addEventListener('change', () => this.applyShowTips(this.tipsCheck.checked));
    const replayBtn = el('button', 'btn', 'Replay tutorial');
    replayBtn.type = 'button';
    replayBtn.dataset.testid = 'settings-replay-tutorial';
    replayBtn.addEventListener('click', () => {
      this.applyShowTips(true);
      this.deps.onReplayTips?.();
      this.close();
    });
    const tipsHint = el(
      'p',
      'settings-hint',
      'Short in-match tips for a first game. Turn this on to walk through HQ, building, and wisps again.',
    );
    tipsSection.append(tipsRow, replayBtn, tipsHint);

    const actions = el('div', 'settings-actions');
    const resumeBtn = el('button', 'btn big', 'Resume');
    resumeBtn.addEventListener('click', () => this.close());
    const leaveBtn = el('button', 'btn big settings-leave', 'Leave Match');
    leaveBtn.addEventListener('click', () => deps.onLeaveMatch());
    actions.append(resumeBtn, leaveBtn);

    card.append(soundSection, displaySection, tipsSection, actions);
    this.root.append(title, card);
    this.root.style.display = 'none';

    this.root.addEventListener('click', (e) => {
      if (e.target === this.root) this.close();
    });
  }

  open(): void {
    this.syncFromSettings();
    this.root.style.display = 'flex';
  }

  close(): void {
    this.root.style.display = 'none';
  }

  isOpen(): boolean {
    return this.root.style.display !== 'none';
  }

  private syncFromSettings(): void {
    const s = this.deps.settings;
    this.muteCheck.checked = s.muted;
    this.volumeSlider.value = String(Math.round(s.volume * 100));
    this.volumeSlider.disabled = s.muted;
    this.namesCheck.checked = s.showBuildingNames;
    this.qualitySelect.value = s.graphicsQuality;
    this.tipsCheck.checked = s.showTips;
  }

  private persist(): void {
    void saveSettings(this.deps.settings);
    this.deps.onSettingsChange(this.deps.settings);
  }

  private applyMute(muted: boolean): void {
    this.deps.settings.muted = muted;
    this.deps.audio.setMuted(muted);
    this.volumeSlider.disabled = muted;
    this.persist();
  }

  private applyVolume(volume: number): void {
    this.deps.settings.volume = volume;
    this.deps.audio.setVolume(volume);
    this.persist();
  }

  private applyShowBuildingNames(show: boolean): void {
    this.deps.settings.showBuildingNames = show;
    this.persist();
  }

  private applyGraphicsQuality(quality: Settings['graphicsQuality']): void {
    this.deps.settings.graphicsQuality = quality;
    this.persist();
  }

  private applyShowTips(show: boolean): void {
    this.deps.settings.showTips = show;
    this.tipsCheck.checked = show;
    this.persist();
  }
}
