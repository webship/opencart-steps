'use strict';

// The checkout, one page: a visitor's details and address (guest checkout), the customer's own address, the
// shipping method and the payment method (each chosen in its dialog), the summary of the order, its confirmation and
// the page of a placed order.
//
// An order the scenario placed is taken away when the scenario ends, the shop's own way (see opencart-helpers.js:
// "Voided" through its history, then "Delete" in the orders list), so the stock, the statistics and a coupon's use
// come back with it.

const { When, Then } = require('@cucumber/cucumber');
const { friendly } = require('webship-js/tests/step-definitions/webship');
const h = require('./opencart-helpers');

/** The fields of the visitor's details and address, by the label a person reads, to their field. */
const GUEST_FIELDS = {
  'first name': '#input-firstname',
  'last name': '#input-lastname',
  'e-mail': '#input-email',
  email: '#input-email',
  telephone: '#input-telephone',
  company: '#input-shipping-company',
  'address 1': '#input-shipping-address-1',
  'address 2': '#input-shipping-address-2',
  city: '#input-shipping-city',
  'post code': '#input-shipping-postcode',
  postcode: '#input-shipping-postcode',
  country: '#input-shipping-country',
  'region / state': '#input-shipping-zone',
  region: '#input-shipping-zone',
};

/** Choose an option of a select by its text, and wait for what the choice reloads (the zones of a country). */
async function chooseByText(world, selector, text) {
  const select = world.page.locator(selector);
  await h.eventually(world.page, () => select.evaluate((s) => [...s.options].map((o) => o.textContent.replace(/\s+/g, ' ').trim())), (opts) => opts.some((o) => h.same(o, text)), async (opts) => ({
    message: `The list ${selector} has no "${text}". It has ${h.listed((opts || []).filter((o) => !/Please Select/.test(o)).slice(0, 12))}…`,
  }), h.budget(world));
  const value = await select.evaluate((s, t) => { const o = [...s.options].find((x) => x.textContent.replace(/\s+/g, ' ').trim().toLowerCase() === t.toLowerCase()); return o ? o.value : ''; }, text);
  await select.selectOption(value);
  await h.settle(world.page, h.budget(world));
}

/**
 * Open the checkout. A customer logged in checks out with its own account; the order it places is taken away when
 * the scenario ends.
 *
 * Example #1: When I go to the checkout
 * Example #2: Given I am on the checkout
 * Example #3: When we go to the checkout
 * Example #4: And I go to the checkout
 * Example #5: Given we are on the checkout
 */
When(/^(?:(?:I|we) go to|(?:I am|we are) on) the checkout$/, { timeout: 90000 }, async function () {
  await h.recordAlerts(this.page);
  await h.open(this, h.shopUrl(this, 'checkout/checkout'));
  if (this.__shopAccount) await h.touchOrders(this, this.__shopAccount.name);
});

/**
 * Check out as a guest: "Guest Checkout", the visitor's details and shipping address (a table of a label and its
 * value: First Name, Last Name, E-Mail, Address 1, City, Post Code, Country, Region / State), then "Continue".
 * Assert the shop's answer next. The order it places is taken away when the scenario ends.
 *
 * Example #1: When I check out as a guest with:
 * Example #2: When we check out as a guest with:
 * Example #3: And I check out as a guest with:
 * Example #4: When I check out as a guest with:
 * Example #5: Then we check out as a guest with:
 */
When(/^(?:I|we) check out as a guest with:$/, { timeout: 120000 }, async function (table) {
  const rows = table.raw();
  const values = {};
  for (const [label, value] of rows) values[h.clean(label).toLowerCase()] = value;
  const unknown = Object.keys(values).filter((k) => !GUEST_FIELDS[k]);
  if (unknown.length) throw friendly({ message: `The guest checkout has no field ${h.listed(unknown)}.`, hint: `Its fields: ${Object.keys(GUEST_FIELDS).join(', ')}.` });
  const name = h.clean(`${values['first name'] || ''} ${values['last name'] || ''}`);
  await h.touchOrders(this, name);
  const guest = this.page.locator('#input-guest');
  await guest.waitFor({ state: 'visible', timeout: h.budget(this) }).catch(async (err) => {
    throw friendly({ message: `The checkout offers no "Guest Checkout": ${await h.pageSummary(this)}.`, cause: err, hint: 'Open it first: When I go to the checkout. A shop that allows no guest checkout has only "Register Account".' });
  });
  await guest.check();
  await h.settle(this.page, h.budget(this));
  // The country first: it reloads the regions.
  if (values.country) await chooseByText(this, GUEST_FIELDS.country, values.country);
  for (const [label, value] of Object.entries(values)) {
    if (label === 'country') continue;
    const selector = GUEST_FIELDS[label];
    if (selector === GUEST_FIELDS.region) await chooseByText(this, selector, value);
    else await this.page.locator(selector).fill(value);
  }
  await h.forgetAlerts(this.page);
  await h.act(this.page, () => this.page.locator('#button-register').click());
  await h.eventually(this.page, async () => ({ said: await h.alerts(this.page), invalid: await this.page.locator('#form-register .invalid-feedback.d-block').allTextContents() }), (s) => s.said.length > 0 || s.invalid.some((t) => t.trim()), async () => ({
    message: `The checkout did not answer the guest's details: ${await h.pageSummary(this)}.`,
  }), h.budget(this));
});

