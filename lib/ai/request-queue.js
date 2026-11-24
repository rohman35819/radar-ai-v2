'use strict';

// One process-wide queue shared by every AI provider adapter.
// Two requests may call providers concurrently; at most twelve wait in FIFO order.
const MAX_CONCURRENT_REQUESTS = 2;
const MAX_PENDING_REQUESTS = 12;
const queue = [];
let active = 0;
let completedTotal = 0;
let rejectedTotal = 0;

function execute(task) {
  active++;
  return Promise.resolve()
    .then(task)
    .finally(() => {
      active--;
      completedTotal++;
      drain();
    });
}

function drain() {
  while (active < MAX_CONCURRENT_REQUESTS && queue.length) {
    const item = queue.shift();
    execute(item.task).then(item.resolve, item.reject);
  }
}

function runWithAIRequestSlot(task) {
  if (typeof task !== 'function') return Promise.reject(new TypeError('AI queue task harus berupa function'));
  if (active < MAX_CONCURRENT_REQUESTS && queue.length === 0) return execute(task);
  if (queue.length >= MAX_PENDING_REQUESTS) {
    rejectedTotal++;
    const error = new Error('AI_QUEUE_FULL: antrean penuh; tunggu pekerjaan sebelumnya selesai sebelum mengirim permintaan baru.');
    error.code = 'AI_QUEUE_FULL';
    error.statusCode = 503;
    return Promise.reject(error);
  }
  return new Promise((resolve, reject) => {
    queue.push({ task, resolve, reject, enqueuedAt: Date.now() });
    drain();
  });
}

function getAIRequestQueueSnapshot(now = Date.now()) {
  const oldest = queue.length ? Math.max(0, now - queue[0].enqueuedAt) : 0;
  return {
    policy: 'FIFO',
    status: queue.length >= MAX_PENDING_REQUESTS && active >= MAX_CONCURRENT_REQUESTS ? 'FULL' : (queue.length ? 'QUEUED' : (active ? 'RUNNING' : 'IDLE')),
    active,
    pending: queue.length,
    total_in_system: active + queue.length,
    max_concurrent: MAX_CONCURRENT_REQUESTS,
    max_pending: MAX_PENDING_REQUESTS,
    max_total: MAX_CONCURRENT_REQUESTS + MAX_PENDING_REQUESTS,
    oldest_wait_ms: oldest,
    completed_since_restart: completedTotal,
    rejected_since_restart: rejectedTotal
  };
}

module.exports = {
  MAX_CONCURRENT_REQUESTS,
  MAX_PENDING_REQUESTS,
  runWithAIRequestSlot,
  getAIRequestQueueSnapshot
};
