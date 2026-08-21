/**
 * The transcript on screen (ADR-0001).
 *
 * Separated from the view because displaying a conversation and running a turn are
 * different jobs: this one knows about rows and markdown, and nothing about providers,
 * chains or files.
 *
 * The asymmetry is the point. A human turn is shown exactly as typed — it was written,
 * not generated, so it is not reinterpreted — and only the model's is rendered.
 */
import { MarkdownRenderer } from "obsidian";

export function createThread(container, { app, component }) {
  const el = container.createDiv({ cls: "colloquy-thread" });

  /** Close enough to the end that following along is clearly what you are doing. */
  const NEARLY_THERE = 80;
  const atBottom = () => el.scrollHeight - el.scrollTop - el.clientHeight < NEARLY_THERE;

  /**
   * Follows the answer down, unless you have gone somewhere else.
   *
   * Scrolling on every chunk regardless is the reflex, and it makes a long reply impossible
   * to read while it arrives: go back three paragraphs to check something and the next
   * token snatches you to the bottom again.
   *
   * Forced only when you have just said something, because that is you moving the
   * conversation on rather than the model filling it in.
   */
  const scroll = ({ force = false } = {}) => {
    if (force || atBottom()) el.scrollTop = el.scrollHeight;
  };

  /**
   * One row: who said it, and what they said.
   *
   * A turn typed by a person is marked as one. It is the only asymmetry in here and it
   * earns its place: without it a question and an answer are the same grey text at the same
   * size, and finding what you asked means reading the replies to work out where they
   * started.
   */
  function add(who, text, { literal = false, pending = false, failed = false } = {}) {
    const mine = literal && !failed && !pending;
    const turn = el.createDiv({ cls: `colloquy-turn${failed ? " is-failed" : ""}${mine ? " is-mine" : ""}` });
    const label = turn.createDiv({ cls: "colloquy-who", text: who });
    const body = turn.createDiv({ cls: "colloquy-body" });

    // Something moving, rather than a motionless "…". A local model can take half a minute
    // before its first token, and for all of it a static ellipsis is indistinguishable from
    // a panel that has stopped working.
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
   * Markdown, through Obsidian's own renderer, so it matches every other note.
   *
   * @returns a promise that settles once the markdown is actually on the page. Rendering
   * grows the thread after this call returns, so anyone who needs to know how tall it
   * ended up has to wait for this rather than measure immediately.
   */
  function render(row, markdown, sourcePath = "") {
    row.body.empty();
    const rendered = MarkdownRenderer.render(app, markdown, row.body, sourcePath, component);
    scroll();
    return rendered;
  }

  return { el, add, render, toEnd: () => scroll({ force: true }), empty: () => el.empty() };
}
