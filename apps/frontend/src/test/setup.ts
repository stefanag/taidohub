import '@testing-library/jest-dom/vitest';
import '@/i18n';
import { afterAll, afterEach, beforeAll } from 'vitest';

import { server } from './msw-server.js';

// jsdom polyfills required by Quill's selection/range usage. Shared here
// so every test file that mounts Quill (RichTextEditor, QuillViewer,
// ProfileForm, UserForm Profile tab) doesn't have to copy the block.
if (!Range.prototype.getBoundingClientRect) {
  Range.prototype.getBoundingClientRect = () =>
    ({
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      toJSON: () => ({}),
    }) as DOMRect;
}
if (!Range.prototype.getClientRects) {
  Range.prototype.getClientRects = () =>
    ({ length: 0, item: () => null, [Symbol.iterator]: function* () {} }) as unknown as DOMRectList;
}

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'warn' });
});

afterEach(() => {
  server.resetHandlers();
});

afterAll(() => {
  server.close();
});
