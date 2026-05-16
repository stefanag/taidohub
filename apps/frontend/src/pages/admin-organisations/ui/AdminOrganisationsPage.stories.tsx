import type { Meta, StoryObj } from '@storybook/react-vite';

import { AdminOrganisationsPage } from './AdminOrganisationsPage.js';

const meta = {
  title: 'Pages/AdminOrganisations',
  component: AdminOrganisationsPage,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof AdminOrganisationsPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
