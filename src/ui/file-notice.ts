import type { FileActionResponse } from '../contracts/index';

/**
 * The line of the changed-files pane that says why an action failed (E04-M01-S10), and
 * the rule that keeps a late reply off it (E07-M01-S02).
 *
 * Whatever is shown, cleared or asked again **supersedes** the replies still on their
 * way: an action's reply comes back later than the click, and by then the pane may show
 * another commit's files or another action's outcome, which a failure of the first
 * would be written over. A reply shown is the reply of the last thing the pane was told.
 */
export interface Notice {
  /** Show `text`, or clear the line with `''`, and supersede every reply still on its way. */
  readonly show: (text: string) => void;
  /** Show the failure of `reply`, unless something was shown or asked after this call. */
  readonly follow: (reply: Promise<FileActionResponse>) => void;
}

/** Make the notice of `line`, which is hidden while it has nothing to say. */
export function createNotice(line: HTMLElement): Notice {
  let latest = 0;
  const show = (text: string): void => {
    latest += 1;
    line.textContent = text;
    line.hidden = text === '';
  };
  return {
    show,
    follow: (reply: Promise<FileActionResponse>): void => {
      const asked = latest;
      const say = (text: string): void => {
        if (asked === latest) show(text);
      };
      void reply.then(
        (done) => {
          say(done.ok ? '' : done.message);
        },
        (error: unknown) => {
          say(error instanceof Error ? error.message : String(error));
        },
      );
    },
  };
}
