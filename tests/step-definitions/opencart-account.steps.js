'use strict';

// The customer's account: its pages by the links of "My Account", the address book (an address added, its
// default, one deleted), the order history (the order the scenario placed and its status), and the wish list (what
// it lists, a product removed).
//
// Every page of the account carries the session's customer_token: the steps follow the account's own links. An
// address the scenario adds goes when it ends; a product it puts in the wish list too.

const { When, Then } = require('@cucumber/cucumber');
const { friendly } = require('webship-js/tests/step-definitions/webship');
const h = require('./opencart-helpers');

/** The address fields of the account's address form, by the label a person reads. */
const ADDRESS_FIELDS = {
  'first name': '#input-firstname',
  'last name': '#input-lastname',
  company: '#input-company',
  'address 1': '#input-address-1',
  'address 2': '#input-address-2',
  city: '#input-city',
  'post code': '#input-postcode',
  postcode: '#input-postcode',
  country: '#input-country',
  'region / state': '#input-zone',
  region: '#input-zone',
};

/** Open a page of the account by the link a person follows on "My Account" ("Address Book", "Wish List", …). */
async function openAccountPage(world, label) {
  const token = h.customerToken(world);
  await h.open(world, h.shopUrl(world, 'account/account', `customer_token=${token}`));
  const links = await world.page.evaluate(() => [...document.querySelectorAll('#content a, #column-right a, aside a')].map((a) => ({ text: a.textContent.replace(/\s+/g, ' ').trim(), href: a.href })).filter((l) => /route=account\//.test(l.href)));
  const link = links.find((l) => h.same(l.text, label));
  if (!link) throw friendly({ message: `"My Account" has no link "${label}". It has ${h.listed([...new Set(links.map((l) => l.text))])}.`, hint: 'The account\'s pages are the links of "My Account" and of its column: "Address Book", "Wish List", "Order History".' });
  await h.open(world, link.href);
}

/** The rows of the address book: [{ text, edit, remove }]. */
async function addressRows(world) {
  return world.page.evaluate(() => [...document.querySelectorAll('#address tr, #content table tr')].map((r) => ({
    text: r.textContent.replace(/\s+/g, ' ').trim(),
    edit: (r.querySelector('a[href*="account/address.form"]') || {}).href || '',
    remove: (r.querySelector('a[href*="account/address.delete"]') || {}).href || '',
  })).filter((r) => r.text));
}

/**
 * Open a page of the customer's account by the link of "My Account": "Address Book", "Wish List", "Order History",
 * "Edit Account", "Newsletter".
 *
 * Example #1: When I open "Address Book" in my account
 * Example #2: When we open "Wish List" in our account
 * Example #3: And I open "Order History" in my account
 * Example #4: When I open "Edit Account" in my account
 * Example #5: When I open "Newsletter" in my account
 */
When(/^(?:I|we) open "([^"]*)" in (?:my|our) account$/, { timeout: 90000 }, async function (label) {
  await openAccountPage(this, label);
});

/**
 * The address book lists an address (by a part of it: a street, a city), or does not; "as the default" checks it
 * is the default one.
 *
 * Example #1: Then my address book should list "1 Webship Street"
 * Example #2: Then my address book should list "1 Webship Street" as the default
 * Example #3: And our address book should not list "3 Webship Lane"
 * Example #4: Then my address book should list "Manchester"
 * Example #5: Then my address book should list "3 Webship Lane" as the default
 */
Then(/^(?:my|our) address book should( not)? list "([^"]*)"( as the default)?$/, async function (not, part, asDefault) {
  await h.eventually(this.page, () => addressRows(this), (rows) => rows.some((r) => h.holds(r.text, part) && (!asDefault || /Default/.test(r.text))) === !not, async (rows) => ({
    message: not ? `The address book lists "${part}".` : `The address book does not list "${part}"${asDefault ? ' as the default' : ''}. It lists ${h.listed((rows || []).map((r) => r.text))}.`,
    hint: 'Open it first: When I open "Address Book" in my account. Each address is a row, the default one marked "Default".',
  }), h.budget(this));
});

/**
 * Add an address with the address book's "New Address" (a table of a label and its value: First Name, Last Name,
 * Address 1, City, Post Code, Country, Region / State, and "Default Address" Yes or No), then "Continue". The
 * address goes when the scenario ends.
 *
 * Example #1: When I add the address:
 * Example #2: When we add the address:
 * Example #3: And I add the address:
 * Example #4: When I add the address:
 * Example #5: Then we add the address:
 */
