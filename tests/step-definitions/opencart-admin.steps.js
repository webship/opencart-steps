'use strict';

// The administration: its screens by the menu, the dashboard's tiles, the lists (their rows), a product, a category
// or a coupon started from a list's "Add New", the fields of a form by their labels and tabs, its save and the
// errors of its fields, a delete from a list, and an order: opened, its status, its status changed and its history.
//
// Every screen of the administration carries the session's user_token: the steps follow the menu. A product, a
// category or a coupon a scenario starts is deleted when it ends (every one of its name); an order is taken away the
// shop's own way (see opencart-helpers.js).

const { Given, When, Then } = require('@cucumber/cucumber');
const { friendly } = require('webship-js/tests/step-definitions/webship');
const h = require('./opencart-helpers');

/** The screens a list step opens, by the name of the menu item. */
const SCREENS = {
  dashboard: 'common/dashboard',
  products: 'catalog/product',
  categories: 'catalog/category',
  orders: 'sale/order',
  customers: 'customer/customer',
  coupons: 'marketing/coupon',
};

/** The rows of the list on the screen: [{ text }]. */
async function listRows(world) {
  return world.page.evaluate(() => [...document.querySelectorAll('#content table tbody tr')].map((r) => ({ text: r.textContent.replace(/\s+/g, ' ').trim() })).filter((r) => r.text && !/No results!/.test(r.text)));
}

/** The rows of every page of the list on the screen (its pagination's pages, read without leaving the page). */
async function allListRows(world) {
  const rows = await listRows(world);
  const pages = await world.page.evaluate(() => [...new Set([...document.querySelectorAll('#content .pagination a')].map((a) => a.href).filter((u) => /page=\d+/.test(u)))]);
  for (const url of pages.slice(0, 20)) {
    const html = await (await world.page.request.get(url, { failOnStatusCode: false })).text();
    rows.push(...h.listRows(html).map((r) => ({ text: r.text })));
  }
  const seen = new Set();
  return rows.filter((r) => (seen.has(r.text) ? false : seen.add(r.text)));
}

/**
 * Open a screen of the administration by its menu item: "Dashboard", "Products", "Categories", "Orders",
 * "Customers", "Coupons" (or any item of the menu, by its name).
 *
 * Example #1: When I go to "Products" in the administration
 * Example #2: Given I am on "Orders" in the administration
 * Example #3: When we go to "Customers" in the administration
 * Example #4: And I go to "Coupons" in the administration
 * Example #5: When I go to "Categories" in the administration
 */
When(/^(?:(?:I|we) go to|(?:I am|we are) on) "([^"]*)" in the administration$/, { timeout: 90000 }, async function (name) {
  const token = h.userToken(this);
  const route = SCREENS[h.clean(name).toLowerCase()];
  if (!/route=common\/dashboard|route=[a-z]/.test(this.page.url()) || /admin\/?$/.test(this.page.url())) await h.open(this, h.adminUrl(this, 'common/dashboard'));
  const links = await this.page.evaluate(() => [...document.querySelectorAll('#menu a')].map((a) => ({ text: a.textContent.replace(/\s+/g, ' ').trim(), href: a.href })).filter((l) => /route=/.test(l.href)));
  const link = links.find((l) => h.same(l.text, name)) || (route && links.find((l) => l.href.includes(`route=${route}&`)));
  if (!link) {
    throw friendly({
      message: `The administration's menu has no "${name}" for this account. It has ${h.listed([...new Set(links.map((l) => l.text))].slice(0, 30))}.`,
      hint: 'The menu shows the screens the account\'s user group may open (System > Users > User Groups).',
    });
  }
  await h.open(this, link.href.includes('user_token=') ? link.href : `${link.href}&user_token=${token}`);
  await h.recordAlerts(this.page);
});

/**
 * The administration's menu offers an item to the account logged in, or does not (its user group's permissions).
 *
 * Example #1: Then the administration menu should offer "Products"
 * Example #2: Then the administration menu should not offer "Orders"
 * Example #3: And the administration menu should offer "Categories"
 * Example #4: Then the administration menu should not offer "Customers"
 * Example #5: Then the administration menu should offer "Coupons"
 */
