import type { Result } from '../contracts/index';

/**
 * What the window shows while a repository opens, and the open's own life: from
 * the moment a folder is chosen, or named on the command line, until its page is
 * drawn, its failure shown, or a person cancels it (E07-M01-S06).
 *
 * Before this, the only sign of an open was the Open Repository control turning
 * into a disabled *Opening…*, while the window went on showing the repository
 * before it. The owner could not tell which folder was opening, or whether the
 * application had hung. So the notice says the folder's name and its whole path,
 * in a card over the middle of the window, which is where the folder chooser
 * stood a moment before; it carries an indicator that turns while the work goes
 * on; and it offers Cancel, which Escape presses too.
 *
 * It holds no rule. The notice is elements, and the open's life is one question:
 * is this reply still wanted? It is not once the open was cancelled or another
 * open began, and then it is not drawn, whatever it says.
 *
 * Everything is built from elements and `textContent`, never from a markup
 * string, so a folder's name cannot be interpreted as markup.
 */

/** What the card says above the folder's name. */
const OPENING_LABEL = 'Opening repository';

/** What the control that cancels the open says. */
const CANCEL_LABEL = 'Cancel';

/** The notice, as the shell places and drives it. */
export interface OpeningNotice {
  /** The veil over what the window shows, with the card in its middle. Hidden until an open. */
  readonly veil: HTMLElement;
  /**
   * The polite live region the notice is announced through. It stays in the
   * page, empty, between opens, because a region that appears with its text
   * already in it is not reliably announced (WAI-ARIA's guidance on live
   * regions, not measured here with a screen reader). It is not a `status`
   * role, because the notices strip under the bar is the window's one `status`.
   */
  readonly said: HTMLElement;
  /** Say that `path` is opening, and show the card. */
  readonly show: (path: string) => void;
  /** Take the card away and empty the live region. */
  readonly hide: () => void;
  /** Register what Cancel, and Escape while the card is shown, call. */
  readonly onCancel: (listener: () => void) => void;
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
): HTMLElementTagNameMap[K] {
  const made = document.createElement(tag);
  made.className = className;
  return made;
}

/**
 * The folder's own name: the last part of `path`, whichever separator it is
 * written with, or the path itself when it has no part, such as a drive's root.
 */
export function folderName(path: string): string {
  return path.split(/[\\/]/).findLast((part) => part.length > 0) ?? path;
}

/** Whether a key press is a plain Escape: no modifier, and not already taken by a control. */
function plainEscape(event: KeyboardEvent): boolean {
  return (
    event.key === 'Escape' &&
    !event.defaultPrevented &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey
  );
}

/** The card: the indicator, what it says, and Cancel. */
function buildCard(): {
  card: HTMLElement;
  name: HTMLElement;
  where: HTMLElement;
  cancel: HTMLButtonElement;
} {
  const card = element('div', 'opening__card');
  const spinner = element('div', 'opening__spinner');
  spinner.setAttribute('aria-hidden', 'true');
  const label = element('p', 'opening__label');
  label.textContent = OPENING_LABEL;
  const name = element('p', 'opening__name');
  const where = element('p', 'opening__path');
  const cancel = element('button', 'bar__button opening__cancel');
  cancel.type = 'button';
  cancel.textContent = CANCEL_LABEL;
  card.append(spinner, label, name, where, cancel);
  return { card, name, where, cancel };
}

/**
 * Build the notice, hidden. `keepsEscape` says whether a key pressed on a target
 * is a control's own Escape, such as the open Branches list's, which closes the
 * list and not the open: one thing a press, as everywhere else in the window.
 *
 * Escape is listened for on the window, before anything inside it hears the key,
 * so that the open details of the repository shown behind the card do not take
 * it first; and taken with `preventDefault`, which every other listener of the
 * window's keys reads as "not mine".
 */
export function mountOpeningNotice(
  keepsEscape: (target: EventTarget | null) => boolean,
): OpeningNotice {
  const veil = element('div', 'opening');
  const { card, name, where, cancel } = buildCard();
  veil.append(card);
  veil.hidden = true;
  const said = element('p', 'opening__said');
  said.setAttribute('aria-live', 'polite');
  said.setAttribute('aria-atomic', 'true');
  let listener = (): void => undefined;
  cancel.addEventListener('click', () => {
    listener();
  });
  window.addEventListener(
    'keydown',
    (event) => {
      if (!veil.hidden && plainEscape(event) && !keepsEscape(event.target)) {
        event.preventDefault();
        listener();
      }
    },
    true,
  );
  return {
    veil,
    said,
    show: (path: string): void => {
      name.textContent = folderName(path);
      where.textContent = path;
      said.textContent = `Opening ${folderName(path)}, ${path}`;
      veil.hidden = false;
    },
    hide: (): void => {
      veil.hidden = true;
      said.textContent = '';
    },
    onCancel: (registered: () => void): void => {
      listener = registered;
    },
  };
}

/** What the shell offers an open: its notice, and the content behind it held still. */
export interface OpeningShell {
  /** Show the notice of `path`, and hold what the window shows behind it. */
  readonly showOpening: (path: string) => void;
  /** Take the notice away and give back what was held. */
  readonly hideOpening: () => void;
  /** Register what Cancel and Escape call. */
  readonly onCancelOpening: (listener: () => void) => void;
}

/**
 * The reply to `request`, made for the open in progress. As soon as that open is
 * cancelled or another begins, whether or not the reply has come, it returns
 * nothing ever again: it ends the open's work where it waits, by throwing
 * {@link OpenOver}, which {@link Open} catches. So a cancel ends the wait at once,
 * and a reply that comes after it is never handed to anything.
 */
export type Answer = <T>(request: Promise<T>) => Promise<T>;

/**
 * Open `path`: show its notice, ending any open still in progress, run `work`,
 * which asks for the open's replies through `answer`, and take the notice away
 * when `work` is done, if it is still this open's.
 */
export type Open = (path: string, work: (answer: Answer) => Promise<void>) => Promise<void>;

/**
 * What ends an open's work at the {@link Answer} it waits on, once the open is
 * over. It says nothing, because nothing shows it: {@link Open} catches every one.
 */
class OpenOver extends Error {}

/**
 * Tie the notice to the opens. A cancel takes the notice away at once, ends the
 * wait of the open in progress, and asks the main process to cancel it there
 * too, so that the git it is running is ended and what was open before it stays
 * open; `keeping` shows why that could not be done, if it could not.
 */
export function connectOpenings(
  shell: OpeningShell,
  keeping: (work: Promise<Result<unknown>>) => void,
): Open {
  let current: { readonly end: () => void } | null = null;
  shell.onCancelOpening(() => {
    if (current === null) {
      return;
    }
    current.end();
    current = null;
    shell.hideOpening();
    keeping(window.gitGraphical.cancelOpen());
  });
  return async (path, work): Promise<void> => {
    current?.end();
    let end = (): void => undefined;
    const ended = new Promise<never>((_resolve, reject) => {
      end = (): void => {
        reject(new OpenOver());
      };
    });
    // Handled here as well, for an open ended while no answer waits on it.
    void ended.catch(() => undefined);
    const mine = { end };
    current = mine;
    shell.showOpening(path);
    try {
      await work(async (request) => {
        const reply = await Promise.race([request, ended]);
        if (current !== mine) {
          throw new OpenOver();
        }
        return reply;
      });
    } catch (error: unknown) {
      if (!(error instanceof OpenOver)) {
        throw error;
      }
    } finally {
      if (current === mine) {
        current = null;
        shell.hideOpening();
      }
    }
  };
}
