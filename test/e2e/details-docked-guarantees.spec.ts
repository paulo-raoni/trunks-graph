import { expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';

import { ROW_HEIGHT } from '../../src/ui/geometry';

import { withBudgeted } from './support/budgets';
import {
  loadMoreAndShow,
  readProbe,
  scrollListTo,
  viewportHeight,
  wakeupsSettled,
} from './support/budgets-page';
import { fixture } from './support/fixtures';

/**
 * Guarantees of the details area docked at the bottom (E04-M01-S12) that no case held
 * until E07-M01-S02: the one kept height a drag never moves against its direction, the
 * height the panel shows when the window shrinks, at most one redraw a frame across a
 * drag that spans frames, the readings with Auto Center on beyond the centred row, and
 * the rows being their closed tops.
 *
 * Every reading is compared with a literal computed here from the rows' heights, or with
 * the same window's closed graph, never with the code under test.
 */

test.describe.configure({ timeout: 300_000 });

const MOVE = 'move main on';
const [AREA, EDGE, INFO] = ['.details:not([hidden])', '.details__edge', '.details__info'];
const FIRST = 5000;

const painted = (page: Page): Promise<number> => page.evaluate(wakeupsSettled, 20_000);

async function box(
  page: Page,
  selector: string,
): Promise<{ x: number; y: number; w: number; h: number }> {
  const found = await page.locator(selector).boundingBox();
  if (found === null) throw new Error(`${selector} has no box`);
  return { x: found.x, y: found.y, w: found.width, h: found.height };
}

/** Press the middle of `selector`, move by `dy` in eight steps, release, and wait for the frames. */
async function drag(page: Page, selector: string, dy: number): Promise<void> {
  const at = await box(page, selector);
  const [x, y] = [at.x + at.w / 2, at.y + at.h / 2];
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + dy, { steps: 8 });
  await page.mouse.up();
  await painted(page);
}

async function openRow(page: Page, text: string): Promise<void> {
  await page.locator('.row', { hasText: text }).locator('.row__subject').click();
  await expect(page.locator('.row--open')).toContainText(text);
  await expect(page.locator(INFO)).not.toHaveText('Loading…');
  await painted(page);
}

/** Choose `value` of the option `title` from the open area's Options menu. */
async function choose(page: Page, title: string, value: string): Promise<void> {
  await page.locator(`${AREA} button[title="Options"]`).click();
  const lines = page.locator('.files__menu > *');
  const texts = (await lines.allTextContents()).map((text) => text.replace('●', ''));
  const heading = texts.indexOf(title);
  await lines.nth(texts.findIndex((text, at) => at > heading && text === value)).click();
  await painted(page);
}

const ready = async (page: Page): Promise<void> => {
  await expect(page.locator('.row:not([hidden])').first()).toBeVisible({ timeout: 60_000 });
};

/** The one height the view keeps, as the stylesheet reads it. */
const keptHeight = async (page: Page): Promise<number> =>
  Number.parseFloat(
    await page
      .locator('.graph')
      .evaluate((view: { style: { getPropertyValue: (n: string) => string } }) =>
        view.style.getPropertyValue('--details-height'),
      ),
  );

test('docked: a drag never moves the kept height against its own direction', async () => {
  await withBudgeted({ open: fixture('details', 'script', 6) }, async ({ page }) => {
    await ready(page);
    await openRow(page, MOVE);
    // Inline the room is the list less a row: grown to it, the kept height is above the docked room.
    await drag(page, EDGE, 3000);
    const kept = await keptHeight(page);
    await choose(page, 'Location', 'Docked to Bottom');
    const room = (await box(page, '.graph')).h - 4 * ROW_HEIGHT;
    expect(kept).toBeGreaterThan(room + 24);
    expect(await keptHeight(page)).toBe(kept);
    // The panel shows no taller than its room.
    expect((await box(page, AREA)).h).toBeLessThanOrEqual(room + 1);
    // Up: it never lowers.
    await drag(page, EDGE, -100);
    expect(await keptHeight(page)).toBeGreaterThanOrEqual(kept);
    expect((await box(page, AREA)).h).toBeLessThanOrEqual(room + 1);
    // Down: it never raises.
    const after = await keptHeight(page);
    await drag(page, EDGE, 20);
    expect(await keptHeight(page)).toBeLessThanOrEqual(after);
    // Down far enough to be under the room is the drag's own: the panel follows it.
    await drag(page, EDGE, 3000);
    expect((await box(page, AREA)).h).toBe(120);
  });
});

