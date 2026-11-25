'use strict';

// Shared plumbing of the steps: the shop's addresses (every page of the customer's account carries a
// `customer_token`, every page of the administration a `user_token`), opening a page and waiting for the shop's
// own signals, the alerts it answers with, the users registry and the logins, the manager's session of the
// administration that puts back what a scenario changed, and the registry of those restores.
//
// This file registers no step.
//
// The storefront and the administration send their forms by Ajax (jQuery): an "Add to Cart", a coupon, a step of
// the checkout, a save of the administration. While a request runs jQuery counts it (`jQuery.active`); the steps
// wait for it to fall back, never for a fixed time. The shop's answer is an alert (".alert-success Success: …",
// ".alert-danger Warning: …"), most often in `#alert`, on a page such as the address book above its list; a script
// the pack adds to every page records each one as it comes, so a step reads it even when a later request already
// replaced it.

const path = require('path');
const { gotoUrl, friendly, onNewPage } = require('webship-js/tests/step-definitions/webship');

// ---------------------------------------------------------------------------
// Budgets and text
// ---------------------------------------------------------------------------

/** The per-assertion wait budget: `minWaitTime.page` from cucumber.js, at least 10 seconds. */
function budget(world) {
  const page = Number(world && world.parameters && world.parameters.minWaitTime && world.parameters.minWaitTime.page) || 0;
  return Math.max(10000, page * 3);
}

function clean(text) {
  return String(text == null ? '' : text).replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
}

/** Two texts are the same, letter case and spacing aside. */
function same(a, b) {
  return clean(a).toLowerCase() === clean(b).toLowerCase();
}

/** A text holds another, letter case and spacing aside. */
function holds(text, part) {
  return clean(text).toLowerCase().includes(clean(part).toLowerCase());
}

function listed(values) {
  const list = (values || []).filter((v) => clean(v));
  return list.length ? list.map((v) => `"${clean(v)}"`).join(', ') : '(none)';
}

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** The quoted values of a phrase's list: "A", "B" and "C". */
function quoted(list) {
  return [...String(list).matchAll(/"([^"]*)"/g)].map((m) => m[1]);
}

// ---------------------------------------------------------------------------
// The shop's addresses
// ---------------------------------------------------------------------------

function siteRoot(world) {
  return String((world.parameters && world.parameters.launchUrl) || world.launchUrl || '').replace(/\/+$/, '');
}

/** The address of a page of the storefront by its route: index.php?route=…&language=…. */
function shopUrl(world, route, query = '') {
  const lang = (world.parameters && world.parameters.shop && world.parameters.shop.language) || 'en-gb';
  return `${siteRoot(world)}/index.php?route=${route}&language=${lang}${query ? `&${query}` : ''}`;
}

/** The folder of the administration: admin/ unless the shop renamed it (`shop.admin` in cucumber.js). */
function adminRoot(world) {
  const folder = (world.parameters && world.parameters.shop && world.parameters.shop.admin) || 'admin';
  return `${siteRoot(world)}/${String(folder).replace(/^\/+|\/+$/g, '')}`;
}

/** The address of a screen of the administration by its route, with the session's user_token. */
function adminUrl(world, route, query = '', token = world.__userToken) {
  return `${adminRoot(world)}/index.php?route=${route}${token ? `&user_token=${token}` : ''}${query ? `&${query}` : ''}`;
}

/** The address a page is on, without the tokens, for a message. */
function shown(url) {
  return String(url || '').replace(/(user_token|customer_token|login_token)=[A-Za-z0-9]+/g, '$1=…');
}

// ---------------------------------------------------------------------------
// Pages and the shop's signals
// ---------------------------------------------------------------------------

const CUT = /ERR_NETWORK_CHANGED|ERR_CONNECTION_RESET|ERR_CONNECTION_CLOSED|ERR_CONNECTION_REFUSED|ERR_EMPTY_RESPONSE|chrome-error:\/\/chromewebdata|ERR_ABORTED|frame was detached/;

