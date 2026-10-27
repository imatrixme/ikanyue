/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const fieldsByCollection = { price_versions: ['listAmount', 'saleAmount'],
    orders: ['listAmount', 'paidAmount'], payment_events: ['amount'] };
  for (const [name, fields] of Object.entries(fieldsByCollection)) {
    const collection = app.findCollectionByNameOrId(name);
    for (const name of fields) collection.fields.getByName(name).onlyInt = false;
    app.save(collection);
  }
}, () => {
  throw new Error('Money precision rollback requires explicit data review; decimal amounts must not be rounded or lost.');
});
