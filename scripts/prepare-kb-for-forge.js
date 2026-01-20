// scripts/prepare-kb-for-forge.js
// Builds embeddings for the customer knowledge base and prepares Forge-ready assets.
// This script processes raw Excel files directly.

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const https = require('https');

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const RAW_KB_FILE = 'knowledge_base.xlsx';
const PROCESSED_KB_FILE = 'knowledge_base_processed.xlsx';
const OUTPUT_DIR = 'src/knowledge-base';
const EMBED_MODEL = 'text-embedding-3-large';
const EMBEDDING_DIMENSION = 3072;
const MAX_CHUNK_SIZE_BYTES = 230 * 1024; // 230 KB leaves headroom for the 240 KB Forge limit.
const MIN_ARTICLES_PER_CHUNK = 1;

// Scope pattern definitions simplified to a single placeholder bucket.
const SCOPE_PATTERNS = [
  { regex: /.+/i, scope: 'Generic' },
];

// Normalise text to ASCII and optionally keep new lines for readability.
function sanitize(value, options = {}) {
  const { preserveNewlines = false } = options;
  if (value === null || value === undefined) {
    return '';
  }

  let text = String(value);
  if (typeof text.normalize === 'function') {
    text = text.normalize('NFKD');
  }
  text = text.replace(/[^\x00-\x7F]/g, '');

  if (preserveNewlines) {
    text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    text = text.replace(/[ \t]+/g, ' ');
    text = text.replace(/\n{3,}/g, '\n\n');
    return text.trim();
  }

  return text.replace(/\s+/g, ' ').trim();
}

// Infer scope and topic from the article title.
function extractScopeAndTopic(rawTitle) {
  const title = (rawTitle || '').trim();
  if (!title) {
    return { scope: 'General', topic: '' };
  }

  const trimmedTitle = title.trim();
  const loweredTitle = trimmedTitle.toLowerCase();

  if (trimmedTitle.includes(' - ')) {
    const [leftPart, rightPart] = trimmedTitle.split(' - ', 2);
    const left = leftPart.trim();
    const right = (rightPart || '').trim();
    const leftLower = left.toLowerCase();

    for (const { regex, scope } of SCOPE_PATTERNS) {
      if (regex.test(leftLower)) {
        if (scope === 'Enterprise') {
          if (/\biot\b/i.test(loweredTitle) && /enterprise/i.test(left)) {
            return { scope: 'Enterprise IoT', topic: right };
          }
          if (/\bprepaid\b/i.test(leftLower) && /\biot\b/i.test(loweredTitle)) {
            return { scope: 'Prepaid IoT', topic: right };
          }
        }
        return { scope, topic: right };
      }
    }

    return { scope: left || 'General', topic: right };
  }

  for (const { regex, scope } of SCOPE_PATTERNS) {
    if (regex.test(loweredTitle)) {
      const topic = trimmedTitle.replace(regex, '').replace(/[-:()]/g, ' ').trim() || trimmedTitle;
      return { scope, topic };
    }
  }

  return { scope: 'General', topic: trimmedTitle };
}

// Build the search text for embeddings with the full article content.
function buildSearchText(article) {
  const pieces = [];
  if (article.scope && article.scope !== 'General') {
    pieces.push(`Category: ${article.scope}`);
  }
  if (article.topic) {
    pieces.push(`Topic: ${article.topic}`);
  }
  if (article.title) {
    pieces.push(`Title: ${article.title}`);
  }
  if (article.content) {
    pieces.push(`Content: ${sanitize(article.content)}`);
  }
  if (article.link) {
    pieces.push(`Link: ${article.link}`);
  }
  return pieces.join(' | ');
}

// Load and process the Excel data, falling back to the processed file if needed.
function loadArticles() {
  const rawFileExists = fs.existsSync(RAW_KB_FILE);
  const processedFileExists = fs.existsSync(PROCESSED_KB_FILE);

  if (!rawFileExists && !processedFileExists) {
    console.error('Error: Neither knowledge_base.xlsx nor knowledge_base_processed.xlsx was found.');
    console.error('Place the raw knowledge_base.xlsx in the project root before running this script.');
    process.exit(1);
  }

  const sourceFile = rawFileExists ? RAW_KB_FILE : PROCESSED_KB_FILE;
  console.log(`Reading knowledge base from ${sourceFile}...`);

  const workbook = XLSX.readFile(sourceFile, { cellDates: false });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet);

  if (!rows.length) {
    console.error('Error: The knowledge base file is empty.');
    process.exit(1);
  }

  const articles = rows.map((row) => {
    const rawTitle = row.title || row.Title || '';
    const rawContent = row.content || row.Content || '';
    const rawLink = row.link || row.Link || '';
    const rawScope = row.scope || row.Scope || '';
    const rawTopic = row.topic || row.Topic || '';

    const { scope: inferredScope, topic: inferredTopic } = extractScopeAndTopic(rawTitle);

    const title = sanitize(rawTitle);
    const scope = sanitize(rawScope) || inferredScope;
    const topic = sanitize(rawTopic) || inferredTopic;
    const content = sanitize(rawContent, { preserveNewlines: true });
    const link = sanitize(rawLink);

    const article = {
      title,
      scope: scope || 'General',
      topic,
      content,
      link,
    };

    article.search_text = buildSearchText(article);
    return article;
  });

  try {
    writeProcessedWorkbook(articles);
  } catch (error) {
    console.warn(`Warning: Unable to refresh ${PROCESSED_KB_FILE}: ${error.message}`);
  }

  return articles;
}


