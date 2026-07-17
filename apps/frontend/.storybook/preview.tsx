import { QueryClientProvider } from '@tanstack/react-query';
import type { Preview } from '@storybook/react-vite';
import { initialize, mswLoader } from 'msw-storybook-addon';

import { AbilityProvider } from '../src/shared/lib/casl/ability-context';
import { defineAbilityFor } from '../src/shared/lib/casl/defineAbilityFor';
import { createQueryClient } from '../src/shared/api/queryClient';

import '../src/app/styles/globals.css';

// Boots MSW once for the whole Storybook process.
initialize({ onUnhandledRequest: 'warn' });

// Build a permissive default ability so stories that call `<Can>` render
// their gated children — individual stories can override with their own
// decorator if they want to test the locked-out state.
const permissiveAbility = defineAbilityFor({ id: 'storybook-user', role: 'admin' });

const preview: Preview = {
  parameters: {
    layout: 'centered',
    a11y: { config: {} },
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/ } },
    // No default MSW handlers — individual stories opt-in via their own
    // `parameters.msw.handlers`. We kept the `msw-storybook-addon` boot
    // above so stories that DO declare handlers still get them.
    msw: { handlers: [] },
  },
  loaders: [mswLoader],
  decorators: [
    (Story) => {
      const queryClient = createQueryClient();
      return (
        <QueryClientProvider client={queryClient}>
          <AbilityProvider value={permissiveAbility}>
            <Story />
          </AbilityProvider>
        </QueryClientProvider>
      );
    },
  ],
};

export default preview;
