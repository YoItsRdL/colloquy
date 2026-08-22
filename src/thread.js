/**
 * The transcript on screen.
 *
 * A human turn is shown exactly as typed — it was written, not generated — and only the
 * model's is rendered as markdown.
 */
import { MarkdownRenderer } from "obsidian";

export function createThread(container, { app, component }) {
  const el = container.createDiv({ cls: "colloquy-thread" });

  const NEARLY_THERE = 80;
  const atBottom = () => el.scrollHeight - el.scrollTop - el.clientHeight < NEARLY_THERE;

  /**
   * Follows the answer down, unless you have gone somewhere else. Scrolling on every chunk
   * regardless makes a long reply impossible to read while it arrives.
   *
   * Forced only when you have just said something.
   */
  const scroll = ({ force = false } = {}) => {
    if (force || atBottom()) el.scrollTop = el.scrollHeight;
  };

  function add(who, text, { literal = false, pending = false, failed = false } = {}) {
    const mine = literal && !failed && !pending;
    const turn = el.createDiv({ cls: `colloquy-turn${failed ? " is-failed" : ""}${mine ? " is-mine" : ""}` });
    const label = turn.createDiv({ cls: "colloquy-who", text: who });
    const body = turn.createDiv({ cls: "colloquy-body" });

    // A local model can take half a minute before its first token, and for all of it a
    // static ellipsis is indistinguishable from a panel that has stopped working.
    if (pending) {
      const thinking = body.createDiv({ cls: "colloquy-thinking" });
      for (let i = 0; i < 3; i++) thinking.createSpan();
    } else if (literal || failed) {
      body.setText(text);
    }
    scroll({ force: true });
    return { turn, label, body };
  }

  /**
   * @returns a promise that settles once the markdown is on the page. Rendering grows the
   * thread after this returns, so measuring its height immediately is wrong.
   */
  function render(row, markdown, sourcePath = "") {
    row.body.empty();
    const rendered = MarkdownRenderer.render(app, markdown, row.body, sourcePath, component);
    scroll();
    return rendered;
  }

  return { el, add, render, toEnd: () => scroll({ force: true }), empty: () => el.empty() };
}