/** Wait until the page is quiet: loaded, and no request of jQuery running. */
async function settle(page, timeout) {
  const limit = timeout || 15000;
  await page.waitForLoadState('load', { timeout: limit }).catch(() => {});
  await page.waitForFunction(() => document.readyState === 'complete' && (!window.jQuery || window.jQuery.active === 0)
    && !document.querySelector('button[disabled] .spinner-border, .btn.disabled .spinner-border'),
  null, { timeout: limit, polling: 100 }).catch(() => {});
}

/** Open an address and wait for the page to be quiet; a cut connection (the machine's network changed) goes again. */
async function openIn(page, url, timeout) {
  const deadline = Date.now() + 30000;
  let response = null;
  for (;;) {
    try {
      response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeout || 60000 });
      break;
    } catch (err) {
      if (!CUT.test(String(err && err.message)) || Date.now() > deadline) {
        await gotoUrl(page, url);
        break;
      }
      await page.waitForTimeout(1000);
    }
  }
  await settle(page, timeout);
  return response;
}

async function open(world, url) {
  const response = await openIn(world.page, url, budget(world) * 3);
  world.__lastStatus = response ? response.status() : null;
  return response;
}

/** Run what sends a form or follows a link, then wait for the page to be quiet again. */
async function act(page, fn, timeout) {
  await Promise.all([page.waitForLoadState('load', { timeout: timeout || 30000 }).catch(() => {}), fn()]);
  await page.waitForTimeout(150);
  await settle(page, timeout || 30000);
}

/** Poll a reading until it satisfies a check, or fail with what the last reading says. */
async function eventually(page, read, check, explain, timeout) {
  const deadline = Date.now() + (timeout || 10000);
  let value;
  for (;;) {
    value = await read().catch(() => undefined);
    if (value !== undefined && check(value)) return value;
    if (Date.now() > deadline) throw friendly(await explain(value));
    await page.waitForTimeout(150);
  }
}

/** The main heading of the page. */
async function heading(page) {
  return clean(await page.evaluate(() => {
    const h = document.querySelector('#content h1') || document.querySelector('.page-header h1') || document.querySelector('h1');
    return h ? h.textContent : '';
  }).catch(() => ''));
}

async function pageSummary(world) {
  const page = world.page;
  const said = await alerts(page);
  return `the page shows "${await heading(page) || '(no heading)'}" at ${shown(page.url())}${said.length ? `, and says ${listed(said.slice(-3))}` : ''}`;
}

// ---------------------------------------------------------------------------
// The alerts: recorded as they come, read in order
// ---------------------------------------------------------------------------

const ALERT_RECORDER = `(() => {
  if (window.__webshipAlerts) return;
  window.__webshipAlerts = [];
  const seen = new WeakSet();
  const take = (root) => {
    (root.querySelectorAll ? [root, ...root.querySelectorAll('.alert')] : []).forEach((a) => {
      if (!a.classList || !a.classList.contains('alert') || seen.has(a) || !/alert-(success|danger|warning)/.test(a.className)) return;
      seen.add(a);
      const kind = a.classList.contains('alert-success') ? 'success' : (a.classList.contains('alert-danger') ? 'error' : (a.classList.contains('alert-warning') ? 'warning' : 'info'));
      window.__webshipAlerts.push({ kind, text: a.textContent.replace(/\\s+/g, ' ').trim(), at: Date.now() });
    });
  };
  const watch = () => {
    take(document);
    new MutationObserver((list) => list.forEach((m) => m.addedNodes.forEach((n) => n.nodeType === 1 && take(n)))).observe(document.documentElement, { childList: true, subtree: true });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch); else watch();
})();`;

/** Make every page of the scenario record the shop's alerts. */
async function recordAlerts(page) {
  if (!page || page.__webshipRecorder) return;
  page.__webshipRecorder = true;
  await page.addInitScript(ALERT_RECORDER).catch(() => {});
  await page.evaluate(ALERT_RECORDER).catch(() => {});
}