Then(/^the administration menu should( not)? offer "([^"]*)"$/, async function (not, name) {
  h.userToken(this);
  if (!/route=/.test(this.page.url())) await h.open(this, h.adminUrl(this, 'common/dashboard'));
  const read = () => this.page.evaluate(() => [...document.querySelectorAll('#menu a')].filter((a) => /route=/.test(a.href)).map((a) => a.textContent.replace(/\s+/g, ' ').trim()));
  await h.eventually(this.page, read, (items) => items.some((t) => h.same(t, name)) === !not, async (items) => ({
    message: not ? `The administration's menu offers "${name}".` : `The administration's menu does not offer "${name}". It offers ${h.listed([...new Set(items || [])].slice(0, 30))}.`,
    hint: 'The menu shows the screens the account\'s user group may open (System > Users > User Groups).',
  }), h.budget(this));
});

/**
 * A tile of the dashboard shows a value: "Total Orders", "Total Sales", "Total Customers", "People Online".
 *
 * Example #1: Then the dashboard should show "Total Orders" as "0"
 * Example #2: Then the dashboard should show "Total Customers" as "1"
 * Example #3: And the dashboard should show "Total Sales" as "0"
 * Example #4: Then the dashboard should show "People Online" as "0"
 * Example #5: Then the dashboard should show "Total Orders" as "1"
 */
Then(/^the dashboard should show "([^"]*)" as "([^"]*)"$/, async function (label, value) {
  const read = () => this.page.evaluate(() => [...document.querySelectorAll('.tile, #content .card')].map((t) => ({
    head: ((t.querySelector('.tile-heading, .card-header') || {}).textContent || '').replace(/\s+/g, ' ').trim(),
    body: ((t.querySelector('.tile-body h2, .tile-body, .card-body h2') || {}).textContent || '').replace(/\s+/g, ' ').trim(),
  })));
  await h.eventually(this.page, read, (tiles) => tiles.some((t) => h.holds(t.head, label) && h.same(t.body.replace(/[^\d.,$€£kKmM-]/g, ''), value)), async (tiles) => ({
    message: `The dashboard does not show "${label}" as "${value}". It shows ${h.listed((tiles || []).filter((t) => t.head && t.body).map((t) => `${t.head.replace(/\s*\d+%.*$/, '')} ${t.body}`))}.`,
    hint: 'The tiles of the dashboard read the shop\'s statistics: an order counts once it has a processing or complete status.',
  }), h.budget(this));
});

/**
 * The list of the screen (products, categories, orders, customers, coupons) shows a row with a text, with another
 * text in the same row; or shows none.
 *
 * Example #1: Then the administration list should show "Canon EOS 5D"
 * Example #2: Then the administration list should show "customer@example.com" with "Customer Test"
 * Example #3: And the administration list should not show "Webship test product"
 * Example #4: Then the administration list should show "Webship Ten" with "WEBSHIP10"
 * Example #5: Then the administration list should show "MacBook" with "Product 16"
 */
Then(/^the administration list should( not)? show "([^"]*)"(?: with "([^"]*)")?$/, async function (not, text, also) {
  await h.eventually(this.page, () => allListRows(this), (rows) => rows.some((r) => h.holds(r.text, text) && (!also || h.holds(r.text, also))) === !not, async (rows) => ({
    message: not ? `The list shows "${text}".` : `The list does not show "${text}"${also ? ` with "${also}"` : ''}. Its rows are ${h.listed((rows || []).map((r) => r.text).slice(0, 12))}.`,
    hint: 'The step reads every page of the list; open the screen first: When I go to "…" in the administration.',
  }), h.budget(this));
});

/** The kinds of thing a list starts, and the fields a new one needs besides its name. */
const NEW = {
  product: { screen: 'Products', name: '#input-name-1', also: [['#input-meta-title-1', (n) => n]], seo: '#input-keyword-0-1' },
  category: { screen: 'Categories', name: '#input-name-1', also: [['#input-meta-title-1', (n) => n]], seo: '#input-keyword-0-1' },
  coupon: { screen: 'Coupons', name: '#input-name', also: [] },
};

/**
 * Start a new product, category or coupon from its list's "Add New", with its name (and the meta title and SEO
 * keyword a product and a category ask for). Set the other fields, then save. Every one of that name is deleted when
 * the scenario ends.
 *
 * Example #1: When I start a new product "Webship test product"
 * Example #2: When we start a new category "Webship test category"
 * Example #3: And I start a new coupon "Webship test coupon"
 * Example #4: When I start a new product "Webship test camera"
 * Example #5: When we start a new category "Webship test lenses"
 */