/**
 * The customer logged in ships to one of its own addresses: "I want to use an existing address", then the address
 * by a part of it (a street, a city). Assert the shop's answer next.
 *
 * Example #1: When I ship to my address "1 Webship Street"
 * Example #2: When we ship to our address "London"
 * Example #3: And I ship to my address "1 Webship Street"
 * Example #4: When I ship to my address "SW1A 1AA"
 * Example #5: When we ship to our address "1 Webship Street"
 */
When(/^(?:I|we) ship to (?:my|our) address "([^"]*)"$/, { timeout: 90000 }, async function (part) {
  const existing = this.page.locator('#input-shipping-existing');
  if (await existing.count()) await existing.check();
  const select = this.page.locator('#input-shipping-address');
  await select.waitFor({ state: 'visible', timeout: h.budget(this) }).catch(async (err) => {
    throw friendly({ message: `The checkout offers no address of the customer's: ${await h.pageSummary(this)}.`, cause: err, hint: 'Log in first (Given I am logged in to the shop as "customer"), then open the checkout.' });
  });
  const options = await select.evaluate((sel) => [...sel.options].map((o) => ({ value: o.value, text: o.textContent.replace(/\s+/g, ' ').trim() })));
  const option = options.find((o) => o.value && h.holds(o.text, part));
  if (!option) throw friendly({ message: `The customer has no address "${part}" to ship to. Its addresses are ${h.listed(options.filter((o) => o.value).map((o) => o.text))}.` });
  await h.forgetAlerts(this.page);
  await select.selectOption(option.value);
  await h.eventually(this.page, () => h.alerts(this.page), (a) => a.length > 0, async () => ({ message: `The checkout did not answer the address "${part}": ${await h.pageSummary(this)}.` }), h.budget(this));
  await h.settle(this.page, h.budget(this));
});

/**
 * A field of the checkout says what is wrong with it, by the label a person reads.
 *
 * Example #1: Then the checkout field "E-Mail" should say "E-Mail Address does not appear to be valid!"
 * Example #2: Then the checkout field "First Name" should say "First Name must be between 1 and 32 characters!"
 * Example #3: And the checkout field "City" should say "City must be between 2 and 128 characters!"
 * Example #4: Then the checkout field "Post Code" should say "Postcode must be between 2 and 10 characters!"
 * Example #5: Then the checkout field "Region / State" should say "Please select a region / state!"
 */
Then(/^the checkout field "([^"]*)" should say "([^"]*)"$/, async function (label, expected) {
  const selector = GUEST_FIELDS[h.clean(label).toLowerCase()];
  if (!selector) throw friendly({ message: `The checkout has no field "${label}".`, hint: `Its fields: ${Object.keys(GUEST_FIELDS).join(', ')}.` });
  const id = selector.replace('#input-', '#error-');
  const read = async () => h.clean(await this.page.locator(id).textContent().catch(() => ''));
  await h.eventually(this.page, read, (text) => h.holds(text, expected), async (text) => ({
    message: `The checkout field "${label}" does not say "${expected}". It says "${text || '(nothing)'}".`,
    hint: 'A field the checkout refuses says why under it once "Continue" is pressed.',
  }), h.budget(this));
});

/** Choose a method in the checkout's dialog ("Shipping method options", "Payment method options"). */
async function chooseMethod(world, kind, name) {
  const button = world.page.locator(`#button-${kind}-methods`);
  await button.waitFor({ state: 'visible', timeout: h.budget(world) }).catch(async (err) => {
    throw friendly({ message: `The checkout has no "Choose" for its ${kind} method: ${await h.pageSummary(world)}.`, cause: err });
  });
  await h.forgetAlerts(world.page);
  await h.act(world.page, () => button.click());
  const modal = world.page.locator(`#modal-${kind}`);
  const error = world.page.locator(`#error-${kind}-method`);
  const said = await h.eventually(world.page, async () => ({ shown: await modal.isVisible().catch(() => false), said: (await h.alerts(world.page)).map((a) => a.text), why: h.clean(await error.textContent().catch(() => '')) }), (s) => s.shown || s.said.length > 0 || Boolean(s.why), async () => ({
    message: `The checkout did not open its ${kind} methods: ${await h.pageSummary(world)}.`,
  }), h.budget(world));
  if (!said.shown) throw friendly({ message: `The checkout offers no ${kind} method: it says ${h.listed([...said.said, said.why])}.`, hint: 'Give the address first: the guest\'s details, or the customer\'s own (When I ship to my address "…").' });
  const options = modal.locator('input[type=radio]');
  const n = await options.count();
  const seen = [];
  for (let i = 0; i < n; i += 1) {
    const option = options.nth(i);
    const text = h.clean(await option.evaluate((el) => (el.closest('.form-check') || el.parentNode).textContent));
    seen.push(text);
    if (h.same(text, name) || h.same(text.replace(/\s+-\s+[^-]*$/, ''), name)) {
      await option.check();
      await h.act(world.page, () => modal.locator('button').filter({ hasText: 'Continue' }).first().click());
      await h.eventually(world.page, () => h.alerts(world.page), (a) => a.length > 0, async () => ({ message: `The checkout did not answer the ${kind} method "${name}": ${await h.pageSummary(world)}.` }), h.budget(world));
      return;
    }
  }
  throw friendly({ message: `The checkout has no ${kind} method "${name}". It offers ${h.listed(seen)}.` });
}

/**
 * Choose the shipping method of the order in its dialog, by its name ("Flat Shipping Rate").
 *
 * Example #1: When I choose the shipping method "Flat Shipping Rate"
 * Example #2: When we choose the shipping method "Flat Shipping Rate"
 * Example #3: And I choose the shipping method "Flat Shipping Rate - $8.00"
 * Example #4: When I choose the shipping method "Free Shipping"
 * Example #5: When we choose the shipping method "Pickup From Store"
 */
When(/^(?:I|we) choose the shipping method "([^"]*)"$/, { timeout: 90000 }, async function (name) {
  await chooseMethod(this, 'shipping', name);
});

