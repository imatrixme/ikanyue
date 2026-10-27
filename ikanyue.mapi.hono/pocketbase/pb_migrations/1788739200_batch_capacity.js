/// <reference path="../pb_data/types.d.ts" />

// Course publication and settlement commit one atomic batch per command; the API requires >= 500 requests.
migrate((app) => {
  const settings = app.settings();
  settings.batch.enabled = true;
  settings.batch.maxRequests = Math.max(settings.batch.maxRequests || 0, 1000);
  settings.batch.timeout = Math.max(settings.batch.timeout || 0, 10);
  if (settings.batch.maxBodySize > 0) settings.batch.maxBodySize = Math.max(settings.batch.maxBodySize, 8388608);
  app.save(settings);
}, () => {
  // Lowering capacity could strand large publications; leave settings unchanged on rollback.
});
