const isProductionLike =
  process.env.NODE_ENV === 'production' ||
  process.env.CI === 'true' ||
  process.env.RENDER === 'true';

if (isProductionLike) {
  process.exit(0);
}

try {
  const husky = (await import('husky')).default;
  husky();
} catch (error) {
  const message =
    error instanceof Error ? error.message : 'unknown prepare-script error';

  console.warn(`Skipping Husky install: ${message}`);
}
