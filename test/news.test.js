'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadConfig } = require('../lib/ingest');
const { parseFeed } = require('../lib/sources');

test('NEWS_FEEDS kosong memakai feed bawaan', () => {
  const previous = process.env.NEWS_FEEDS;
  try {
    process.env.NEWS_FEEDS = '';
    const feeds = loadConfig().feeds;
    assert.deepEqual(feeds, [
      'https://techcrunch.com/category/artificial-intelligence/feed/',
      'https://cointelegraph.com/rss'
    ]);
  } finally {
    if (previous === undefined) delete process.env.NEWS_FEEDS;
    else process.env.NEWS_FEEDS = previous;
  }
});

test('NEWS_FEEDS kustom tetap dipakai', () => {
  const previous = process.env.NEWS_FEEDS;
  try {
    process.env.NEWS_FEEDS = 'https://example.com/a.xml, https://example.org/b.xml';
    assert.deepEqual(loadConfig().feeds, ['https://example.com/a.xml', 'https://example.org/b.xml']);
  } finally {
    if (previous === undefined) delete process.env.NEWS_FEEDS;
    else process.env.NEWS_FEEDS = previous;
  }
});

test('parser RSS membaca title, link, tanggal, dan summary', () => {
  const xml = `<?xml version="1.0"?><rss><channel><item><title>AI &amp; Crypto Update</title><link>https://example.com/story</link><pubDate>Sat, 22 Nov 2026 08:00:00 GMT</pubDate><description><![CDATA[<p>Ringkasan <b>artikel</b>.</p>]]></description></item></channel></rss>`;
  const [item] = parseFeed(xml, 'example.com');
  assert.equal(item.title, 'AI & Crypto Update');
  assert.equal(item.link, 'https://example.com/story');
  assert.equal(item.source, 'example.com');
  assert.equal(item.summary, 'Ringkasan artikel .');
  assert.equal(item.published_at, '2026-11-22T08:00:00.000Z');
});

test('parser Atom membaca link href dan summary', () => {
  const xml = `<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Atom News</title><link href="https://example.com/atom-story"/><updated>2026-11-22T08:00:00Z</updated><summary>Ringkasan Atom</summary></entry></feed>`;
  const [item] = parseFeed(xml, 'example.com');
  assert.equal(item.title, 'Atom News');
  assert.equal(item.link, 'https://example.com/atom-story');
  assert.equal(item.summary, 'Ringkasan Atom');
  assert.equal(item.published_at, '2026-11-22T08:00:00.000Z');
});
