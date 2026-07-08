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
}

export class MatchSettingsScreen {
  readonly root = el('div', 'menu-screen settings-screen');

  constructor(private deps: MatchSettingsDeps) {
    const title = el('h1', 'menu-title', 'Settings');
    const card = el('div', 'settings-card');

    const soundSection = el('div', 'settings-section');
    soundSection.append(el('h2', 'settings-heading', 'Sound'));

    const muteRow = el('label', 'settings-row');
    const muteCheck = el('input') as HTMLInputElement;
    muteCheck.type = 'checkbox';
    muteCheck.checked = deps.settings.muted;
    muteRow.append(muteCheck, el('span', 'settings-label', 'Mute sound'));
    muteCheck.addEventListener('change', () => this.applyMute(muteCheck.checked));

    const volumeRow = el('div', 'settings-row');
    volumeRow.append(el('span', 'settings-label', 'Volume'));
    const volumeSlider = el('input', 'settings-slider') as HTMLInputElement;
    volumeSlider.type = 'range';
    volumeSlider.min = '0';
    volumeSlider.max = '100';
    volumeSlider.value = String(Math.round(deps.settings.volume * 100));
    volumeSlider.disabled = deps.settings.muted;
    volumeSlider.addEventListener('input', () => this.applyVolume(Number(volumeSlider.value) / 100));
    volumeRow.append(volumeSlider);

    soundSection.append(muteRow, volumeRow);

    const displaySection = el('div', 'settings-section');
    displaySection.append(el('h2', 'settings-heading', 'Display'));

    const namesRow = el('label', 'settings-row');
    const namesCheck = el('input') as HTMLInputElement;
    namesCheck.type = 'checkbox';
    namesCheck.checked = deps.settings.showBuildingNames;
    namesRow.append(namesCheck, el('span', 'settings-label', 'Show building names'));
    namesCheck.addEventListener('change', () => this.applyShowBuildingNames(namesCheck.checked));

    displaySection.append(namesRow);

    const actions = el('div', 'settings-actions');
    const resumeBtn = el('button', 'btn big', 'Resume');
    resumeBtn.addEventListener('click', () => this.close());
    const leaveBtn = el('button', 'btn big settings-leave', 'Leave Match');
    leaveBtn.addEventListener('click', () => deps.onLeaveMatch());
    actions.append(resumeBtn, leaveBtn);

    card.append(soundSection, displaySection, actions);
    this.root.append(title, card);
    this.root.style.display = 'none';

    this.root.addEventListener('click', (e) => {
      if (e.target === this.root) this.close();
    });
  }

  open(): void {
    this.root.style.display = 'flex';
  }

  close(): void {
    this.root.style.display = 'none';
  }

  isOpen(): boolean {
    return this.root.style.display !== 'none';
  }

  private persist(): void {
    void saveSettings(this.deps.settings);
    this.deps.onSettingsChange(this.deps.settings);
  }

  private applyMute(muted: boolean): void {
    this.deps.settings.muted = muted;
    this.deps.audio.setMuted(muted);
    const slider = this.root.querySelector('.settings-slider') as HTMLInputElement | null;
    if (slider) slider.disabled = muted;
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
}
