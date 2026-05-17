import type { Meta, StoryObj } from '@storybook/react-vite';

import { AdminAuditLogPage } from './AdminAuditLogPage.js';

const meta = {
  title: 'Pages/AdminAuditLog',
  component: AdminAuditLogPage,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof AdminAuditLogPage>;

export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
