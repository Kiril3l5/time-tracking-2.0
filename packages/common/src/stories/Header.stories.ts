import type { Meta, StoryObj } from '@storybook/react';
// Optional import for build environments without @storybook/test
let fn = () => {};

// Use dynamic import for storybook test
(async () => {
  try {
    const storybookTest = await import('@storybook/test');
    fn = storybookTest.fn;
  } catch (e) {
    console.log('Storybook test module not available, using mock function');
  }
})();

import { Header } from './Header';

// More on how to set up stories at: https://storybook.js.org/docs/writing-stories#default-export
const meta: Meta<typeof Header> = {
  title: 'Example/Header',
  component: Header,
  // This component will have an automatically generated Autodocs entry: https://storybook.js.org/docs/writing-docs/autodocs
  tags: ['autodocs'],
  parameters: {
    // More on how to position stories at: https://storybook.js.org/docs/configure/story-layout
    layout: 'fullscreen',
  },
  // More on argTypes: https://storybook.js.org/docs/api/argtypes
  // Use `fn` to spy on the onClick arg, which will appear in the actions panel once invoked: https://storybook.js.org/docs/essentials/actions#action-args
  args: { onLogin: fn, onLogout: fn, onCreateAccount: fn },
};

export default meta;
type Story = StoryObj<typeof Header>;

export const LoggedIn: Story = {
  args: {
    user: {
      name: 'Jane Doe',
    },
  },
};

export const LoggedOut: Story = {};
