import type { EditorProblem } from './editorView';
import { el, esc } from './ui';

export class ProblemsView {
  onOpen: (path: string, line: number) => void = () => {};
  private problems: EditorProblem[] = [];

  constructor(private mount: HTMLElement) {
    this.render();
  }

  update(problems: EditorProblem[]): void {
    this.problems = problems;
    this.render();
  }

  get count(): number {
    return this.problems.length;
  }

  private render(): void {
    this.mount.innerHTML = '';
    if (!this.problems.length) {
      this.mount.append(el('div', 'problems-empty', 'No problems detected in open files.'));
      return;
    }
    const sorted = [...this.problems].sort((a, b) => {
      const rank = { error: 0, warning: 1, info: 2 };
      return rank[a.severity] - rank[b.severity] || a.path.localeCompare(b.path) || a.line - b.line;
    });
    for (const problem of sorted) {
      const row = el('button', `problem-row severity-${problem.severity}`);
      row.innerHTML = `<span class="problem-symbol">${problem.severity === 'error' ? '×' : problem.severity === 'warning' ? '!' : 'i'}</span><span class="problem-copy"><b>${esc(problem.message)}</b><small>${esc(problem.path)}:${problem.line}:${problem.column} · ${esc(problem.source)}</small></span>`;
      row.onclick = () => this.onOpen(problem.path, problem.line);
      this.mount.append(row);
    }
  }
}
