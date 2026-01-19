// scripts/verify-kb-chunks.js
// Verifies that all KB chunks are valid and under size limits

const fs = require('fs');
const path = require('path');

const KB_DIR = 'src/knowledge-base';
const MAX_CHUNK_SIZE_KB = 240;

console.log('Verifying Knowledge Base Chunks...\n');

// Check if KB directory exists
if (!fs.existsSync(KB_DIR)) {
  console.error('❌ Error: knowledge-base/ directory not found');
  console.error('   Run: node scripts/prepare-kb-for-forge.js');
  process.exit(1);
}

// Load metadata
const metadataPath = path.join(KB_DIR, 'metadata', 'metadata.json');
if (!fs.existsSync(metadataPath)) {
  console.error('❌ Error: metadata.json not found');
  process.exit(1);
}

const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
console.log('✅ Metadata loaded');
console.log(`   Total articles: ${metadata.totalArticles}`);
console.log(`   Expected chunks: ${metadata.chunks}`);
console.log(`   Dimension: ${metadata.dimension}\n`);

// Verify all chunks
const embeddingsDir = path.join(KB_DIR, 'embeddings');
const issues = [];
const warnings = [];
let totalArticles = 0;
let maxChunkSize = 0;
let totalSize = 0;

for (let i = 0; i < metadata.chunks; i++) {
  const chunkPath = path.join(embeddingsDir, `chunk_${i}.json`);
  
  // Check if file exists
  if (!fs.existsSync(chunkPath)) {
    issues.push(`Missing chunk_${i}.json`);
    continue;
  }
  
  // Check file size
  const stats = fs.statSync(chunkPath);
  const sizeKB = stats.size / 1024;
  totalSize += sizeKB;
  maxChunkSize = Math.max(maxChunkSize, sizeKB);
  
  // Validate chunk content
  try {
    const chunk = JSON.parse(fs.readFileSync(chunkPath, 'utf8'));
    
    if (!chunk.articles || !Array.isArray(chunk.articles)) {
      issues.push(`Chunk ${i}: Invalid structure (missing articles array)`);
      continue;
    }
    
    totalArticles += chunk.articles.length;
    
    // Validate first article structure
    if (chunk.articles.length > 0) {
      const article = chunk.articles[0];
      if (!article.embedding || !article.metadata) {
        issues.push(`Chunk ${i}: Article missing embedding or metadata`);
      }
      
      if (!Array.isArray(article.embedding)) {
        issues.push(`Chunk ${i}: Embedding is not an array`);
      } else if (article.embedding.length !== metadata.dimension) {
        issues.push(`Chunk ${i}: Embedding dimension mismatch (expected ${metadata.dimension}, got ${article.embedding.length})`);
      }
    }
    
    // Check size limit
    if (sizeKB > MAX_CHUNK_SIZE_KB) {
      issues.push(`Chunk ${i}: Exceeds size limit (${sizeKB.toFixed(2)} KB > ${MAX_CHUNK_SIZE_KB} KB)`);
    } else if (sizeKB > MAX_CHUNK_SIZE_KB * 0.9) {
      warnings.push(`Chunk ${i}: Close to size limit (${sizeKB.toFixed(2)} KB)`);
    }
    
    const status = sizeKB > MAX_CHUNK_SIZE_KB ? '❌' : '✅';
    console.log(`${status} Chunk ${i}: ${sizeKB.toFixed(2)} KB (${chunk.articles.length} articles)`);
    
  } catch (error) {
    issues.push(`Chunk ${i}: Failed to parse JSON - ${error.message}`);
  }
}

// Summary
console.log('\n' + '='.repeat(60));
console.log('VERIFICATION SUMMARY');
console.log('='.repeat(60));

console.log(`\nChunks found: ${metadata.chunks}`);
console.log(`Articles found: ${totalArticles}`);
console.log(`Total KB size: ${totalSize.toFixed(2)} KB (${(totalSize / 1024).toFixed(2)} MB)`);
console.log(`Largest chunk: ${maxChunkSize.toFixed(2)} KB`);
console.log(`Average chunk: ${(totalSize / metadata.chunks).toFixed(2)} KB`);

// Check article count
if (totalArticles !== metadata.totalArticles) {
  issues.push(`Article count mismatch: Expected ${metadata.totalArticles}, found ${totalArticles}`);
}

// Report issues
if (issues.length > 0) {
  console.log('\n❌ ISSUES FOUND:');
  issues.forEach(issue => console.log(`   - ${issue}`));
}

// Report warnings
if (warnings.length > 0) {
  console.log('\n⚠️  WARNINGS:');
  warnings.forEach(warning => console.log(`   - ${warning}`));
}

// Final status
console.log('\n' + '='.repeat(60));
if (issues.length === 0) {
  console.log('✅ VERIFICATION PASSED');
  console.log('   All chunks are valid and ready for deployment');
  console.log('\nNext steps:');
  console.log('   1. Copy to src: npm run copy-kb');
  console.log('   2. Deploy: forge deploy');
} else {
  console.log('❌ VERIFICATION FAILED');
  console.log('   Fix the issues above and re-run prepare-kb-for-forge.js');
  process.exit(1);
}

// Forge compatibility check
console.log('\n' + '='.repeat(60));
console.log('FORGE COMPATIBILITY');
console.log('='.repeat(60));

const estimatedDeploymentSize = totalSize + 5000; // KB size + ~5MB for app code
console.log(`Estimated deployment size: ${(estimatedDeploymentSize / 1024).toFixed(2)} MB`);

if (estimatedDeploymentSize < 100 * 1024) {
  console.log('✅ Within Forge 100MB deployment limit');
} else {
  console.log('⚠️  May exceed Forge deployment limit');
}

if (maxChunkSize < MAX_CHUNK_SIZE_KB) {
  console.log('✅ All chunks within Forge 240KB storage limit');
} else {
  console.log('❌ Some chunks exceed Forge storage limit');
}

console.log('\n');