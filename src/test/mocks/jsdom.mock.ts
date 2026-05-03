import {
  DOMParser,
  XMLSerializer as XmldomXmlSerializer,
} from '@xmldom/xmldom';

type XmlNode = {
  childNodes?: ArrayLike<XmlNode>;
  firstChild?: XmlNode | null;
  nextSibling?: XmlNode | null;
  nodeType?: number;
  nodeName?: string;
  parentNode?: XmlNode | null;
  removeAttribute?: (name: string) => void;
  getAttribute?: (name: string) => string | null;
  setAttribute?: (name: string, value: string) => void;
  removeChild?: (child: XmlNode) => void;
  tagName?: string;
};

type XmlElement = XmlNode & {
  querySelectorAll?: (selector: string) => XmlElement[];
  remove?: () => void;
};

type XmlDocument = {
  documentElement: XmlElement | null;
  querySelectorAll?: (selector: string) => XmlElement[];
};

function collectElements(
  node: XmlNode | null | undefined,
  selector: string,
  includeSelf: boolean,
  results: XmlElement[] = [],
): XmlElement[] {
  if (!node) {
    return results;
  }

  const normalizedSelector = selector.toLowerCase();
  const shouldMatchAll = normalizedSelector === '*';
  const tagName = node.tagName?.toLowerCase();

  if (
    includeSelf &&
    node.nodeType === 1 &&
    (shouldMatchAll || tagName === normalizedSelector)
  ) {
    results.push(enhanceElement(node as XmlElement));
  }

  let child = node.firstChild ?? null;
  while (child) {
    collectElements(child, selector, true, results);
    child = child.nextSibling ?? null;
  }

  return results;
}

function enhanceElement(element: XmlElement): XmlElement {
  if (!element.querySelectorAll) {
    element.querySelectorAll = (selector: string) =>
      collectElements(element, selector, false);
  }

  if (!element.remove) {
    element.remove = () => {
      const parent = element.parentNode;
      if (parent?.removeChild) {
        parent.removeChild(element);
      }
    };
  }

  return element;
}

export class JSDOM {
  public readonly window: {
    document: XmlDocument;
    XMLSerializer: typeof XmldomXmlSerializer;
  };

  constructor(markup = '') {
    if (!markup.trim()) {
      this.window = {
        document: {
          documentElement: null,
          querySelectorAll: () => [],
        },
        XMLSerializer: XmldomXmlSerializer,
      };
      return;
    }

    const document = new DOMParser().parseFromString(
      markup,
      'image/svg+xml',
    ) as unknown as XmlDocument;
    const root = document.documentElement
      ? enhanceElement(document.documentElement as unknown as XmlElement)
      : null;
    document.querySelectorAll = (selector: string) =>
      collectElements(root, selector, true);

    this.window = {
      document,
      XMLSerializer: XmldomXmlSerializer,
    };
  }
}
