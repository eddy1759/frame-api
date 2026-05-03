import {
  CATEGORY_FRAME_SPECS,
  writeCategoryFrameSvgFiles,
} from './frame-svg-generator';

type CliOptions = {
  help: boolean;
  list: boolean;
  outputDir?: string;
  selectors: string[];
};

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    help: false,
    list: false,
    selectors: [],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }

    if (arg === '--list') {
      options.list = true;
      continue;
    }

    if (arg === '--category') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('Missing value for --category');
      }
      options.selectors.push(value);
      index += 1;
      continue;
    }

    if (arg.startsWith('--category=')) {
      options.selectors.push(arg.slice('--category='.length));
      continue;
    }

    if (arg === '--out-dir') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('Missing value for --out-dir');
      }
      options.outputDir = value;
      index += 1;
      continue;
    }

    if (arg.startsWith('--out-dir=')) {
      options.outputDir = arg.slice('--out-dir='.length);
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function printHelp(): void {
  console.log(`Generate category frame SVGs with explicit viewBox support.

Usage:
  npm run frames:generate-svgs
  npm run frames:generate-svgs -- --category wedding
  npm run frames:generate-svgs -- --category wedding --category sports
  npm run frames:generate-svgs -- --out-dir ./.tmp/generated-frames
  npm run frames:generate-svgs -- --list

Options:
  --category <name>   Generate only a selected category, frame slug, or file base name.
  --out-dir <path>    Write SVG files into a custom output directory.
  --list              Print the available category presets.
  --help              Show this help message.
`);
}

function printAvailablePresets(): void {
  console.log('Available category frame presets:');
  for (const spec of CATEGORY_FRAME_SPECS) {
    console.log(
      `- ${spec.categorySlug}: ${spec.fileName} (${spec.width}x${spec.height}, frame slug ${spec.slug})`,
    );
  }
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    return;
  }

  if (options.list) {
    printAvailablePresets();
    return;
  }

  const written = writeCategoryFrameSvgFiles({
    outputDir: options.outputDir,
    selectors: options.selectors,
  });

  for (const { spec, filePath } of written) {
    console.log(
      `Wrote ${filePath} (${spec.categorySlug}, ${spec.width}x${spec.height}, viewBox 0 0 ${spec.width} ${spec.height})`,
    );
  }
}

try {
  main();
} catch (error) {
  console.error(
    error instanceof Error ? error.message : 'Failed to generate frame SVGs.',
  );
  process.exit(1);
}