When(/^(?:I|we) start a new (product|category|coupon) "([^"]*)"$/, { timeout: 120000 }, async function (kind, name) {
  h.userToken(this);
  h.afterScenario(this, () => h.deleteNamed(this, kind, name).then(() => undefined));
  const meta = NEW[kind];
  const route = SCREENS[meta.screen.toLowerCase()];
  await h.open(this, h.adminUrl(this, `${route}.form`));
  const field = this.page.locator(meta.name);
  await field.waitFor({ state: 'attached', timeout: h.budget(this) }).catch(async (err) => {
    throw friendly({ message: `The form of a new ${kind} did not open: ${await h.pageSummary(this)}.`, cause: err, hint: `The account must be allowed to change ${meta.screen.toLowerCase()} (its user group's permissions).` });
  });
  await field.fill(name);
  for (const [selector, value] of meta.also) await this.page.locator(selector).fill(value(name));
  if (meta.seo && (await this.page.locator(meta.seo).count())) {
    // The keyword of its address is on the "SEO" tab: open it, fill it in, and come back to "General".
    await this.page.locator('a[href="#tab-seo"]').first().click();
    await this.page.locator(meta.seo).waitFor({ state: 'visible', timeout: h.budget(this) });
    await this.page.locator(meta.seo).fill(name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
    await this.page.locator('a[href="#tab-general"]').first().click();
  }
});

/** The field of the form on the screen by its label, in a tab when one is named. */
async function formField(world, label, tab) {
  if (tab) {
    const link = world.page.locator('#content .nav-tabs a, #content .nav-tabs button').filter({ hasText: new RegExp(`^\\s*${h.escapeRegExp(tab)}\\s*$`) }).first();
    if (!(await link.count())) throw friendly({ message: `The form has no tab "${tab}". Its tabs are ${h.listed(await world.page.locator('#content .nav-tabs a, #content .nav-tabs button').allTextContents())}.` });
    await link.click();
    await world.page.waitForTimeout(200);
  }
  const labels = world.page.locator('#content label:visible');
  const n = await labels.count();
  const seen = [];
  for (let i = 0; i < n; i += 1) {
    const l = labels.nth(i);
    const text = h.clean(await l.textContent());
    seen.push(text);
    if (!h.same(text, label)) continue;
    const id = await l.getAttribute('for');
    if (id) return world.page.locator(`#${id}`);
  }
  throw friendly({ message: `The form has no field "${label}"${tab ? ` in the tab "${tab}"` : ''}. Its fields are ${h.listed(seen.slice(0, 25))}.`, hint: 'A field is named by its label; a field of another tab needs the tab: in the "Data" tab.' });
}

/**
 * Set a field of the form on the screen by its label (a text, a list's option, a switch "on" or "off"), in a tab
 * of the form when one is named.
 *
 * Example #1: When I set "Model" to "WT-1" in the "Data" tab
 * Example #2: When we set "Price" to "12.50" in the "Data" tab
 * Example #3: And I set "Code" to "WTEST"
 * Example #4: When I set "Discount" to "5"
 * Example #5: When I set "Status" to "on" in the "Data" tab
 */
When(/^(?:I|we) set "([^"]*)" to "([^"]*)"(?: in the "([^"]*)" tab)?$/, { timeout: 60000 }, async function (label, value, tab) {
  const field = await formField(this, label, tab);
  const tag = await field.evaluate((el) => el.tagName + ':' + (el.type || ''));
  if (/^SELECT/.test(tag)) {
    const option = await field.evaluate((s, t) => { const o = [...s.options].find((x) => x.textContent.replace(/\s+/g, ' ').trim().toLowerCase() === t.toLowerCase()); return o ? o.value : null; }, value);
    if (option === null) throw friendly({ message: `The field "${label}" has no "${value}".` });
    await field.selectOption(option);
  } else if (/checkbox|radio/.test(tag)) {
    if (/^(on|yes|1|true)$/i.test(value)) await field.check(); else await field.uncheck();
  } else {
    await field.fill(value);
  }
});

/**
 * Press the "Save" of the form on the screen. Assert the shop's answer next.
 *
 * Example #1: When I save the form
 * Example #2: When we save the form
 * Example #3: And I save the form
 * Example #4: Then I save the form
 * Example #5: When we save the form
 */
When(/^(?:I|we) save the form$/, { timeout: 90000 }, async function () {
  const save = this.page.locator('#content .float-end button[type=submit][form], .page-header button[type=submit]').first();
  if (!(await save.count())) throw friendly({ message: `The screen has no "Save": ${await h.pageSummary(this)}.` });
  await h.forgetAlerts(this.page);
  await h.act(this.page, () => save.click());
  await h.eventually(this.page, () => h.alerts(this.page), (a) => a.length > 0, async () => ({ message: `The administration did not answer the save: ${await h.pageSummary(this)}.` }), h.budget(this));
});

