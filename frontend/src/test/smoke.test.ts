import { describe, expect, it } from 'vitest';
import { TEST_FIXTURE_NOTICE } from './fixtures';

describe('test harness', () => {
  it('runs in jsdom with jest-dom matchers', () => {
    document.body.innerHTML = '<p>ok</p>';
    expect(document.body.querySelector('p')).toBeInTheDocument();
    expect(TEST_FIXTURE_NOTICE).toContain('not real data');
  });
});
