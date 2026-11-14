// PROOF HARNESS — mounts exactly one mockup screen at a given density, full-bleed.
//
// This exists so the proof tool can screenshot a real screen at a real viewport with a real density
// tier, rather than scaling a small render up. The query string selects the screen and tier:
//
//   /ui-proof.html?screen=hud&density=compact
//
// Nothing is drawn here that a player would not see; it is the same kit and the same mockups the style
// guide uses.
import './ui/fonts.css';
import './ui/tokens.css';
import './ui/components.css';
import './ui/screens.css';
import './ui-proof.css';

import { setDensity } from './ui/kit';
import { mockHud, mockLobby, mockMainMenu } from './ui-mockups';

const params = new URLSearchParams(window.location.search);
const which = params.get('screen') ?? 'hud';
const density = (params.get('density') ?? 'regular') as 'compact' | 'regular' | 'roomy';

setDensity(density);

const root = document.getElementById('uiproof');
if (!root) throw new Error('missing #uiproof');
root.replaceChildren();

const host = document.createElement('div');
host.className = 'uiproof-host';
host.append(which === 'hud' ? mockHud() : which === 'lobby' ? mockLobby() : mockMainMenu());
root.append(host);

// Report what actually rendered, so the proof tool can assert against it.
(window as unknown as { __uiProof?: unknown }).__uiProof = {
  screen: which,
  density,
  width: window.innerWidth,
  height: window.innerHeight,
  nodes: host.querySelectorAll('*').length,
  buttons: host.querySelectorAll('.btn').length,
  icons: host.querySelectorAll('svg').length,
};