/** The alerts the page showed since it loaded, oldest first: [{ kind, text }]. */
async function alerts(page) {
  return page.evaluate(() => (window.__webshipAlerts || []).map((a) => ({ kind: a.kind, text: a.text }))).catch(() => []);
}

/** Forget the alerts so far: the next step reads only what comes after it. */
async function forgetAlerts(page) {
  await page.evaluate(() => { if (window.__webshipAlerts) window.__webshipAlerts.length = 0; }).catch(() => {});
}

/** Wait for an alert that holds a text (of a kind, when one is named). */
async function expectAlert(world, expected, kind, hint) {
  return eventually(world.page, () => alerts(world.page), (all) => all.some((a) => holds(a.text, expected) && (!kind || a.kind === kind)), async (all) => ({
    message: `The shop does not say "${expected}". ${(all || []).length ? `It says ${listed(all.map((a) => a.text))}` : `It said nothing (${await pageSummary(world)})`}.`,
    hint: hint || 'The shop answers a form in the box above the content (#alert): its words are the ones of the language the shop runs in.',
  }), budget(world));
}

// ---------------------------------------------------------------------------
// The users registry
// ---------------------------------------------------------------------------

/** An account of the users registry by its handle: { handle, username, password, email, name }. */
function resolveUser(world, handle) {
  const users = (world.parameters && world.parameters.users) || {};
  const entry = users[handle];
  if (!entry) {
    throw friendly({
      message: `The user "${handle}" is not in the users registry. Known users: ${Object.keys(users).join(', ') || '(none)'}.`,
      hint: `Add it to worldParameters.users in cucumber.js. The account itself is made once by the build of the shop, never by a feature.`,
    });
  }
  if (!entry.username || !entry.password) {
    throw friendly({ message: `The user "${handle}" has no ${entry.username ? 'password' : 'user name'} in the users registry.`, hint: `Set worldParameters.users.${handle}.username and .password in cucumber.js.` });
  }
  return { handle, username: entry.username, password: entry.password, email: entry.email || (/@/.test(entry.username) ? entry.username : ''), name: entry.name || '' };
}

/** The handle of the account that puts back what a scenario changed (`shop.manager`, "admin" by default). */
function managerHandle(world) {
  return (world.parameters && world.parameters.shop && world.parameters.shop.manager) || 'admin';
}

// ---------------------------------------------------------------------------
// Logins: the storefront's and the administration's
// ---------------------------------------------------------------------------

/** Log the scenario's browser in to the storefront with an address and a password; { ok, said } */
async function submitShopLogin(world, email, password) {
  const page = world.page;
  await recordAlerts(page);
  await open(world, shopUrl(world, 'account/login'));
  const form = page.locator('#form-login');
  await form.waitFor({ state: 'visible', timeout: budget(world) }).catch(async (err) => {
    throw friendly({ message: `The login form of the shop did not appear: ${await pageSummary(world)}.`, cause: err, hint: 'The storefront\'s login page is index.php?route=account/login: check launchUrl in cucumber.js.' });
  });
  await forgetAlerts(page);
  await form.locator('#input-email').fill(email);
  await form.locator('#input-password').fill(password);
  await Promise.all([
    page.waitForURL(/route=account\/account/, { timeout: budget(world) }).catch(() => {}),
    form.locator('button[type=submit]').click(),
  ]);
  await settle(page, budget(world));
  const token = new URL(page.url()).searchParams.get('customer_token');
  if (/route=account\/account/.test(page.url()) && token) {
    world.__customerToken = token;
    return { ok: true, said: [] };
  }
  const said = await eventually(page, () => alerts(page), (a) => a.length > 0, async () => ({ message: '' }), 5000).catch(() => []);
  return { ok: false, said: (said || []).map((a) => a.text) };
}