/** Set the window's height, and wait until the view has taken another height of it. */
async function resizeTo(
  application: ElectronApplication,
  page: Page,
  height: number,
): Promise<void> {
  const before = (await box(page, '.graph')).h;
  await application.evaluate(({ BrowserWindow }, wanted) => {
    BrowserWindow.getAllWindows()[0]?.setSize(1280, wanted);
  }, height);
  await expect.poll(async () => (await box(page, '.graph')).h).not.toBe(before);
  await painted(page);
}

test('docked: when the window shrinks the panel is held to its room, and the kept height is not lowered', async () => {
  await withBudgeted({ open: fixture('details', 'script', 6) }, async ({ application, page }) => {
    await ready(page);
    await openRow(page, MOVE);
    await choose(page, 'Location', 'Docked to Bottom');
    await drag(page, EDGE, -150);
    expect((await box(page, AREA)).h).toBe(400);
    await resizeTo(application, page, 520);
    const view = await box(page, '.graph');
    expect(400).toBeGreaterThan(view.h - 4 * ROW_HEIGHT);
    expect(Math.abs((await box(page, AREA)).h - (view.h - 4 * ROW_HEIGHT))).toBeLessThanOrEqual(1);
    expect((await box(page, '.graph__scroll')).h).toBeGreaterThanOrEqual(4 * ROW_HEIGHT);
    expect(await keptHeight(page)).toBe(400);
    await resizeTo(application, page, 800);
    expect((await box(page, AREA)).h).toBe(400);
  });
});

/**
 * Runs in the page: `frames` pointer moves on the edge, one in each frame, `step` pixels
 * further each.
 */
async function dragFrames(shape: { frames: number; step: number }): Promise<void> {
  const scope = globalThis as unknown as {
    document: {
      querySelector: (at: string) => {
        getBoundingClientRect: () => { top: number };
        dispatchEvent: (event: object) => void;
      } | null;
    };
    PointerEvent: new (type: string, init: object) => object;
    requestAnimationFrame: (callback: () => void) => number;
  };
  const handle = scope.document.querySelector('.details__edge');
  const start = handle?.getBoundingClientRect().top ?? 0;
  for (let frame = 1; frame <= shape.frames; frame += 1) {
    await new Promise<void>((done) => {
      scope.requestAnimationFrame(() => {
        handle?.dispatchEvent(
          new scope.PointerEvent('pointermove', {
            clientX: 400,
            clientY: start + frame * shape.step,
            bubbles: true,
          }),
        );
        done();
      });
    });
  }
}

test('docked and inline: a drag that spans frames costs at most one redraw a frame', async () => {
  await withBudgeted({ open: fixture('details', 'script', 6) }, async ({ page }) => {
    await ready(page);
    await openRow(page, MOVE);
    const frames = 20;
    for (const place of ['Inline', 'Docked to Bottom']) {
      await choose(page, 'Location', place);
      const at = await box(page, EDGE);
      await page.mouse.move(at.x + at.w / 2, at.y + at.h / 2);
      await page.mouse.down();
      const before = (await page.evaluate(readProbe)).redraws;
      await page.evaluate(dragFrames, { frames, step: place === 'Inline' ? 4 : -4 });
      await painted(page);
      const redraws = (await page.evaluate(readProbe)).redraws - before;
      await page.mouse.up();
      await painted(page);
      // Each move changes the height, so each frame draws once, and the last move's frame
      // comes after the loop's last wait: none under the frames less one, none over one more.
      expect(redraws, place).toBeGreaterThanOrEqual(frames - 1);
      expect(redraws, place).toBeLessThanOrEqual(frames + 1);
    }
  });
});

