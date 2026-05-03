import { Injectable } from '@nestjs/common';

@Injectable()
export class PromptEngineerService {
  buildPrompt(input: {
    prompt: string;
    aspectRatio: string;
    styleHint?: string | null;
    colorHint?: string | null;
    feedback?: string | null;
  }): string {
    const basePrompt = this.sanitizeText(input.prompt, 800);
    const styleHint = this.sanitizeText(input.styleHint ?? '', 120);
    const colorHint = this.sanitizeText(input.colorHint ?? '', 120);
    const feedback = this.sanitizeText(input.feedback ?? '', 400);

    const sections = [
      'Create a premium decorative photo frame overlay.',
      `Aspect ratio: ${input.aspectRatio}.`,
      `Primary concept: ${basePrompt}.`,
      'The frame must leave a transparent center aperture for later user photo placement.',
      'Design the border, corners, and surrounding ornamentation only; do not place text, logos, or watermarks.',
      'Use crisp edges, production-ready detail, and a clean composition suitable for SVG frame reconstruction.',
    ];

    if (styleHint) {
      sections.push(`Style direction: ${styleHint}.`);
    }

    if (colorHint) {
      sections.push(`Color direction: ${colorHint}.`);
    }

    if (feedback) {
      sections.push(
        `Refinement notes from the previous iteration: ${feedback}.`,
      );
    }

    return sections.join(' ');
  }

  buildScenePrompt(input: {
    prompt: string;
    aspectRatio: string;
    styleHint?: string | null;
    colorHint?: string | null;
    feedback?: string | null;
  }): string {
    const basePrompt = this.sanitizeText(input.prompt, 800);
    const styleHint = this.sanitizeText(input.styleHint ?? '', 120);
    const colorHint = this.sanitizeText(input.colorHint ?? '', 120);
    const feedback = this.sanitizeText(input.feedback ?? '', 400);

    const sections = [
      'Create a premium photorealistic real-world scene featuring one blank frame, sign, or placard for later image insertion.',
      `Aspect ratio: ${input.aspectRatio}.`,
      `Primary concept: ${basePrompt}.`,
      'The printable plane must be empty, near-frontal or mild-perspective only, with all four edges fully visible.',
      'People, hands, and environment props are allowed, but they must not cross into the printable plane interior.',
      'Do not place any text, logos, watermarks, or user-facing typography on the scene.',
      'Use realistic lighting, depth, materials, and production-ready detail suitable for later affine image compositing.',
    ];

    if (styleHint) {
      sections.push(`Style direction: ${styleHint}.`);
    }

    if (colorHint) {
      sections.push(`Color direction: ${colorHint}.`);
    }

    if (feedback) {
      sections.push(
        `Refinement notes from the previous iteration: ${feedback}.`,
      );
    }

    return sections.join(' ');
  }

  buildFrameName(prompt: string, iterationNumber: number): string {
    const cleaned = this.sanitizeText(prompt, 80).replace(/\s+/g, ' ').trim();
    const title =
      cleaned.length > 0
        ? cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
        : 'AI Frame';
    return `${title} (${iterationNumber})`.slice(0, 255);
  }

  private sanitizeText(value: string, maxLength: number): string {
    return value
      .replace(/[`<>]/g, ' ')
      .replace(/\b(system|assistant|developer)\s*:/gi, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, maxLength);
  }
}