async function logInShop(world, handle) {
  const user = resolveUser(world, handle);
  await world.page.context().clearCookies();
  const outcome = await submitShopLogin(world, user.email || user.username, user.password);
  if (!outcome.ok) {
    throw friendly({
      message: `"${handle}" (${user.email || user.username}) could not log in to the shop: ${outcome.said.length ? `it says ${listed(outcome.said)}` : await pageSummary(world)}.`,
      hint: 'Check the account in the users registry of cucumber.js and in the shop (the build makes it): the storefront logs in with the address.',
    });
  }
  world.__shopAccount = user;
  return user;
}

/** Log the scenario's browser in to the administration with a user name and a password; { ok, said } */
async function submitAdminLogin(world, username, password) {
  const page = world.page;
  await recordAlerts(page);
  await open(world, `${adminRoot(world)}/index.php?route=common/login`);
  const form = page.locator('#form-login');
  await form.waitFor({ state: 'visible', timeout: budget(world) }).catch(async (err) => {
    throw friendly({ message: `The login form of the administration did not appear: ${await pageSummary(world)}.`, cause: err, hint: 'The administration is admin/ of the shop (shop.admin in cucumber.js names another folder).' });
  });
  await forgetAlerts(page);
  await form.locator('#input-username').fill(username);
  await form.locator('#input-password').fill(password);
  await Promise.all([
    page.waitForURL(/user_token=/, { timeout: budget(world) }).catch(() => {}),
    form.locator('button[type=submit]').click(),
  ]);
  await settle(page, budget(world));
  const token = new URL(page.url()).searchParams.get('user_token');
  if (token) {
    world.__userToken = token;
    return { ok: true, said: [] };
  }
  const said = await eventually(page, () => alerts(page), (a) => a.length > 0, async () => ({ message: '' }), 5000).catch(() => []);
  return { ok: false, said: (said || []).map((a) => a.text) };
}

async function logInAdmin(world, handle) {
  const user = resolveUser(world, handle);
  await world.page.context().clearCookies();
  const outcome = await submitAdminLogin(world, user.username, user.password);
  if (!outcome.ok) {
    throw friendly({
      message: `"${handle}" (${user.username}) could not log in to the administration: ${outcome.said.length ? `it says ${listed(outcome.said)}` : await pageSummary(world)}.`,
      hint: 'Check the account in the users registry of cucumber.js and in the shop (the build makes it).',
    });
  }
  world.__adminAccount = user;
  return user;
}

/** The token of the customer's session of the scenario, or a failure that says to log in first. */
function customerToken(world) {
  if (!world.__customerToken) throw friendly({ message: 'No customer is logged in to the shop in this scenario.', hint: 'Log in first: Given I am logged in to the shop as "customer".' });
  return world.__customerToken;
}

function userToken(world) {
  if (!world.__userToken) throw friendly({ message: 'Nobody is logged in to the administration in this scenario.', hint: 'Log in first: Given I am logged in to the administration as "admin".' });
  return world.__userToken;
}

// ---------------------------------------------------------------------------
// The restores of a scenario
// ---------------------------------------------------------------------------

/**
 * Ask for something to be put back when the scenario ends, whatever its outcome. `late` ones run after the
 * others (the orders, once the scenario's own removals ran).
 */
function afterScenario(world, job, late) {
  const list = late ? 'shopLateCleanup' : 'shopCleanup';
  if (!world[list]) world[list] = [];
  world[list].push(job);
}

function playwrightModule() {
  const from = [process.cwd(), __dirname, path.dirname(require.resolve('webship-js/package.json', { paths: [process.cwd(), __dirname] }))];
  return require(require.resolve('playwright', { paths: from }));
}

/** The browser options of the project (playwright.config): its HTTPS and its timeouts. */
function transportOptions() {
  try {
    const config = require(path.join(process.cwd(), 'playwright.config'));
    const use = (config && (config.default || config).use) || {};
    return { ignoreHTTPSErrors: use.ignoreHTTPSErrors !== false };
  } catch {
    return { ignoreHTTPSErrors: true };
  }
}