/** Runs in the page: where the list is scrolled to. */
function readOffset(): number {
  const scope = globalThis as unknown as {
    document: { querySelector: (at: string) => { scrollTop: number } | null };
  };
  return scope.document.querySelector('.graph__scroll')?.scrollTop ?? -1;
}

/** Open layout row `row`, which is at its closed place, and wait for its frame. */
async function openAt(page: Page, row: number): Promise<void> {
  const mine = page.locator(`.row[style*="translateY(${String(row * ROW_HEIGHT)}px)"]`);
  await mine.locator('.row__subject').click();
  await expect(mine).toHaveClass(/row--open/);
  await expect(page.locator(INFO)).not.toHaveText('Loading…');
  await painted(page);
}

test('docked, Auto Center on: the next row by an arrow is centred, and the first rows stop at the top', async () => {
  await withBudgeted({ open: fixture('large', 'large', 10_000) }, async ({ page }) => {
    await ready(page);
    await page.evaluate(loadMoreAndShow, 9700);
    await page.evaluate(scrollListTo, FIRST * ROW_HEIGHT);
    await openAt(page, FIRST + 5);
    await choose(page, 'Location', 'Docked to Bottom');
    const list = await page.evaluate(viewportHeight);
    const centred = (row: number): number => row * ROW_HEIGHT + (ROW_HEIGHT - list) / 2;
    // The row beyond the one that was clicked: one arrow, and it is the centred one.
    await page.keyboard.press('ArrowDown');
    await painted(page);
    expect(Math.abs((await page.evaluate(readOffset)) - centred(FIRST + 6))).toBeLessThanOrEqual(1);
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp');
    await painted(page);
    expect(Math.abs((await page.evaluate(readOffset)) - centred(FIRST + 4))).toBeLessThanOrEqual(1);
    // A row too near the top to be centred: the list stops at its first row.
    await page.locator('.details__close').click();
    await page.evaluate(scrollListTo, 0);
    await painted(page);
    await openAt(page, 2);
    expect(await page.evaluate(readOffset)).toBe(0);
  });
});

/** Runs in the page: the content offset of every row shown, by its subject. */
function shownTops(): Record<string, string> {
  const scope = globalThis as unknown as {
    document: {
      querySelectorAll: (at: string) => Iterable<{
        style: { transform: string };
        querySelector: (at: string) => { textContent: string | null } | null;
      }>;
    };
  };
  const found: Record<string, string> = {};
  for (const row of scope.document.querySelectorAll('.row:not([hidden])')) {
    found[row.querySelector('.row__subject')?.textContent ?? ''] = row.style.transform;
  }
  return found;
}

test('docked: every row shown is at the content offset it has with the area closed', async () => {
  await withBudgeted({ open: fixture('large', 'large', 10_000) }, async ({ page }) => {
    await ready(page);
    await page.evaluate(loadMoreAndShow, 9700);
    // An offset that is not a whole number of rows, so a row that moved by the area is a row that differs.
    await page.evaluate(scrollListTo, FIRST * ROW_HEIGHT + 10);
    await openAt(page, FIRST + 5);
    await choose(page, 'Location', 'Docked to Bottom');
    const docked = await page.evaluate(shownTops);
    await page.locator('.details__close').click();
    await painted(page);
    const closed = await page.evaluate(shownTops);
    expect(Object.keys(docked).length).toBeGreaterThan(8);
    for (const [subject, top] of Object.entries(docked)) {
      expect(closed[subject], subject).toBe(top);
    }
  });
});
