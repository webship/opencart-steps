'use strict';

// The cart page: the products it lists with their options, a quantity changed, a product removed, the totals, a
// coupon applied, and the cart empty.
//
// No step takes a coupon off: on the cart page of OpenCart 4.1.0.4 the "Remove" of "Use Coupon Code" does nothing (the
// page's handler for the rows' Remove links catches every red button of the cart, that one among them). A coupon
// stays in the session only, so the scenario's end has nothing of it to put back.
//
// The cart is the session's (a visitor's, or the customer's while logged in): what a scenario put in it is taken
// out again when the scenario ends (see opencart-storefront.steps.js).

const { When, Then } = require('@cucumber/cucumber');
const { friendly } = require('webship-js/tests/step-definitions/webship');
const h = require('./opencart-helpers');

/** The rows of the cart's list: [{ name, text }]. */
async function cartRows(world) {
  return world.page.evaluate(() => [...document.querySelectorAll('#shopping-cart tbody tr')].map((r) => {
    const a = r.querySelector('td a[href*="product_id"]:not(:has(img))') || [...r.querySelectorAll('td a')].find((x) => x.textContent.trim());
    return { name: a ? a.textContent.replace(/\s+/g, ' ').trim() : '', text: r.textContent.replace(/\s+/g, ' ').trim() };
  }).filter((r) => r.name));
}

/** The totals of the cart: { label: value }. */
async function cartTotals(world, scope = '#shopping-cart') {
  return world.page.evaluate((sel) => [...document.querySelectorAll(`${sel} tfoot tr, ${sel} table tr`)].map((r) => [...r.querySelectorAll('td, th')].map((c) => c.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean))
    .filter((cells) => cells.length >= 2 && /[$€£]|\d/.test(cells[cells.length - 1]))
    .map((cells) => ({ label: cells[cells.length - 2], value: cells[cells.length - 1] })), scope);
}

/** The row of the cart with a product, or a failure that says what the cart lists. */
async function cartRow(world, name) {
  const rows = world.page.locator('#shopping-cart tbody tr');
  const n = await rows.count();
  for (let i = 0; i < n; i += 1) {
    const row = rows.nth(i);
    const link = row.locator('td a').filter({ hasText: /\S/ }).first();
    if (await link.count() && h.same(await link.textContent(), name)) return row;
  }
  throw friendly({ message: `The cart has no "${name}". It lists ${h.listed((await cartRows(world)).map((r) => r.name))}.`, hint: 'Open the cart first: When I go to the cart.' });
}

/**
 * Open the cart page ("Shopping Cart" in the header).
 *
 * Example #1: When I go to the cart
 * Example #2: Given I am on the cart
 * Example #3: When we go to the cart
 * Example #4: And I go to the cart
 * Example #5: Given we are on the cart
 */
When(/^(?:(?:I|we) go to|(?:I am|we are) on) the cart$/, { timeout: 90000 }, async function () {
  await h.open(this, h.shopUrl(this, 'checkout/cart'));
});

/**
 * The cart lists a product (with a line of its own: an option, its model), or does not.
 *
 * Example #1: Then the cart should list "Canon EOS 5D"
 * Example #2: Then the cart should list "Canon EOS 5D" with "Select: Red"
 * Example #3: And the cart should not list "MacBook"
 * Example #4: Then the cart should list "iPhone" with "Model: product 11"
 * Example #5: Then the cart should list "MacBook" with "$602.00"
 */
Then(/^the cart should( not)? list "([^"]*)"(?: with "([^"]*)")?$/, async function (not, name, text) {
  await h.eventually(this.page, () => cartRows(this), (rows) => rows.some((r) => h.same(r.name, name) && (!text || h.holds(r.text, text))) === !not, async (rows) => {
    const row = (rows || []).find((r) => h.same(r.name, name));
    return {
      message: not ? `The cart lists "${name}"${text ? ` with "${text}"` : ''}.` : (row ? `The cart lists "${name}", but not with "${text}". Its row reads "${row.text}".` : `The cart does not list "${name}". It lists ${h.listed((rows || []).map((r) => r.name))}.`),
      hint: 'A row of the cart reads the product, its options (" - Select: Red"), its quantity, its unit price and its total.',
    };
  }, h.budget(this));
});

/**
 * Change the quantity of a product of the cart and press its "Update".
 *
 * Example #1: When I change the quantity of "Canon EOS 5D" in the cart to 2
 * Example #2: When we change the quantity of "MacBook" in the cart to 3
 * Example #3: And I change the quantity of "iPhone" in the cart to 1
 * Example #4: When I change the quantity of "Canon EOS 5D" in the cart to 5
 * Example #5: When I change the quantity of "MacBook" in the cart to 2
 */
When(/^(?:I|we) change the quantity of "([^"]*)" in the cart to (\d+)$/, { timeout: 90000 }, async function (name, quantity) {
  const row = await cartRow(this, name);
  await row.locator('input[name="quantity"]').fill(String(quantity));
  await h.forgetAlerts(this.page);
  await h.act(this.page, () => row.locator('button[formaction*="checkout/cart.edit"], button[type=submit]').first().click());
  // The shop answers, then reloads the list.
  await h.eventually(this.page, () => h.alerts(this.page), (a) => a.length > 0, async () => ({ message: `The shop did not answer the new quantity of "${name}": ${await h.pageSummary(this)}.` }), h.budget(this));
  await h.settle(this.page, h.budget(this));
});

