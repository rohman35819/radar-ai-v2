'use strict';
const { loadConfig } = require('../lib/ingest');
const { fetchNewsDetailed } = require('../lib/sources');

async function main() {
  try {
    const result = await fetchNewsDetailed(loadConfig());
    const report = {
      status: result.items.length ? 'ok' : 'empty',
      article_count: result.items.length,
      sources: result.sources
    };
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    if (!result.items.length) process.exitCode = 1;
  } catch (error) {
    const report = {
      status: 'error',
      code: error.code || 'NEWS_FEEDS_UNAVAILABLE',
      sources: Array.isArray(error.sources) ? error.sources : []
    };
    process.stderr.write(JSON.stringify(report, null, 2) + '\n');
    process.exitCode = 1;
  }
}
main();
