class MockXMLSerializer {
  constructor(private readonly value: string) {}

  serializeToString(): string {
    return this.value;
  }
}

class MockElement {
  constructor(public readonly nodeName: string) {}

  querySelectorAll(): unknown[] {
    return [];
  }
}

export class JSDOM {
  public readonly window: {
    document: { documentElement: MockElement | null };
    XMLSerializer: new () => MockXMLSerializer;
  };

  constructor(markup = '') {
    const match = markup.match(/<\s*([a-zA-Z0-9:_-]+)/);
    const nodeName = match?.[1]?.toLowerCase() ?? '';
    const root = nodeName ? new MockElement(nodeName) : null;

    this.window = {
      document: {
        documentElement: root,
      },
      XMLSerializer: class extends MockXMLSerializer {
        constructor() {
          super(markup);
        }
      },
    };
  }
}
