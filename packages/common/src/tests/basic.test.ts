import { describe, it, expect } from 'vitest';

describe('Basic Test Suite', () => {
  it('performs basic assertions', () => {
    expect(1 + 1).toBe(2);
    expect('test').toHaveLength(4);
    expect({ name: 'test' }).toHaveProperty('name');
  });
  
  it('works with arrays', () => {
    const arr = [1, 2, 3];
    expect(arr).toHaveLength(3);
    expect(arr).toContain(2);
    expect(arr).not.toContain(4);
  });
  
  it('works with objects', () => {
    const obj = { name: 'test', value: 42 };
    expect(obj).toHaveProperty('name');
    expect(obj.name).toBe('test');
    expect(obj.value).toBe(42);
  });
}); 