/**
 * Choose the payment method of the order in its dialog, by its name ("Cash On Delivery", "Bank Transfer").
 *
 * Example #1: When I choose the payment method "Cash On Delivery"
 * Example #2: When we choose the payment method "Bank Transfer"
 * Example #3: And I choose the payment method "Cash On Delivery"
 * Example #4: When I choose the payment method "Bank Transfer"
 * Example #5: When we choose the payment method "Cash On Delivery"
 */
When(/^(?:I|we) choose the payment method "([^"]*)"$/, { timeout: 90000 }, async function (name) {
  await chooseMethod(this, 'payment', name);
});

/**
 * A line of the order's summary at the bottom of the checkout ("Sub-Total", "Flat Shipping Rate", "VAT (20%)",
 * "Total"), with its value.
 *
 * Example #1: Then the order summary should show "Total" as "$130.00"
 * Example #2: Then the order summary should show "Flat Shipping Rate" as "$5.00"
 * Example #3: And the order summary should show "Sub-Total" as "$100.00"
 * Example #4: Then the order summary should show "VAT (20%)" as "$21.00"
 * Example #5: Then the order summary should show "Coupon (WEBSHIP10)" as "$-10.00"
 */
Then(/^the order summary should show "([^"]*)" as "([^"]*)"$/, async function (label, value) {
  const read = () => this.page.evaluate(() => [...document.querySelectorAll('#checkout-confirm tfoot tr, #checkout-confirm table tr')].map((r) => [...r.querySelectorAll('td, th')].map((c) => c.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean)).filter((c) => c.length >= 2).map((c) => ({ label: c[c.length - 2], value: c[c.length - 1] })));
  await h.eventually(this.page, read, (lines) => lines.some((l) => h.same(l.label, label) && h.same(l.value, value)), async (lines) => ({
    message: `The order summary does not show "${label}" as "${value}". It shows ${h.listed((lines || []).map((l) => `${l.label} ${l.value}`))}.`,
    hint: 'The summary under the checkout lists the products and the totals once the shipping and the payment methods are chosen.',
  }), h.budget(this));
});

/**
 * Press the payment's "Confirm Order" and wait for the shop's page of a placed order (or its refusal). The order
 * is taken away when the scenario ends.
 *
 * Example #1: When I confirm the order
 * Example #2: When we confirm the order
 * Example #3: And I confirm the order
 * Example #4: Then I confirm the order
 * Example #5: When we confirm the order
 */
When(/^(?:I|we) confirm the order$/, { timeout: 120000 }, async function () {
  await h.touchOrders(this, this.__shopAccount ? this.__shopAccount.name : '');
  const button = this.page.locator('#checkout-payment #button-confirm, #button-confirm');
  await button.first().waitFor({ state: 'visible', timeout: h.budget(this) }).catch(async (err) => {
    throw friendly({ message: `The checkout has no "Confirm Order" yet: ${await h.pageSummary(this)}.`, cause: err, hint: 'Choose the shipping and the payment methods first: the payment\'s button comes with them.' });
  });
  await h.forgetAlerts(this.page);
  await Promise.all([
    this.page.waitForURL(/route=checkout\/success/, { timeout: h.budget(this) * 2 }).catch(() => {}),
    button.first().click(),
  ]);
  await h.settle(this.page, h.budget(this));
});

/**
 * The shop placed the order: its page "Your order has been placed!".
 *
 * Example #1: Then the order should be placed
 * Example #2: And the order should be placed
 * Example #3: Then the order should be placed
 * Example #4: But the order should be placed
 * Example #5: Then the order should be placed
 */
Then(/^the order should be placed$/, async function () {
  await h.eventually(this.page, () => h.heading(this.page), (text) => /Your order has been placed!/i.test(text), async () => ({
    message: `The order was not placed: ${await h.pageSummary(this)}.`,
    hint: 'A placed order opens the page "Your order has been placed!"; a refusal stays on the checkout with its reason above.',
  }), h.budget(this));
});