/**
 * A field of the form says what is wrong with it once saved.
 *
 * Example #1: Then the field "Model" should say "Product Model must be greater than 1 and less than 64 characters!"
 * Example #2: Then the field "Product Name" should say "Product Name must be greater than 1 and less than 255 characters!"
 * Example #3: And the field "Code" should say "Code must be between 3 and 20 characters!"
 * Example #4: Then the field "Meta Tag Title" should say "Meta Title must be greater than 1 and less than 255 characters!"
 * Example #5: Then the field "Category Name" should say "Category Name must be between 1 and 255 characters!"
 */
Then(/^the field "([^"]*)" should say "([^"]*)"$/, async function (label, expected) {
  const read = () => this.page.evaluate((wanted) => {
    const norm = (t) => t.replace(/\s+/g, ' ').trim().toLowerCase();
    const label = [...document.querySelectorAll('#content label')].find((l) => norm(l.textContent) === norm(wanted));
    const id = label && label.getAttribute('for');
    const block = id && document.getElementById(id) ? document.getElementById(id).closest('.row, .mb-3, .col-sm-10') : null;
    const feedback = block ? [...block.querySelectorAll('.invalid-feedback')] : [];
    const own = id ? document.getElementById(`error-${id.replace(/^input-/, '')}`) : null;
    return [...feedback, own].filter(Boolean).map((e) => e.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean).join(' ');
  }, label);
  await h.eventually(this.page, read, (text) => h.holds(text, expected), async (text) => ({
    message: `The field "${label}" does not say "${expected}". It says "${text || '(nothing)'}".`,
    hint: 'A field the administration refuses says why under it once "Save" is pressed; it may be on another tab of the form.',
  }), h.budget(this));
});

/**
 * Delete a product, a category or a coupon with its list's "Delete": the box of its row ticked, the button pressed,
 * the question answered yes.
 *
 * Example #1: When I delete the product "Webship test product" in the administration
 * Example #2: When we delete the category "Webship test category" in the administration
 * Example #3: And I delete the coupon "Webship test coupon" in the administration
 * Example #4: When I delete the product "Webship test camera" in the administration
 * Example #5: When we delete the coupon "Webship test coupon" in the administration
 */
When(/^(?:I|we) delete the (product|category|coupon) "([^"]*)" in the administration$/, { timeout: 120000 }, async function (kind, name) {
  const token = h.userToken(this);
  const route = SCREENS[NEW[kind].screen.toLowerCase()];
  await h.open(this, h.adminUrl(this, route, kind === 'coupon' ? '' : `filter_name=${encodeURIComponent(name)}`, token));
  const rows = this.page.locator('#content table tbody tr');
  const n = await rows.count();
  let ticked = 0;
  for (let i = 0; i < n; i += 1) {
    const row = rows.nth(i);
    if (!new RegExp(`(^|\\s)${h.escapeRegExp(h.clean(name))}(\\s|$)`, 'i').test(h.clean(await row.textContent()))) continue;
    await row.locator('input[name="selected[]"]').check();
    ticked += 1;
  }
  if (!ticked) throw friendly({ message: `The list of ${NEW[kind].screen.toLowerCase()} has no "${name}". Its rows are ${h.listed((await listRows(this)).map((r) => r.text).slice(0, 10))}.` });
  await h.forgetAlerts(this.page);
  this.page.once('dialog', (dialog) => dialog.accept().catch(() => {}));
  await h.act(this.page, () => this.page.locator('#content .float-end button.btn-danger, .page-header button.btn-danger').first().click());
  await h.eventually(this.page, () => h.alerts(this.page), (a) => a.length > 0, async () => ({ message: `The administration did not answer the deletion of "${name}": ${await h.pageSummary(this)}.` }), h.budget(this));
});

/**
 * No product, category or coupon of this name is left in the shop (an earlier run's, stopped half way): the
 * manager's session deletes every one with the list's own Delete.
 *
 * Example #1: Given there is no product "Webship test product"
 * Example #2: Given there is no category "Webship test category"
 * Example #3: And there is no coupon "Webship test coupon"
 * Example #4: Given there is no product "Webship test camera"
 * Example #5: Given there is no category "Webship test lenses"
 */
Given(/^there is no (product|category|coupon) "([^"]*)"$/, { timeout: 120000 }, async function (kind, name) {
  await h.deleteNamed(this, kind, name);
});

/**
 * Open, in the administration, the order this scenario placed (the newest of its buyer).
 *
 * Example #1: When I open the order I placed in the administration
 * Example #2: When we open the order we placed in the administration
 * Example #3: And I open the order I placed in the administration
 * Example #4: When I open the order I placed in the administration
 * Example #5: Then we open the order we placed in the administration
 */