// The manager's sessions of the administration, by site: one request context a run, logged in once.
const MANAGER_RUNS = new Map();

/**
 * The manager's session of the administration (an account of the users registry with the rights over orders,
 * products, categories and coupons; "admin" by default): get(route, query) and post(route, form, query), each with
 * the session's user_token, answering { status, text, json }.
 */
async function managerSession(world) {
  const root = siteRoot(world);
  if (MANAGER_RUNS.has(root)) return MANAGER_RUNS.get(root);
  const run = (async () => {
    const user = resolveUser(world, managerHandle(world));
    const request = await playwrightModule().request.newContext(transportOptions());
    const loginPage = await (await request.get(`${adminRoot(world)}/index.php?route=common/login`, { failOnStatusCode: false })).text();
    const action = (loginPage.match(/id="form-login"[^>]*action="([^"]+)"/) || loginPage.match(/action="([^"]*common\/login\.login[^"]*)"/) || [])[1];
    if (!action) throw new Error('The login form of the administration was not found, so what the scenario changed is not put back.');
    const answer = await request.post(action.replace(/&amp;/g, '&'), { form: { username: user.username, password: user.password }, failOnStatusCode: false });
    let json = {};
    try { json = JSON.parse(await answer.text()); } catch { /* not JSON */ }
    const token = String(json.redirect || '').match(/user_token=([A-Za-z0-9]+)/);
    if (!token) throw new Error(`The manager account ("${managerHandle(world)}") could not log in to the administration (${clean(json.error && json.error.warning || json.error || '')}), so what the scenario changed is not put back.`);
    const read = async (response) => {
      const text = await response.text();
      let parsed = null;
      try { parsed = JSON.parse(text); } catch { /* HTML */ }
      return { status: response.status(), text, json: parsed };
    };
    const get = async (route, query = '') => read(await request.get(adminUrl(world, route, query, token[1]), { failOnStatusCode: false }));
    const post = async (route, form, query = '') => read(await request.post(adminUrl(world, route, query, token[1]), { form, failOnStatusCode: false, headers: { 'X-Requested-With': 'XMLHttpRequest' } }));
    return { request, get, post, token: token[1] };
  })();
  MANAGER_RUNS.set(root, run);
  run.catch(() => MANAGER_RUNS.delete(root));
  return run;
}

/** Close the run's sessions once the run ends. */
async function managerEnd() {
  const runs = [...MANAGER_RUNS.values()];
  MANAGER_RUNS.clear();
  for (const run of runs) {
    try { await (await run).request.dispose(); } catch { /* gone */ }
  }
}

