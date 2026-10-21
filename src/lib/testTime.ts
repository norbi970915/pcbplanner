// Time limits of the speed tests. They are set for a desktop; a CI runner (CI is set by GitHub Actions) is
// slower and shared, so it gets three times as long. A limit still catches a slowdown of an order of magnitude.
export const timeLimit = (ms: number) => (typeof process !== 'undefined' && process.env.CI ? ms * 3 : ms);
