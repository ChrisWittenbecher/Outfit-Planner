// @ts-nocheck
import { $ } from './core.js';
import { haptic } from './haptics.js';
import { TITLE, VIEWS, hashOf, nextTab, viewOf } from './views.js';

// Bereiche der App als Reiter. Der Schrank hat keine Adresse, die anderen Bereiche stehen im Adressteil (#vorschlaege).
// Jeder Wechsel legt einen Verlaufseintrag an, damit „Zurück“ zum vorigen Bereich führt. Die Dialoge (sheet.js) legen eigene
// Einträge mit gleicher Adresse an; beim Zurück bleibt der Bereich dann derselbe, nur der Dialog schließt.
const HEAD = { schrank: 'outfitTitle', vorschlaege: 'sugTitle' };
let current = viewOf(location.hash);

export const currentView = () => current;

function apply(view){
  current = view;
  document.documentElement.dataset.view = view;
  for(const v of VIEWS){
    const on = v === view, tab = $('tab-' + v);
    $('view-' + v).hidden = !on;
    tab.setAttribute('aria-selected', String(on));
    tab.tabIndex = on ? 0 : -1;
  }
  document.title = TITLE[view];
  document.dispatchEvent(new CustomEvent('anprobe:view', {detail:{view}}));
}

/** Wechselt den Bereich. Mit focus springt der Fokus auf die Überschrift des Bereichs (für Wechsel, die nicht vom Reiter kommen). */
export function go(view, {focus = false} = {}){
  if(!VIEWS.includes(view)) return;
  if(view !== current){
    try{ history.pushState({anprobeView:view}, '', location.pathname + location.search + hashOf(view)); }catch(e){ /* ohne Verlauf wechselt nur die Ansicht */ }
    apply(view);
    scrollTo(0, 0);
  }
  if(focus) focusHead(view);
}

/** Setzt den Fokus auf die Überschrift. Manche Browser (WebKit) nehmen ihn gleich nach dem Klick wieder weg, wenn der geklickte Knopf
 *  im verborgenen Bereich lag; dann holt ein zweiter Versuch im nächsten Bild ihn zurück, solange sonst nichts den Fokus hat. */
function focusHead(view){
  const h = $(HEAD[view]); if(!h) return;
  h.focus({preventScroll:true});
  requestAnimationFrame(() => {
    const a = document.activeElement;
    if(current === view && (!a || a === document.body)) h.focus({preventScroll:true});
  });
}

for(const tab of document.querySelectorAll('#tabs [role="tab"]')) tab.addEventListener('click', () => { haptic('select'); go(tab.dataset.view); });
$('tabs').addEventListener('keydown', e => {
  const tab = e.target.closest?.('[role="tab"]'); if(!tab || e.altKey || e.ctrlKey || e.metaKey) return;
  const next = nextTab(VIEWS, tab.dataset.view, e.key); if(!next) return;
  e.preventDefault(); go(next); $('tab-' + next).focus();
});
addEventListener('popstate', () => { const v = viewOf(location.hash); if(v !== current) apply(v); });

apply(current);