/** The rows of a list of the administration in its HTML: [{ id, text }] (the id of its checkbox). */
function listRows(html) {
  return String(html).split(/<tr[\s>]/).slice(1).map((row) => ({
    id: Number((row.match(/name="selected\[\]"\s+value="(\d+)"/) || row.match(/value="(\d+)"\s+[^>]*name="selected\[\]"/) || [])[1] || 0),
    text: clean(row.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#039;/g, "'")),
  })).filter((r) => r.id);
}

/** The ids of the orders of a buyer (by the name the order carries), as the orders list of the administration shows them. */
async function ordersOf(world, name) {
  const session = await managerSession(world);
  const answer = await session.get('sale/order.list', `filter_customer=${encodeURIComponent(name)}`);
  return listRows(answer.text).filter((r) => holds(r.text, name)).map((r) => r.id);
}

/** The highest order id of the shop, before a scenario places one. */
async function lastOrderId(world) {
  const session = await managerSession(world);
  const answer = await session.get('sale/order.list', 'sort=o.order_id&order=DESC');
  return Math.max(0, ...listRows(answer.text).map((r) => r.id));
}

/**
 * An order taken away the shop's own way: "Voided" through its history first (OpenCart's events take its total out
 * of the statistics, put the stock back and remove a coupon's use), then "Delete" in the orders list.
 */
async function removeOrder(world, orderId) {
  const session = await managerSession(world);
  const voided = (world.parameters && world.parameters.shop && world.parameters.shop.voidStatusId) || 16;
  const history = await session.post('sale/order.call', { order_status_id: String(voided), override: '0', notify: '0', comment: '', order_id: String(orderId) }, `call=history_add&store_id=0&language=en-gb&order_id=${orderId}`);
  if (history.status !== 200 || (history.json && history.json.error)) {
    throw new Error(`The order #${orderId} could not be voided (${history.status}${history.json && history.json.error ? `: ${clean(JSON.stringify(history.json.error))}` : ''}).`);
  }
  const removed = await session.post('sale/order.delete', { 'selected[]': String(orderId) });
  if (removed.status !== 200 || !(removed.json && removed.json.success)) throw new Error(`The order #${orderId} could not be deleted (${removed.status}).`);
}

/**
 * Before a step places an order: note the shop's last order, once a scenario, so that the scenario's end takes away
 * every order placed after it in the name of the scenario's buyer.
 */
async function touchOrders(world, name) {
  if (!world.shopOrders) world.shopOrders = { since: null, names: new Set() };
  if (world.shopOrders.since === null) {
    world.shopOrders.since = await lastOrderId(world);
    afterScenario(world, async () => {
      const problems = [];
      for (const buyer of world.shopOrders.names) {
        for (const id of await ordersOf(world, buyer)) {
          if (id <= world.shopOrders.since) continue;
          await removeOrder(world, id).catch((err) => problems.push(err.message));
        }
      }
      if (problems.length) throw new Error(problems.join('; '));
    }, true);
  }
  if (name) world.shopOrders.names.add(clean(name));
}

/**
 * A product, a category or a coupon of the administration by its name, deleted with the list's own Delete; every
 * one of that name goes. Answers how many went.
 */
const KINDS = {
  product: { route: 'catalog/product', filter: (n) => `filter_name=${encodeURIComponent(n)}` },
  category: { route: 'catalog/category', filter: (n) => `filter_name=${encodeURIComponent(n)}` },
  coupon: { route: 'marketing/coupon', filter: () => '' },
};

async function deleteNamed(world, kind, name) {
  const session = await managerSession(world);
  const meta = KINDS[kind];
  const ids = new Set();
  for (let page = 1; page <= 10; page += 1) {
    const answer = await session.get(`${meta.route}.list`, `${meta.filter(name)}&page=${page}`);
    const rows = listRows(answer.text);
    rows.filter((r) => holds(r.text, name) && new RegExp(`(^|\\s)${escapeRegExp(clean(name))}(\\s|$)`, 'i').test(r.text)).forEach((r) => ids.add(r.id));
    if (rows.length < 10) break;
  }
  if (!ids.size) return 0;
  const body = [...ids].map((id) => `selected%5B%5D=${id}`).join('&');
  const answer = await session.request.post(adminUrl(world, `${meta.route}.delete`, '', session.token), { data: body, headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Requested-With': 'XMLHttpRequest' }, failOnStatusCode: false });
  const text = await answer.text();
  if (answer.status() !== 200 || !/success/.test(text)) throw new Error(`The ${kind} "${name}" could not be deleted (${answer.status()}: ${clean(text).slice(0, 200)}).`);
  return ids.size;
}

module.exports = {
  budget,
  clean,
  same,
  holds,
  listed,
  escapeRegExp,
  quoted,
  siteRoot,
  shopUrl,
  adminRoot,
  adminUrl,
  shown,
  settle,
  openIn,
  open,
  act,
  eventually,
  heading,
  pageSummary,
  recordAlerts,
  alerts,
  forgetAlerts,
  expectAlert,
  resolveUser,
  managerHandle,
  submitShopLogin,
  logInShop,
  submitAdminLogin,
  logInAdmin,
  customerToken,
  userToken,
  afterScenario,
  managerSession,
  managerEnd,
  listRows,
  ordersOf,
  lastOrderId,
  removeOrder,
  touchOrders,
  deleteNamed,
  onNewPage,
};