When(/^(?:I|we) add the address:$/, { timeout: 120000 }, async function (table) {
  const token = h.customerToken(this);
  const values = {};
  for (const [label, value] of table.raw()) values[h.clean(label).toLowerCase()] = value;
  const unknown = Object.keys(values).filter((k) => !ADDRESS_FIELDS[k] && k !== 'default address');
  if (unknown.length) throw friendly({ message: `The address form has no field ${h.listed(unknown)}.`, hint: `Its fields: ${Object.keys(ADDRESS_FIELDS).join(', ')}, default address.` });
  await h.open(this, h.shopUrl(this, 'account/address.form', `customer_token=${token}`));
  const form = this.page.locator('#form-address');
  await form.waitFor({ state: 'visible', timeout: h.budget(this) });
  const choose = async (selector, text) => {
    const select = this.page.locator(selector);
    await h.eventually(this.page, () => select.evaluate((s) => [...s.options].map((o) => o.textContent.replace(/\s+/g, ' ').trim())), (o) => o.some((x) => h.same(x, text)), async (o) => ({ message: `The list ${selector} has no "${text}". It has ${h.listed((o || []).slice(0, 10))}…` }), h.budget(this));
    const value = await select.evaluate((s, t) => { const o = [...s.options].find((x) => x.textContent.replace(/\s+/g, ' ').trim().toLowerCase() === t.toLowerCase()); return o ? o.value : ''; }, text);
    await select.selectOption(value);
    await h.settle(this.page, h.budget(this));
  };
  if (values.country) await choose(ADDRESS_FIELDS.country, values.country);
  for (const [label, value] of Object.entries(values)) {
    if (label === 'country') continue;
    if (label === 'default address') {
      await this.page.locator(/^y/i.test(value) ? '#input-default-yes' : '#input-default-no').check();
    } else if (ADDRESS_FIELDS[label] === ADDRESS_FIELDS.region) {
      await choose(ADDRESS_FIELDS.region, value);
    } else {
      await this.page.locator(ADDRESS_FIELDS[label]).fill(value);
    }
  }
  const street = values['address 1'];
  if (street) {
    h.afterScenario(this, async () => {
      const page = this.page;
      if (!page || page.isClosed()) return;
      const html = await (await page.request.get(h.shopUrl(this, 'account/address', `customer_token=${token}`), { failOnStatusCode: false })).text();
      for (const row of html.split(/<tr[\s>]/).slice(1)) {
        if (!h.holds(row.replace(/<[^>]+>/g, ' '), street)) continue;
        const id = (row.match(/account\/address\.delete(?:&amp;|&)[^"']*address_id=(\d+)/) || [])[1];
        if (id) await page.request.get(h.shopUrl(this, 'account/address.delete', `customer_token=${token}&address_id=${id}`), { failOnStatusCode: false });
      }
    });
  }
  await h.forgetAlerts(this.page);
  await h.act(this.page, () => this.page.locator('button[form="form-address"], #form-address button[type=submit]').first().click());
  await h.eventually(this.page, async () => ({ said: await h.alerts(this.page), url: this.page.url() }), (s) => s.said.length > 0 || /route=account\/address(&|$)/.test(s.url), async () => ({
    message: `The address book did not answer the new address: ${await h.pageSummary(this)}.`,
  }), h.budget(this));
});

/**
 * Delete an address of the address book with the delete button of its row (a part of it names it).
 *
 * Example #1: When I delete the address "3 Webship Lane"
 * Example #2: When we delete the address "Manchester"
 * Example #3: And I delete the address "3 Webship Lane"
 * Example #4: When I delete the address "M1 1AE"
 * Example #5: When we delete the address "3 Webship Lane"
 */
When(/^(?:I|we) delete the address "([^"]*)"$/, { timeout: 90000 }, async function (part) {
  const rows = await addressRows(this);
  const row = rows.find((r) => h.holds(r.text, part));
  if (!row || !row.remove) throw friendly({ message: `The address book has no address "${part}" to delete. It lists ${h.listed(rows.map((r) => r.text))}.`, hint: 'Open it first: When I open "Address Book" in my account.' });
  await h.forgetAlerts(this.page);
  const link = this.page.locator(`a[href="${row.remove.replace(h.siteRoot(this), '').replace(/"/g, '\\"')}"], a[href*="address_id=${row.remove.match(/address_id=(\d+)/)[1]}"][href*="address.delete"]`).first();
  await h.act(this.page, () => link.click());
  await h.eventually(this.page, () => h.alerts(this.page), (a) => a.length > 0, async () => ({ message: `The address book did not answer the deletion: ${await h.pageSummary(this)}.` }), h.budget(this));
});