When(/^(?:I|we) open the order (?:I|we) placed in the administration$/, { timeout: 90000 }, async function () {
  const token = h.userToken(this);
  const orders = this.shopOrders;
  if (!orders || orders.since === null) throw friendly({ message: 'This scenario placed no order.', hint: 'Place one first: the checkout, then When I confirm the order.' });
  const ids = [];
  for (const name of orders.names) ids.push(...(await h.ordersOf(this, name)).filter((id) => id > orders.since));
  if (!ids.length) throw friendly({ message: `The orders list has no order of ${h.listed([...orders.names])} placed in this scenario.` });
  this.__orderId = Math.max(...ids);
  await h.open(this, h.adminUrl(this, 'sale/order.info', `order_id=${this.__orderId}`, token));
  await h.recordAlerts(this.page);
});

/**
 * The status of the order on the screen (the last of its history).
 *
 * Example #1: Then the order status should be "Pending"
 * Example #2: Then the order status should be "Processing"
 * Example #3: And the order status should be "Shipped"
 * Example #4: Then the order status should be "Complete"
 * Example #5: Then the order status should be "Pending"
 */
Then(/^the order status should be "([^"]*)"$/, async function (status) {
  const read = () => this.page.evaluate(() => {
    const first = document.querySelector('#history tbody tr');
    return first ? first.textContent.replace(/\s+/g, ' ').trim() : '';
  });
  await h.eventually(this.page, read, (row) => h.holds(row, status), async (row) => ({
    message: `The order's status is not "${status}". The last line of its history reads "${row || '(none)'}".`,
    hint: 'Open the order first: When I open the order I placed in the administration.',
  }), h.budget(this));
});

/**
 * Change the status of the order on the screen with its "History": the status chosen, "Add History" pressed.
 * The customer is not notified.
 *
 * Example #1: When I change the order status to "Processing"
 * Example #2: When we change the order status to "Shipped"
 * Example #3: And I change the order status to "Complete"
 * Example #4: When I change the order status to "Canceled"
 * Example #5: When we change the order status to "Processing"
 */
When(/^(?:I|we) change the order status to "([^"]*)"$/, { timeout: 90000 }, async function (status) {
  const select = this.page.locator('#input-order-status');
  await select.waitFor({ state: 'attached', timeout: h.budget(this) }).catch(async (err) => {
    throw friendly({ message: `The screen has no order status to change: ${await h.pageSummary(this)}.`, cause: err, hint: 'Open the order first: When I open the order I placed in the administration.' });
  });
  const value = await select.evaluate((s, t) => { const o = [...s.options].find((x) => x.textContent.replace(/\s+/g, ' ').trim().toLowerCase() === t.toLowerCase()); return o ? o.value : null; }, status);
  if (value === null) throw friendly({ message: `The order has no status "${status}". Its statuses are ${h.listed(await select.evaluate((s) => [...s.options].map((o) => o.textContent.trim())))}.` });
  await select.selectOption(value);
  await h.forgetAlerts(this.page);
  await h.act(this.page, () => this.page.locator('#button-history').click());
  await h.eventually(this.page, () => h.alerts(this.page), (a) => a.length > 0, async () => ({ message: `The administration did not answer the new status: ${await h.pageSummary(this)}.` }), h.budget(this));
});

/**
 * The history of the order on the screen lists a status (with a comment, when one is named).
 *
 * Example #1: Then the order history should list "Processing"
 * Example #2: Then the order history should list "Pending"
 * Example #3: And the order history should list "Shipped"
 * Example #4: Then the order history should not list "Complete"
 * Example #5: Then the order history should list "Processing" with "No"
 */
Then(/^the order history should( not)? list "([^"]*)"(?: with "([^"]*)")?$/, async function (not, status, also) {
  const read = () => this.page.evaluate(() => [...document.querySelectorAll('#history tbody tr')].map((r) => r.textContent.replace(/\s+/g, ' ').trim()));
  await h.eventually(this.page, read, (rows) => rows.some((r) => h.holds(r, status) && (!also || h.holds(r, also))) === !not, async (rows) => ({
    message: not ? `The order history lists "${status}".` : `The order history does not list "${status}"${also ? ` with "${also}"` : ''}. It lists ${h.listed(rows || [])}.`,
    hint: 'The history of an order lists its statuses, newest first: the date, the comment, the status and whether the customer was notified.',
  }), h.budget(this));
});
