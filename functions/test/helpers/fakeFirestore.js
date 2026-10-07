// In-memory Firestore stand-in for the functions' manual tests - one that
// ENFORCES the project's real composite indexes (firestore.indexes.json).
//
// Why not the Firestore emulator: the emulator accepts every query whether
// or not a composite index exists, so it would not have caught the missing
// apiUsage index that broke the cost-control cache in production on
// 2026-10-07. This fake applies Firestore's planning rule instead:
//
//   - a query with only equality filters, or touching a single field,
//     runs on automatic single-field indexes;
//   - anything else (equalities + an orderBy / range on another field)
//     needs a declared composite index whose fields are exactly the
//     equality fields (any order) followed by the order/range field, with
//     a matching direction.
//
// A query without a matching index throws FAILED_PRECONDITION, like
// Firestore. `failNextQueries(n)` simulates an outage.

const fs = require("fs");
const path = require("path");

function loadIndexes(indexes) {
  if (indexes) return indexes;
  const file = path.join(__dirname, "..", "..", "..", "firestore.indexes.json");
  return JSON.parse(fs.readFileSync(file, "utf8")).indexes;
}

function requiredIndex(collection, filters, order) {
  const eqFields = [...new Set(filters.filter((f) => f.op === "==").map((f) => f.field))];
  const rangeFields = [...new Set(filters.filter((f) => f.op !== "==").map((f) => f.field))];
  if (rangeFields.length > 1) throw new Error("fakeFirestore: multiple range fields not supported");
  const tailField = order ? order.field : rangeFields[0] || null;
  if (order && rangeFields[0] && rangeFields[0] !== order.field) throw new Error("fakeFirestore: range field must match orderBy");
  const allFields = new Set([...eqFields, ...(tailField ? [tailField] : [])]);
  if (!tailField || allFields.size <= 1) return null; // single-field / equality-only: automatic indexes
  const direction = order && order.dir === "desc" ? "DESCENDING" : "ASCENDING";
  return { collection, eqFields: eqFields.filter((f) => f !== tailField), tailField, direction };
}

function indexMatches(index, need) {
  if (index.collectionGroup !== need.collection) return false;
  const fields = index.fields;
  if (fields.length !== need.eqFields.length + 1) return false;
  const tail = fields[fields.length - 1];
  if (tail.fieldPath !== need.tailField || tail.order !== need.direction) return false;
  const head = new Set(fields.slice(0, -1).map((f) => f.fieldPath));
  return need.eqFields.every((f) => head.has(f)) && head.size === need.eqFields.length;
}

function createFakeFirestore({ indexes } = {}) {
  const declared = loadIndexes(indexes);
  const collections = {};
  let idCounter = 0;
  let failuresLeft = 0;
  let failAfter = null; // fail every query after this many have run
  let queryCount = 0;
  const queryLog = [];

  const docsFor = (name) => collections[name] || (collections[name] = []);

  class FakeQuery {
    constructor(collection, filters = [], order = null, limitN = null) {
      Object.assign(this, { collection, filters, order, limitN });
    }
    where(field, op, value) {
      return new FakeQuery(this.collection, [...this.filters, { field, op, value }], this.order, this.limitN);
    }
    orderBy(field, dir = "asc") {
      return new FakeQuery(this.collection, this.filters, { field, dir }, this.limitN);
    }
    limit(n) {
      return new FakeQuery(this.collection, this.filters, this.order, n);
    }
    async get() {
      queryLog.push({ collection: this.collection, filters: this.filters.map((f) => `${f.field}${f.op}`), order: this.order });
      queryCount++;
      if (failAfter !== null && queryCount > failAfter) {
        throw new Error("UNAVAILABLE: simulated Firestore outage");
      }
      if (failuresLeft > 0) {
        failuresLeft--;
        throw new Error("UNAVAILABLE: simulated Firestore outage");
      }
      const need = requiredIndex(this.collection, this.filters, this.order);
      if (need && !declared.some((idx) => indexMatches(idx, need))) {
        throw new Error(
          `FAILED_PRECONDITION: The query requires an index (${this.collection}: ${[...need.eqFields, need.tailField].join(", ")} ${need.direction})`
        );
      }
      let rows = docsFor(this.collection).filter((d) =>
        this.filters.every((f) => {
          const v = d.data[f.field];
          if (f.op === "==") return v === f.value;
          if (f.op === ">=") return v >= f.value;
          throw new Error(`fakeFirestore: operator ${f.op} not supported`);
        })
      );
      if (this.order) {
        const { field, dir } = this.order;
        rows = [...rows].sort((a, b) => (dir === "desc" ? b.data[field] - a.data[field] : a.data[field] - b.data[field]));
      }
      if (this.limitN != null) rows = rows.slice(0, this.limitN);
      return { empty: rows.length === 0, docs: rows.map((d) => ({ id: d.id, data: () => d.data })) };
    }
  }

  const firestore = () => ({
    collection(name) {
      const q = new FakeQuery(name);
      return {
        where: (...a) => q.where(...a),
        orderBy: (...a) => q.orderBy(...a),
        async add(data) {
          const id = `doc${idCounter++}`;
          docsFor(name).push({ id, data: { ...data } });
          return { id };
        },
        doc(id) {
          return {
            async get() {
              const found = docsFor(name).find((d) => d.id === id);
              return { exists: !!found, data: () => found && found.data };
            },
            async update(data) {
              const found = docsFor(name).find((d) => d.id === id);
              if (!found) throw new Error(`NOT_FOUND: ${name}/${id}`);
              Object.assign(found.data, data);
            },
            async set(data, opts) {
              const found = docsFor(name).find((d) => d.id === id);
              if (found && opts && opts.merge) Object.assign(found.data, data);
              else if (found) found.data = { ...data };
              else docsFor(name).push({ id, data: { ...data } });
            }
          };
        }
      };
    }
  });
  firestore.FieldValue = { serverTimestamp: () => "SERVER_TIMESTAMP" };

  return {
    admin: { firestore },
    rows: (name) => docsFor(name).map((d) => ({ id: d.id, ...d.data })),
    seed: (name, data) => docsFor(name).push({ id: `seed${idCounter++}`, data: { ...data } }),
    failNextQueries: (n) => {
      failuresLeft = n;
    },
    failQueriesAfter: (n) => {
      queryCount = 0;
      failAfter = n;
    },
    queryLog
  };
}

// Load `modulePath` with `firebase-admin` replaced by the fake (fresh
// module instances each call, so tests don't share state).
function loadWithFake(fake, modulePath, extraStubs = {}) {
  const functionsDir = path.join(__dirname, "..", "..");
  const adminPath = require.resolve("firebase-admin", { paths: [functionsDir] });
  const stubs = { [adminPath]: fake.admin };
  for (const [p, exp] of Object.entries(extraStubs)) stubs[require.resolve(p)] = exp;
  for (const key of Object.keys(require.cache)) {
    if (key.startsWith(functionsDir) && !key.includes("node_modules")) delete require.cache[key];
  }
  for (const [p, exp] of Object.entries(stubs)) {
    require.cache[p] = { id: p, filename: p, loaded: true, exports: exp };
  }
  return require(modulePath);
}

module.exports = { createFakeFirestore, loadWithFake, requiredIndex };