/**
 * The order history lists the order the scenario placed, with its status, or the history is empty.
 *
 * Example #1: Then my order history should list my order as "Pending"
 * Example #2: Then our order history should list our order as "Processing"
 * Example #3: And my order history should list my order as "Pending"
 * Example #4: Then my order history should be empty
 * Example #5: Then our order history should be empty
 */
Then(/^(?:my|our) order history should (?:list (?:my|our) order as "([^"]*)"|(be empty))$/, async function (status, empty) {
  const read = () => this.page.evaluate(() => ({ rows: [...document.querySelectorAll('#content table tbody tr, #order tbody tr')].map((r) => r.textContent.replace(/\s+/g, ' ').trim()), text: (document.querySelector('#content') || document.body).innerText.replace(/\s+/g, ' ') }));
  if (empty) {
    await h.eventually(this.page, read, (s) => /You have not made any previous orders!/.test(s.text), async (s) => ({ message: `The order history is not empty: it lists ${h.listed((s && s.rows) || [])}.` }), h.budget(this));
    return;
  }
  const since = this.shopOrders && this.shopOrders.since;
  await h.eventually(this.page, read, (s) => s.rows.some((r) => {
    const id = Number((r.match(/#?(\d+)/) || [])[1] || 0);
    return (!since || id > since) && h.holds(r, status);
  }), async (s) => ({
    message: `The order history does not list the order of this scenario as "${status}". It lists ${h.listed((s && s.rows) || [])}.`,
    hint: 'Open it first: When I open "Order History" in my account. The scenario must place the order first.',
  }), h.budget(this));
});

/**
 * The wish list lists a product, or does not.
 *
 * Example #1: Then my wish list should list "iPhone"
 * Example #2: Then our wish list should not list "MacBook"
 * Example #3: And my wish list should list "Canon EOS 5D"
 * Example #4: Then my wish list should not list "iPhone"
 * Example #5: Then my wish list should list "MacBook Air"
 */
Then(/^(?:my|our) wish list should( not)? list "([^"]*)"$/, async function (not, name) {
  const read = () => this.page.evaluate(() => [...document.querySelectorAll('#wishlist tbody tr, #wishlist table tr')].map((r) => { const a = [...r.querySelectorAll('a')].find((x) => x.textContent.trim()); return a ? a.textContent.replace(/\s+/g, ' ').trim() : ''; }).filter(Boolean));
  await h.eventually(this.page, read, (names) => names.some((n) => h.same(n, name)) === !not, async (names) => ({
    message: not ? `The wish list lists "${name}".` : `The wish list does not list "${name}". It lists ${h.listed(names || [])}.`,
    hint: 'Open it first: When I open "Wish List" in my account.',
  }), h.budget(this));
});

/**
 * Remove a product from the wish list with the remove button of its row.
 *
 * Example #1: When I remove "iPhone" from my wish list
 * Example #2: When we remove "MacBook" from our wish list
 * Example #3: And I remove "Canon EOS 5D" from my wish list
 * Example #4: When I remove "iPhone" from my wish list
 * Example #5: When we remove "MacBook Air" from our wish list
 */
When(/^(?:I|we) remove "([^"]*)" from (?:my|our) wish list$/, { timeout: 90000 }, async function (name) {
  const rows = this.page.locator('#wishlist tbody tr, #wishlist table tr');
  const n = await rows.count();
  for (let i = 0; i < n; i += 1) {
    const row = rows.nth(i);
    const names = await row.locator('a').allTextContents();
    if (!names.some((t) => h.same(t, name))) continue;
    await h.forgetAlerts(this.page);
    await h.act(this.page, () => row.locator('a[href*="wishlist.remove"], button[formaction*="wishlist.remove"], .btn-danger').first().click());
    await h.eventually(this.page, () => h.alerts(this.page), (a) => a.length > 0, async () => ({ message: `The wish list did not answer the removal of "${name}": ${await h.pageSummary(this)}.` }), h.budget(this));
    return;
  }
  throw friendly({ message: `The wish list has no "${name}" to remove.`, hint: 'Open it first: When I open "Wish List" in my account.' });
});
