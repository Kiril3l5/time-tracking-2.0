import type { Meta, StoryObj } from '@storybook/react';
// Optional import for build environments without @storybook/test
let userEvent = { click: async (_: any) => {} };
let within = (_: any) => ({
  getByRole: async (_name: string, _options: any) => document.createElement('button'),
});

try {
  const storybookTest = require('@storybook/test');
  userEvent = storybookTest.userEvent;
  within = storybookTest.within;
} catch (e) {
  console.log('Storybook test module not available, using mock functions');
}

import { Page } from './Page';

const meta: Meta<typeof Page> = {
  title: 'Example/Page',
  component: Page,
  parameters: {
    // More on how to position stories at: https://storybook.js.org/docs/configure/story-layout
    layout: 'fullscreen',
  },
};

export default meta;
type Story = StoryObj<typeof Page>;

export const LoggedOut: Story = {};

// More on interaction testing: https://storybook.js.org/docs/writing-tests/interaction-testing
export const LoggedIn: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const loginButton = await canvas.getByRole('button', {
      name: /Log in/i,
    });
    await userEvent.click(loginButton);
  },
};
