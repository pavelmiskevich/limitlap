/** The statistics report on screen, with a button to copy it for the author. */

import { formatReport, type Stats } from './stats.ts';

export function createStatsView(root: HTMLElement, panel: HTMLElement, stats: () => Stats): void {
  const open = Object.assign(document.createElement('button'), {
    type: 'button',
    textContent: 'Статистика',
  });
  open.dataset.action = 'stats';
  open.className = 'panel-wide';
  panel.append(open);

  const overlay = document.createElement('div');
  overlay.className = 'stats';
  overlay.hidden = true;
  const report = document.createElement('pre');
  const actions = document.createElement('div');
  actions.className = 'stats-actions';
  const button = (action: string, text: string, run: () => void) => {
    const b = Object.assign(document.createElement('button'), {
      type: 'button',
      textContent: text,
    });
    b.dataset.action = action;
    b.addEventListener('click', run);
    actions.append(b);
    return b;
  };
  const copy = button('copy', 'Скопировать отчёт', () => {
    void navigator.clipboard?.writeText(report.textContent ?? '').then(() => {
      copy.textContent = 'Скопировано';
    });
  });
  button('close', 'Закрыть', () => (overlay.hidden = true));
  overlay.append(report, actions);
  root.append(overlay);

  open.addEventListener('click', () => {
    report.textContent = formatReport(stats());
    copy.textContent = 'Скопировать отчёт';
    overlay.hidden = false;
  });
}
