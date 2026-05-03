export interface IAiImageGenerator {
  generateImage(
    prompt: string,
    aspectRatio: string,
  ): Promise<{
    url: string;
    provider: string;
    modelVersion: string;
    generationMs: number;
  }>;
}
