import { registerAs } from '@nestjs/config';

export interface AiConfig {
  provider: string;
  providerFallbacks: string[];
  sceneModeAccess: 'admin' | 'premium' | 'all';
  openAiApiKey?: string;
  stableDiffusionApiKey?: string;
  dailyLimitFree: number;
  dailyLimitPremium: number;
  burstLimit: number;
  burstWindowSeconds: number;
  maxIterationsPerJob: number;
  regenCooldownSeconds: number;
  maxConcurrentJobsPerUser: number;
  pendingQueueLimitPerUser: number;
  apertureInsetPct: number;
  statusCacheTtl: number;
  jobListCacheTtl: number;
  providerTimeoutMs: number;
}

function parseFallbacks(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

export default registerAs(
  'ai',
  (): AiConfig => ({
    provider: process.env.AI_PROVIDER || 'dalle3',
    providerFallbacks: parseFallbacks(process.env.AI_PROVIDER_FALLBACKS),
    sceneModeAccess:
      (process.env.AI_SCENE_MODE_ACCESS as 'admin' | 'premium' | 'all') ||
      'admin',
    openAiApiKey: process.env.OPENAI_API_KEY || undefined,
    stableDiffusionApiKey: process.env.STABLE_DIFFUSION_API_KEY || undefined,
    dailyLimitFree: parseInt(process.env.AI_FRAME_DAILY_LIMIT_FREE || '10', 10),
    dailyLimitPremium: parseInt(
      process.env.AI_FRAME_DAILY_LIMIT_PREMIUM || '50',
      10,
    ),
    burstLimit: parseInt(process.env.AI_FRAME_BURST_LIMIT || '5', 10),
    burstWindowSeconds: parseInt(
      process.env.AI_FRAME_BURST_WINDOW_SECONDS || '60',
      10,
    ),
    maxIterationsPerJob: parseInt(
      process.env.AI_FRAME_MAX_ITERATIONS_PER_JOB || '10',
      10,
    ),
    regenCooldownSeconds: parseInt(
      process.env.AI_FRAME_REGEN_COOLDOWN_SECONDS || '15',
      10,
    ),
    maxConcurrentJobsPerUser: parseInt(
      process.env.AI_FRAME_MAX_CONCURRENT_JOBS_PER_USER || '2',
      10,
    ),
    pendingQueueLimitPerUser: parseInt(
      process.env.AI_FRAME_PENDING_QUEUE_LIMIT_PER_USER || '3',
      10,
    ),
    apertureInsetPct: parseFloat(
      process.env.AI_FRAME_APERTURE_INSET_PCT || '0.125',
    ),
    statusCacheTtl: parseInt(process.env.AI_FRAME_STATUS_CACHE_TTL || '30', 10),
    jobListCacheTtl: parseInt(
      process.env.AI_FRAME_JOB_LIST_CACHE_TTL || '120',
      10,
    ),
    providerTimeoutMs: parseInt(
      process.env.AI_FRAME_PROVIDER_TIMEOUT_MS || '90000',
      10,
    ),
  }),
);
