'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadConfig } = require('../lib/ingest');
const { parseFeed, fetchNewsDetailed } = require('../lib/sources');

const defaults = [
  'https://techcrunch.com/category/artificial-intelligence/feed/',
  'https://cointelegraph.com/rss'
];
const rss = (title, link) => '<rss><channel><item><title>' + title + '</title><link>' + link + '</link><pubDate>Sun, 22 Nov 2026 08:00:00 GMT</pubDate><description><![CDATA[<p>News summary</p>]]></description></item></channel></rss>';
async function withFetch(mock, fn) {
  const previous = global.fetch;
  global.fetch = mock;
  try { return await fn(); } finally { global.fetch = previous; }
}

test('NEWS_FEEDS kosong atau whitespace memakai feed bawaan', () => {
  const previous = process.env.NEWS_FEEDS;
  try {
    for (const value of ['', '   ', ', ; \n']) {
      process.env.NEWS_FEEDS = value;
      assert.deepEqual(loadConfig().feeds, defaults);
    }
  } finally {
    if (previous === undefined) delete process.env.NEWS_FEEDS;
    else process.env.NEWS_FEEDS = previous;
  }
});

test('NEWS_FEEDS kustom mendukung koma, titik koma, dan baris baru', () => {
  const previous = process.env.NEWS_FEEDS;
  try {
    process.env.NEWS_FEEDS = 'https://example.com/a.xml; https://example.org/b.xml\nhttps://example.net/c.xml';
    assert.deepEqual(loadConfig().feeds, [
      'https://example.com/a.xml',
      'https://example.org/b.xml',
      'https://example.net/c.xml'
    ]);
  } finally {
    if (previous === undefined) delete process.env.NEWS_FEEDS;
    else process.env.NEWS_FEEDS = previous;
  }
});

test('parser RSS membaca title, link, tanggal, CDATA, dan numeric XML entities', () => {
  const xml = '<?xml version="1.0"?><rss><channel><item><title>AI &amp; Crypto &#8211; Update</title><link>https://example.com/story</link><pubDate>Sun, 22 Nov 2026 08:00:00 GMT</pubDate><description><![CDATA[<p>Ringkasan &#8217;artikel&#8217; &amp; data.</p>]]></description></item></channel></rss>';
  const [item] = parseFeed(xml, 'example.com');
  assert.equal(item.title, 'AI & Crypto – Update');
  assert.equal(item.link, 'https://example.com/story');
  assert.equal(item.source, 'example.com');
  assert.equal(item.summary, 'Ringkasan ’artikel’ & data.');
  assert.equal(item.published_at, '2026-11-22T08:00:00.000Z');
});

test('parser Atom memilih alternate link dan membaca summary', () => {
  const xml = '<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Atom News</title><link rel="self" href="https://example.com/feed"/><link rel="alternate" href="https://example.com/atom-story"/><updated>2026-11-22T08:00:00Z</updated><summary>Ringkasan Atom</summary></entry></feed>';
  const [item] = parseFeed(xml, 'example.com');
  assert.equal(item.title, 'Atom News');
  assert.equal(item.link, 'https://example.com/atom-story');
  assert.equal(item.summary, 'Ringkasan Atom');
  assert.equal(item.published_at, '2026-11-22T08:00:00.000Z');
});

test('fetchNewsDetailed mempertahankan feed sehat saat feed lain gagal', async () => {
  const result = await withFetch(async (url, options) => {
    assert.match(options.headers.accept, /application\/rss\+xml/);
    if (String(url).includes('bad.example')) return new Response('rate limited', { status: 503 });
    return new Response(rss('Healthy Story', 'https://good.example/story'), {
      status: 200, headers: { 'content-type': 'application/rss+xml' }
    });
  }, () => fetchNewsDetailed({ feeds: ['https://bad.example/rss?token=secret', 'https://good.example/feed'] }));
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].title, 'Healthy Story');
  assert.deepEqual(result.sources, [
    { host: 'bad.example', ok: false, error: 'HTTP_503' },
    { host: 'good.example', ok: true, count: 1 }
  ]);
  assert.ok(!JSON.stringify(result.sources).includes('secret'));
});

test('fetchNewsDetailed memberi kode aman jika semua feed gagal', async () => {
  await withFetch(async () => new Response('blocked', { status: 403 }), async () => {
    await assert.rejects(
      () => fetchNewsDetailed({ feeds: ['https://bad.example/rss?token=secret'] }),
      (error) => {
        assert.equal(error.code, 'NEWS_FEEDS_UNAVAILABLE');
        assert.ok(!error.message.includes('secret'));
        assert.deepEqual(error.sources, [{ host: 'bad.example', ok: false, error: 'HTTP_403' }]);
        return true;
      }
    );
  });
});

test('fetchNewsDetailed menolak respons HTML yang bukan RSS/Atom', async () => {
  await withFetch(async () => new Response('<html><title>Access denied</title></html>', {
    status: 200, headers: { 'content-type': 'text/html' }
  }), async () => {
    await assert.rejects(
      () => fetchNewsDetailed({ feeds: ['https://blocked.example/rss'] }),
      (error) => {
        assert.equal(error.code, 'NEWS_FEEDS_UNAVAILABLE');
        assert.deepEqual(error.sources, [{ host: 'blocked.example', ok: false, error: 'INVALID_FEED_BODY' }]);
        return true;
      }
    );
  });
});

test('fetchNewsDetailed menghapus artikel duplikat antar-feed', async () => {
  const result = await withFetch(async () => new Response(rss('Duplicate Story', 'https://news.example/story'), {
    status: 200, headers: { 'content-type': 'application/rss+xml' }
  }), () => fetchNewsDetailed({ feeds: ['https://one.example/rss', 'https://two.example/rss'] }));
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].link, 'https://news.example/story');
  assert.equal(result.sources.length, 2);
});
