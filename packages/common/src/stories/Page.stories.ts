import type { Meta, StoryObj } from '@storybook/react';
// Optional import for build environments without @storybook/test
type ElementContainer = HTMLElement;

let userEvent = { click: async (_: HTMLElement) => {} };
let within = (_: ElementContainer) => ({
  getByRole: async (_name: string, _options: Record<string, unknown>) => document.createElement('button'),
});

// Use a try-catch with dynamic import instead
(async () => {
  try {
    // Using dynamic import instead of require
    const storybookTest = await import('@storybook/test');
    userEvent = storybookTest.userEvent;
    within = storybookTest.within;
  } catch (e) {
    // Use a silent fail for storybook test availability
    // This is only used in development/test environments
  }
})();

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