/**
 * Remove a product from the cart with the "Remove" of its row.
 *
 * Example #1: When I remove "Canon EOS 5D" from the cart
 * Example #2: When we remove "MacBook" from the cart
 * Example #3: And I remove "iPhone" from the cart
 * Example #4: When I remove "HP LP3065" from the cart
 * Example #5: When we remove "Canon EOS 5D" from the cart
 */
When(/^(?:I|we) remove "([^"]*)" from the cart$/, { timeout: 90000 }, async function (name) {
  const row = await cartRow(this, name);
  await h.forgetAlerts(this.page);
  const remove = row.locator('a[href*="checkout/cart.remove"], button[formaction*="checkout/cart.remove"], .btn-danger').first();
  await h.act(this.page, () => remove.click());
  await h.eventually(this.page, () => cartRows(this), (rows) => !rows.some((r) => h.same(r.name, name)), async (rows) => ({
    message: `"${name}" is still in the cart. It lists ${h.listed((rows || []).map((r) => r.name))}.`,
  }), h.budget(this));
});

/**
 * A total of the cart, by its label ("Sub-Total", "Eco Tax (-2.00)", "VAT (20%)", "Coupon (WEBSHIP10)",
 * "Total") and its value; or a total the cart does not show. A fixed tax counts once per line of the cart here,
 * and once per item in a line's own total: the two do not always add up the same.
 *
 * Example #1: Then the cart should show "Sub-Total" as "$100.00"
 * Example #2: Then the cart should show "Total" as "$122.00"
 * Example #3: And the cart should show "VAT (20%)" as "$20.00"
 * Example #4: Then the cart should show "Coupon (WEBSHIP10)" as "$-10.00"
 * Example #5: Then the cart should not show "Coupon (WEBSHIP10)"
 */
Then(/^the cart should( not)? show "([^"]*)"(?: as "([^"]*)")?$/, async function (not, label, value) {
  if (!not && value === undefined) throw friendly({ message: `Say what the cart shows as "${label}": Then the cart should show "${label}" as "…".` });
  await h.eventually(this.page, () => cartTotals(this), (totals) => (not ? !totals.some((t) => h.same(t.label, label)) : totals.some((t) => h.same(t.label, label) && h.same(t.value, value))), async (totals) => ({
    message: not ? `The cart shows "${label}".` : `The cart does not show "${label}" as "${value}". It shows ${h.listed((totals || []).map((t) => `${t.label} ${t.value}`))}.`,
    hint: 'The totals of the cart are the lines under its list: "Sub-Total", the taxes, a coupon, "Total".',
  }), h.budget(this));
});

/** Open the cart's "Use Coupon Code" and wait until it is shown. */
async function couponPanel(world) {
  const panel = world.page.locator('#collapse-coupon');
  if (!(await panel.count())) throw friendly({ message: `The page has no "Use Coupon Code": ${await h.pageSummary(world)}.`, hint: 'Open the cart first: When I go to the cart.' });
  if (!(await panel.locator('#input-coupon').isVisible())) {
    await world.page.locator('[data-bs-target="#collapse-coupon"], [href="#collapse-coupon"]').first().click();
  }
  await panel.locator('#input-coupon').waitFor({ state: 'visible', timeout: h.budget(world) });
  // The panel opens with an animation: its buttons take clicks once it stopped.
  await world.page.waitForFunction(() => { const p = document.querySelector('#collapse-coupon'); return p && p.classList.contains('show') && !p.classList.contains('collapsing'); }, null, { timeout: h.budget(world) }).catch(() => {});
  return panel;
}

/** Press a button of "Use Coupon Code" and wait for the shop's answer and the cart's new list. */
async function couponButton(world, label, route) {
  const panel = await couponPanel(world);
  await h.forgetAlerts(world.page);
  const [answer] = await Promise.all([
    world.page.waitForResponse((r) => r.url().includes(route), { timeout: h.budget(world) }).catch(() => null),
    panel.locator('button').filter({ hasText: label }).first().click(),
  ]);
  if (!answer) throw friendly({ message: `The shop did not answer "${label}" of "Use Coupon Code": ${await h.pageSummary(world)}.` });
  await world.page.waitForTimeout(300);
  await h.settle(world.page, h.budget(world));
}

/**
 * Apply a coupon code in the cart's "Use Coupon Code". Assert the shop's answer next.
 *
 * Example #1: When I apply the coupon "WEBSHIP10"
 * Example #2: When we apply the coupon "NO-SUCH-CODE"
 * Example #3: And I apply the coupon "WEBSHIP10"
 * Example #4: When I apply the coupon "2222"
 * Example #5: When we apply the coupon "WEBSHIP10"
 */
When(/^(?:I|we) apply the coupon "([^"]*)"$/, { timeout: 90000 }, async function (code) {
  const panel = await couponPanel(this);
  await panel.locator('#input-coupon').fill(code);
  await couponButton(this, 'Apply', 'checkout/coupon.save');
});

/**
 * The cart is empty ("Your shopping cart is empty!").
 *
 * Example #1: Then the cart should be empty
 * Example #2: And the cart should be empty
 * Example #3: Then the cart should be empty
 * Example #4: But the cart should be empty
 * Example #5: Then the cart should be empty
 */
Then(/^the cart should be empty$/, async function () {
  const read = () => this.page.evaluate(() => (document.querySelector('#content') || document.body).innerText.replace(/\s+/g, ' '));
  await h.eventually(this.page, read, (text) => /Your shopping cart is empty!/i.test(text), async () => ({
    message: `The cart is not empty: it lists ${h.listed((await cartRows(this)).map((r) => r.name))}.`,
    hint: 'An empty cart page says "Your shopping cart is empty!".',
  }), h.budget(this));
});
