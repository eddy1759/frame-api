import { PromptEngineerService } from '../prompt-engineer.service';

describe('PromptEngineerService', () => {
  let service: PromptEngineerService;

  beforeEach(() => {
    service = new PromptEngineerService();
  });

  it('builds a provider-safe prompt and strips instruction prefixes', () => {
    const prompt = service.buildPrompt({
      prompt: 'assistant: ornate gold frame around a family portrait',
      aspectRatio: '9:16',
      styleHint: 'developer: art deco',
      colorHint: 'emerald and ivory',
      feedback: 'system: make the corners softer',
    });

    expect(prompt).toContain('Aspect ratio: 9:16.');
    expect(prompt).toContain(
      'Primary concept: ornate gold frame around a family portrait.',
    );
    expect(prompt).toContain('Style direction: art deco.');
    expect(prompt).toContain('Color direction: emerald and ivory.');
    expect(prompt).toContain(
      'Refinement notes from the previous iteration: make the corners softer.',
    );
    expect(prompt).not.toContain('assistant:');
    expect(prompt).not.toContain('developer:');
    expect(prompt).not.toContain('system:');
  });

  it('creates a readable frame name from the original prompt', () => {
    expect(service.buildFrameName('minimal silver frame', 3)).toBe(
      'Minimal silver frame (3)',
    );
  });

  it('builds a dedicated scene-generation prompt without printable-plane text', () => {
    const prompt = service.buildScenePrompt({
      prompt: 'assistant: an elegant wedding reception sign scene',
      aspectRatio: '9:16',
      styleHint: 'developer: cinematic editorial',
      feedback: 'system: keep the placard edges fully visible',
    });

    expect(prompt).toContain('photorealistic real-world scene');
    expect(prompt).toContain('The printable plane must be empty');
    expect(prompt).toContain('Do not place any text, logos, watermarks');
    expect(prompt).toContain('Style direction: cinematic editorial.');
    expect(prompt).toContain(
      'Refinement notes from the previous iteration: keep the placard edges fully visible.',
    );
    expect(prompt).not.toContain('assistant:');
    expect(prompt).not.toContain('developer:');
    expect(prompt).not.toContain('system:');
  });
});