function writeProcessedWorkbook(articles) {
  const sheetData = articles.map((article) => ({
    title: article.title,
    scope: article.scope,
    topic: article.topic,
    content: article.content,
    link: article.link,
    search_text: article.search_text,
  }));

  const worksheet = XLSX.utils.json_to_sheet(sheetData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'knowledge_base');
  XLSX.writeFile(workbook, PROCESSED_KB_FILE);
  console.log(`Refreshed ${PROCESSED_KB_FILE} with ${articles.length}.`);
}

// Estimate an optimal chunk size based on the serialized size of sample articles.
function calculateOptimalChunkSize(articles) {
  if (!articles.length) {
    return MIN_ARTICLES_PER_CHUNK;
  }

  const sampleSize = Math.min(10, articles.length);
  let totalSize = 0;

  for (let i = 0; i < sampleSize; i++) {
    const article = articles[i];
    const articleWithEmbedding = {
      embedding: new Array(EMBEDDING_DIMENSION).fill(0),
      metadata: {
        title: article.title || '',
        content: article.content || '',
        link: article.link || '',
        scope: article.scope || '',
        topic: article.topic || '',
      },
    };
    totalSize += JSON.stringify(articleWithEmbedding).length;
  }

  const averageSize = totalSize / sampleSize;
  if (!averageSize) {
    return MIN_ARTICLES_PER_CHUNK;
  }

  const rawArticlesPerChunk = Math.floor((MAX_CHUNK_SIZE_BYTES / averageSize) * 0.9);
  const articlesPerChunk = Math.max(MIN_ARTICLES_PER_CHUNK, rawArticlesPerChunk);

  console.log('\nChunk size planning:');
  console.log(`  Sample size: ${sampleSize} articles`);
  console.log(`  Average serialized size: ${(averageSize / 1024).toFixed(2)} KB`);
  console.log(`  Target articles per chunk: ${articlesPerChunk}`);

  return articlesPerChunk;
}

