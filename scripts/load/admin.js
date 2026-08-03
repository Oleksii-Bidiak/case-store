import http from "k6/http";
import { sleep } from "k6";
import { apiUrl, authHeaders, record } from "./lib.js";

/**
 * admin.js — can somebody work in the admin panel during business hours?
 *
 * This exists because of a specific, reasonable objection: nobody is going to
 * sit up at night adding products. The shop has to stay pleasant for customers
 * WHILE a content manager edits it, and that is not something `browse.js` can
 * answer on its own — admin work is write-heavy, and each write does far more
 * than a page view: it invalidates the Redis product-list keyspace with a
 * SCAN+DEL sweep, re-indexes Meilisearch, and now also asks the storefront to
 * purge its prerendered homepage (TASK-384).
 *
 * ## Run it ALONGSIDE browse.js, never instead of it
 *
 *   # terminal 1 — customers
 *   docker run --rm -i -v "$PWD/scripts/load:/load" -e BASE_URL=... \
 *     grafana/k6 run /load/browse.js
 *
 *   # terminal 2 — one content manager, at the same time
 *   docker run --rm -i -v "$PWD/scripts/load:/load" -e BASE_URL=... \
 *     -e ADMIN_EMAIL=... -e ADMIN_PASSWORD=... grafana/k6 run /load/admin.js
 *
 * The question is not "how fast is the admin panel". It is: does `browse.js`
 * degrade while this runs? Compare its p95 with and without this in the second
 * terminal. If the customer numbers move, the answer is capacity; if they do
 * not, editing during the day is safe and the objection is closed with a
 * measurement instead of an opinion.
 *
 * ## Never point this at production
 *
 * It WRITES. It edits a real product's description in a loop. On staging that is
 * free; on the live shop it would rewrite a seller's copy and fire a storefront
 * purge every few seconds. There is no safety interlock here beyond this
 * paragraph and the credentials you have to supply by hand.
 */
export const options = {
  // One or two content managers, which is the real-world shape. Ten would answer
  // a question nobody has.
  vus: Number(__ENV.VUS ?? 1),
  duration: __ENV.DURATION ?? "5m",
  thresholds: {
    server_errors_5xx: ["count==0"],
  },
};

export function setup() {
  const email = __ENV.ADMIN_EMAIL;
  const password = __ENV.ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD are required.");
  }

  const login = http.post(
    `${apiUrl()}/api/auth/login`,
    JSON.stringify({ email, password }),
    { headers: { "content-type": "application/json", ...authHeaders() } },
  );
  if (login.status !== 200 && login.status !== 201) {
    throw new Error(`Admin login failed (${login.status}).`);
  }

  const token = login.json("data.accessToken");
  if (!token) throw new Error("Login succeeded but returned no access token.");

  const list = http.get(`${apiUrl()}/api/admin/products?limit=5`, {
    headers: { Authorization: `Bearer ${token}`, ...authHeaders() },
  });
  const products = list.json("data") ?? [];
  if (products.length === 0) {
    throw new Error("No products to edit — seed the catalogue first.");
  }

  return { token, productId: products[0].id };
}

export default function adminSession(data) {
  const headers = {
    Authorization: `Bearer ${data.token}`,
    "content-type": "application/json",
    ...authHeaders(),
  };

  // Reads first: this is what an operator does most of the time.
  record(
    http.get(`${apiUrl()}/api/admin/products?limit=20`, { headers }),
    "admin /products",
  );
  sleep(2);

  record(
    http.get(`${apiUrl()}/api/admin/orders?limit=20`, { headers }),
    "admin /orders",
  );
  sleep(2);

  // One write. The expensive part is not the UPDATE — it is everything the write
  // triggers behind it, and that is precisely what we want in the measurement.
  record(
    http.patch(
      `${apiUrl()}/api/admin/products/${data.productId}`,
      JSON.stringify({ description: `Load-test edit ${__ITER}` }),
      { headers },
    ),
    "admin PATCH /products/:id",
  );
  sleep(5);
}
