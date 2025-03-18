import { describe, it, expect } from 'vitest';

describe('Basic Test Suite', () => {
  it('performs basic assertions', () => {
    expect(1 + 1).toBe(2);
    expect('test').toHaveLength(4);
    expect({ name: 'test' }).toHaveProperty('name');
  });
}); 