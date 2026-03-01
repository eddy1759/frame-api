function stripDangerousAttributes(svg: string): string {
  let output = svg;

  output = output.replace(/\s+on[a-z0-9_-]+\s*=\s*(['"]).*?\1/gi, '');
  output = output.replace(/\s+on[a-z0-9_-]+\s*=\s*[^\s>]+/gi, '');

  output = output.replace(/\s+(href|xlink:href|src)\s*=\s*(['"]).*?\2/gi, '');
  output = output.replace(/\s+(href|xlink:href|src)\s*=\s*[^\s>]+/gi, '');

  output = output.replace(/\s+style\s*=\s*(['"])(.*?)\1/gi, (full, q, value) =>
    /url\(\s*(['"]?)(https?:\/\/|\/\/|javascript:)/i.test(String(value))
      ? ''
      : full,
  );

  return output;
}

function stripDangerousTags(svg: string): string {
  const blocked = '(script|style|foreignobject|iframe|object|embed|use)';
  let output = svg;
  output = output.replace(
    new RegExp(`<\\s*${blocked}\\b[\\s\\S]*?<\\/\\s*\\1\\s*>`, 'gi'),
    '',
  );
  output = output.replace(
    new RegExp(`<\\s*${blocked}\\b[^>]*\\/\\s*>`, 'gi'),
    '',
  );
  return output;
}

module.exports = function createDOMPurify() {
  return {
    sanitize(input: string): string {
      const strippedTags = stripDangerousTags(input);
      return stripDangerousAttributes(strippedTags);
    },
  };
};