// Main script runner.
async function prepareKnowledgeBase() {
  console.log('============================================================');
  console.log('Preparing knowledge base for Forge deployment');
  console.log('============================================================');

  if (!OPENAI_API_KEY) {
    console.error('Error: OPENAI_API_KEY environment variable not set.');
    console.error('Set it with: export OPENAI_API_KEY=your-key-here');
    process.exit(1);
  }

  const articles = loadArticles();
  console.log(`\nProcessed articles: ${articles.length}`);

  // Ensure required output directories exist.
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  if (!fs.existsSync(path.join(OUTPUT_DIR, 'embeddings'))) {
    fs.mkdirSync(path.join(OUTPUT_DIR, 'embeddings'), { recursive: true });
  }
  if (!fs.existsSync(path.join(OUTPUT_DIR, 'metadata'))) {
    fs.mkdirSync(path.join(OUTPUT_DIR, 'metadata'), { recursive: true });
  }

  const chunkSize = calculateOptimalChunkSize(articles);
  const chunks = [];
  let chunkIndex = 0;
  let articleIndex = 0;

  while (articleIndex < articles.length) {
    const chunkArticles = [];
    let chunkBytes = 0;

    while (articleIndex < articles.length && chunkArticles.length < chunkSize) {
      const article = articles[articleIndex];
      const articleLabel = article.title ? article.title.substring(0, 50) : `Article ${articleIndex + 1}`;
      process.stdout.write(`Embedding [${articleIndex + 1}/${articles.length}] ${articleLabel}...\r`);

      try {
        const embedding = await createEmbedding(article.search_text);

        const articleWithEmbedding = {
          embedding: Array.from(embedding),
          metadata: {
            title: article.title || '',
            content: article.content || '',
            link: article.link || '',
            scope: article.scope || 'General',
            topic: article.topic || '',
          },
        };

        const serializedSize = Buffer.byteLength(JSON.stringify(articleWithEmbedding));
        if (chunkBytes + serializedSize > MAX_CHUNK_SIZE_BYTES && chunkArticles.length > 0) {
          break;
        }

        chunkArticles.push(articleWithEmbedding);
        chunkBytes += serializedSize;
        articleIndex += 1;
      } catch (error) {
        console.error(`\nFailed to embed article "${article.title}": ${error.message}`);
        console.error('Retrying after 5 seconds...');
        await sleep(5000);
      }
    }

    process.stdout.write('\n');

    if (!chunkArticles.length) {
      console.error('Unable to add any article to the current chunk without exceeding size limits.');
      console.error('Consider lowering MAX_CHUNK_SIZE_BYTES.');
      process.exit(1);
    }

    const chunkPath = path.join(OUTPUT_DIR, 'embeddings', `chunk_${chunkIndex}.json`);
    fs.writeFileSync(chunkPath, JSON.stringify({ articles: chunkArticles }));
    const chunkSizeKB = (chunkBytes / 1024).toFixed(2);
    console.log(`Saved chunk_${chunkIndex}.json (${chunkSizeKB} KB, ${chunkArticles.length} articles).`);

    chunks.push({
      index: chunkIndex,
      file: `chunk_${chunkIndex}.json`,
      articles: chunkArticles.length,
      sizeKB: Number(chunkSizeKB),
    });

    chunkIndex += 1;
  }

  const scopeCounts = articles.reduce((acc, article) => {
    const scope = article.scope || 'General';
    acc[scope] = (acc[scope] || 0) + 1;
    return acc;
  }, {});

  const metadata = {
    totalArticles: articles.length,
    chunks: chunks.length,
    dimension: EMBEDDING_DIMENSION,
    model: EMBED_MODEL,
    embeddedField: 'search_text',
    availableFields: ['title', 'content', 'link', 'scope', 'topic', 'search_text'],
    lastUpdated: new Date().toISOString(),
    chunkInfo: chunks,
    scopeCounts,
  };

  const metadataFile = path.join(OUTPUT_DIR, 'metadata', 'metadata.json');
  fs.writeFileSync(metadataFile, JSON.stringify(metadata, null, 2));
  console.log(`\nMetadata written to ${metadataFile}.`);

  const manifestFile = path.join(OUTPUT_DIR, 'bundledAssets.js');
  const manifestLines = [
    '// This file is auto-generated by scripts/prepare-kb-for-forge.js',
    '// It lists every knowledge base asset so Forge keeps them in the deployment bundle.',
    "import { fileURLToPath } from 'url';",
    '',
    "export const metadataUrl = new URL('./metadata/metadata.json', import.meta.url);",
    '',
    'export const chunkUrls = Object.freeze([',
    ...chunks.map((chunk) => `  new URL('./embeddings/${chunk.file}', import.meta.url),`),
    ']);',
    '',
    '// Helper to turn a file URL into an OS-specific file system path.',
    'export function urlToPath(url) {',
    '  return fileURLToPath(url);',
    '}',
    '',
  ];
  fs.writeFileSync(manifestFile, `${manifestLines.join('\n')}\n`);
  console.log(`Bundled asset manifest written to ${manifestFile}.`);

  console.log('\n============================================================');
  console.log('Knowledge base preparation complete.');
  console.log('============================================================');
  console.log(`Chunks created: ${chunks.length}`);
  console.log(`Articles processed: ${articles.length}`);
  console.log('\nNext steps:');
  console.log('  1. Verify chunk sizes with: node scripts/verify-kb-chunks.js');
  console.log('  2. Deploy with: forge deploy');
}

// Create an embedding using the OpenAI API.
async function createEmbedding(text) {
  const inputText = sanitize(text || '');
  const truncated = inputText.length > 8000 ? inputText.substring(0, 8000) : inputText;

  const payload = JSON.stringify({
    model: EMBED_MODEL,
    input: truncated,
  });

  const options = {
    hostname: 'api.openai.com',
    port: 443,
    path: '/v1/embeddings',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      'Content-Length': Buffer.byteLength(payload),
    },
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error(`OpenAI API error: ${res.statusCode} ${data}`));
          return;
        }

        try {
          const parsed = JSON.parse(data);
          const embedding = parsed.data[0].embedding;
          const magnitude = Math.sqrt(embedding.reduce((sum, value) => sum + value * value, 0));
          const normalized = embedding.map((value) => value / magnitude);
          resolve(new Float32Array(normalized));
        } catch (error) {
          reject(new Error(`Failed to parse embedding response: ${error.message}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(new Error(`Embedding request failed: ${error.message}`));
    });

    req.write(payload);
    req.end();
  });
}

// Simple sleep helper.
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

prepareKnowledgeBase().catch((error) => {
  console.error('\nFatal error while preparing the knowledge base.');
  console.error(error);
  process.exit(1);
});


