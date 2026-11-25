import { DashboardPage } from './DashboardPage.js';

import type { Meta, StoryObj } from '@storybook/react-vite';


const meta = {
  title: 'Pages/Dashboard',
  component: DashboardPage,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof DashboardPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
