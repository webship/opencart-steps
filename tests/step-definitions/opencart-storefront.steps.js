'use strict';

// The storefront: a category of the menu, the search, the product lists (their products, their order, what a
// product box reads), a product's page (its details, its options, its quantity), "Add to Cart" from the page or
// from a list, the wish list button, the shop's answers and the header's cart button.
//
// What a scenario puts in the cart is taken out again when it ends (the cart's own "Remove", in the scenario's
// session): a visitor's cart and the customer's are as they were.

const { When, Then } = require('@cucumber/cucumber');
const { friendly } = require('webship-js/tests/step-definitions/webship');
const h = require('./opencart-helpers');

/** The products of a list on the page: [{ name, text, href }]. */
async function productBoxes(world) {
  return world.page.evaluate(() => [...document.querySelectorAll('.product-thumb')].map((p) => {
    const a = p.querySelector('h4 a, .description h4 a, .caption h4 a');
    return { name: a ? a.textContent.replace(/\s+/g, ' ').trim() : '', text: p.innerText.replace(/\s+/g, ' ').trim(), href: a ? a.href : '' };
  }));
}

/** Empty the cart of the scenario's browser when the scenario ends, with the cart's own "Remove" (once a scenario). */
function cartRestore(world) {
  if (world.__cartRestore) return;
  world.__cartRestore = true;
  h.afterScenario(world, async () => {
    const page = world.page;
    if (!page || page.isClosed()) return;
    for (let round = 0; round < 20; round += 1) {
      const html = await (await page.request.get(h.shopUrl(world, 'checkout/cart'), { failOnStatusCode: false })).text();
      const keys = [...html.matchAll(/route=checkout\/cart\.remove(?:&amp;|&)[^"']*?key=(\d+)/g)].map((m) => m[1]);
      if (!keys.length) return;
      await page.request.get(h.shopUrl(world, 'checkout/cart.remove', `key=${keys[0]}`), { failOnStatusCode: false });
    }
    throw new Error('The cart of the scenario could not be emptied.');
  });
}

/**
 * Open a category from the shop's menu, by its name ("Desktops", "Laptops & Notebooks", "Components").
 *
 * Example #1: When I go to the category "Desktops"
 * Example #2: Given I am on the category "Laptops & Notebooks"
 * Example #3: When we go to the category "Components"
 * Example #4: And I go to the category "MP3 Players"
 * Example #5: Given we are on the category "Tablets"
 */
When(/^(?:(?:I|we) go to|(?:I am|we are) on) the category "([^"]*)"$/, { timeout: 90000 }, async function (name) {
  await h.open(this, h.shopUrl(this, 'common/home'));
  const links = await this.page.evaluate(() => [...document.querySelectorAll('#menu a')].map((a) => ({ text: a.textContent.replace(/\s+/g, ' ').trim(), href: a.href })).filter((l) => /route=product\/category/.test(l.href)));
  const link = links.find((l) => h.same(l.text, name)) || links.find((l) => h.same(l.text.replace(/^Show All\s+/i, ''), name));
  if (!link) throw friendly({ message: `The shop's menu has no category "${name}". It has ${h.listed([...new Set(links.map((l) => l.text))])}.`, hint: 'The menu lists the categories set to show in the top menu (Catalog > Categories, "Top").' });
  await h.open(this, link.href);
  cartRestore(this);
});

/**
 * Search the shop with the search box of its header.
 *
 * Example #1: When I search the shop for "Apple"
 * Example #2: When we search the shop for "MacBook"
 * Example #3: And I search the shop for "Canon"
 * Example #4: When I search the shop for "nothing like this"
 * Example #5: When I search the shop for "iPhone"
 */
When(/^(?:I|we) search the shop for "([^"]*)"$/, { timeout: 90000 }, async function (words) {
  if (!/route=/.test(this.page.url()) || /admin\//.test(this.page.url())) await h.open(this, h.shopUrl(this, 'common/home'));
  const box = this.page.locator('#search input[name="search"], header input[name="search"]').first();
  await box.waitFor({ state: 'visible', timeout: h.budget(this) }).catch(async (err) => {
    throw friendly({ message: `The shop's search box did not appear: ${await h.pageSummary(this)}.`, cause: err });
  });
  await box.fill(words);
  await h.act(this.page, () => Promise.all([this.page.waitForURL(/route=product\/search/, { timeout: h.budget(this) }).catch(() => {}), box.press('Enter')]));
  cartRestore(this);
});

/**
 * The product list on the page (a category, a search) shows a product, or does not.
 *
 * Example #1: Then the product list should show "Canon EOS 5D"
 * Example #2: Then the product list should not show "MacBook"
 * Example #3: And the product list should show "iMac"
 * Example #4: Then the product list should show "MacBook Air"
 * Example #5: But the product list should not show "Nokia"
 */
Then(/^the product list should( not)? show "([^"]*)"$/, async function (not, name) {
  await h.eventually(this.page, () => productBoxes(this), (all) => all.some((p) => h.same(p.name, name)) === !not, async (all) => ({
    message: not ? `The product list shows "${name}".` : `The product list does not show "${name}". It shows ${h.listed((all || []).map((p) => p.name))}${(all || []).length ? '' : ` (${await h.pageSummary(this)})`}.`,
    hint: 'A product box reads its name; a search keeps the products whose name holds the words.',
  }), h.budget(this));
});

/**
 * The product list shows these products first, in this order.
 *
 * Example #1: Then the product list should show "iMac", "MacBook" in this order
 * Example #2: Then the product list should show "Canon EOS 5D", "Nikon D300" in this order
 * Example #3: And the product list should show "MacBook", "MacBook Air" in this order
 * Example #4: Then the product list should show "HP LP3065", "MacBook Pro" in this order
 * Example #5: Then the product list should show "Canon EOS 5D", "HP LP3065" in this order
 */
Then(/^the product list should show ((?:"[^"]*",? ?)+) in this order$/, async function (list) {
  const wanted = h.quoted(list);
  await h.eventually(this.page, () => productBoxes(this), (all) => wanted.every((n, i) => all[i] && h.same(all[i].name, n)), async (all) => ({
    message: `The product list does not show ${h.listed(wanted)} in this order. It shows ${h.listed((all || []).map((p) => p.name))}.`,
    hint: 'The order is the list\'s own: a category sorts by its "Sort By" (the default first), a search by relevance.',
  }), h.budget(this));
});

/**
 * A product box of the list reads a text: its price ("$602.00"), "Ex Tax: $500.00", its description.
 *
 * Example #1: Then the product "MacBook" of the list should read "$602.00"
 * Example #2: Then the product "MacBook" of the list should read "Ex Tax: $500.00"
 * Example #3: And the product "iPhone" of the list should read "$123.20"
 * Example #4: Then the product "Canon EOS 5D" of the list should not read "$1,000.00"
 * Example #5: Then the product "HP LP3065" of the list should read "Ex Tax: $100.00"
 */
Then(/^the product "([^"]*)" of the list should( not)? read "([^"]*)"$/, async function (name, not, text) {
  await h.eventually(this.page, () => productBoxes(this), (all) => {
    const p = all.find((x) => h.same(x.name, name));
    return Boolean(p) && h.holds(p.text, text) === !not;
  }, async (all) => {
    const p = (all || []).find((x) => h.same(x.name, name));
    return {
      message: p ? `The product "${name}" of the list ${not ? 'reads' : 'does not read'} "${text}". It reads "${p.text}".` : `The list has no product "${name}". It has ${h.listed((all || []).map((x) => x.name))}.`,
      hint: 'A product box reads its name, its description, its price with the tax and "Ex Tax: …", and its buttons.',
    };
  }, h.budget(this));
});

/**
 * Open a product's page by its name, through the shop's search.
 *
 * Example #1: When I go to the product "Canon EOS 5D"
 * Example #2: Given I am on the product "MacBook"
 * Example #3: When we go to the product "iPhone"
 * Example #4: And I go to the product "HP LP3065"
 * Example #5: Given we are on the product "MacBook Air"
 */
When(/^(?:(?:I|we) go to|(?:I am|we are) on) the product "([^"]*)"$/, { timeout: 90000 }, async function (name) {
  await h.open(this, h.shopUrl(this, 'product/search', `search=${encodeURIComponent(name)}`));
  const boxes = await productBoxes(this);
  const box = boxes.find((p) => h.same(p.name, name));
  if (!box) throw friendly({ message: `The shop has no product "${name}": its search finds ${h.listed(boxes.map((p) => p.name))}.`, hint: 'The product is found by its name, as the storefront shows it (a disabled product is not on the storefront).' });
  await h.open(this, box.href);
  cartRestore(this);
});

/**
 * A detail of the product's page, by its label: "Brand", "Product Code", "Reward Points", "Availability".
 *
 * Example #1: Then the product page should show "Brand" as "Apple"
 * Example #2: Then the product page should show "Availability" as "In Stock"
 * Example #3: And the product page should show "Product Code" as "Product 3"
 * Example #4: Then the product page should show "Reward Points" as "200"
 * Example #5: Then the product page should show "Brand" as "Canon"
 */
Then(/^the product page should show "([^"]*)" as "([^"]*)"$/, async function (label, value) {
  const read = () => this.page.evaluate(() => [...document.querySelectorAll('#content ul.list-unstyled li')].map((li) => li.textContent.replace(/\s+/g, ' ').trim()));
  await h.eventually(this.page, read, (items) => items.some((t) => h.same(t, `${label}: ${value}`)), async (items) => ({
    message: `The product page does not show "${label}" as "${value}". It shows ${h.listed(items || [])}.`,
    hint: 'The details of a product are the lines "Brand: …", "Product Code: …", "Availability: …" beside its image.',
  }), h.budget(this));
});

/** The option block of the product form with a label. */
async function optionBlock(world, label) {
  const blocks = world.page.locator('#form-product .mb-3, #form-product .form-group');
  const count = await blocks.count();
  const labels = [];
  for (let i = 0; i < count; i += 1) {
    const b = blocks.nth(i);
    const text = h.clean(await b.locator('label').first().textContent().catch(() => ''));
    if (text) labels.push(text);
    if (h.same(text, label)) return b;
  }
  throw friendly({ message: `The product has no option "${label}". Its options are ${h.listed(labels.filter((l) => !/^Qty|^Quantity/i.test(l)))}.`, hint: 'An option is named by its label on the product page ("Select", "Radio", "Size").' });
}

/**
 * Choose a value of an option of the product, by the option's label: a list, a choice or a box to tick.
 *
 * Example #1: When I choose "Red" for the option "Select"
 * Example #2: When we choose "Medium" for the option "Radio"
 * Example #3: And I choose "Checkbox 2" for the option "Checkbox"
 * Example #4: When I choose "Blue" for the option "Select"
 * Example #5: When I choose "Small" for the option "Radio"
 */
When(/^(?:I|we) choose "([^"]*)" for the option "([^"]*)"$/, async function (value, label) {
  const block = await optionBlock(this, label);
  const select = block.locator('select');
  if (await select.count()) {
    const options = await select.first().evaluate((s) => [...s.options].map((o) => ({ value: o.value, text: o.textContent.replace(/\s+/g, ' ').trim() })));
    const option = options.find((o) => h.same(o.text.replace(/\s*\([^)]*\)\s*$/, ''), value) || h.same(o.text, value));
    if (!option) throw friendly({ message: `The option "${label}" has no "${value}". It has ${h.listed(options.map((o) => o.text).filter((t) => !/Please Select/.test(t)))}.` });
    await select.first().selectOption(option.value);
    return;
  }
  const choices = block.locator('input[type=radio], input[type=checkbox]');
  const n = await choices.count();
  const seen = [];
  for (let i = 0; i < n; i += 1) {
    const input = choices.nth(i);
    const text = h.clean(await input.evaluate((el) => (el.closest('.form-check') || el.parentNode).textContent));
    seen.push(text);
    if (h.same(text.replace(/\s*\([^)]*\)\s*$/, ''), value) || h.same(text, value)) {
      await input.check();
      return;
    }
  }
  throw friendly({ message: `The option "${label}" has no "${value}". It has ${h.listed(seen)}.` });
});

/**
 * Press "Add to Cart" on the product's page, with a quantity when one is named. Assert the shop's answer next.
 *
 * Example #1: When I add the product to the cart
 * Example #2: When I add the product to the cart with a quantity of 3
 * Example #3: And we add the product to the cart
 * Example #4: When we add the product to the cart with a quantity of 2
 * Example #5: When I add the product to the cart with a quantity of 1
 */
When(/^(?:I|we) add the product to the cart(?: with a quantity of (\d+))?$/, { timeout: 90000 }, async function (quantity) {
  cartRestore(this);
  await h.recordAlerts(this.page);
  await h.forgetAlerts(this.page);
  if (quantity) await this.page.locator('#form-product input[name="quantity"]').fill(String(quantity));
  const button = this.page.locator('#button-cart');
  await button.waitFor({ state: 'visible', timeout: h.budget(this) }).catch(async (err) => {
    throw friendly({ message: `The page has no "Add to Cart" button: ${await h.pageSummary(this)}.`, cause: err, hint: 'Open a product first: When I go to the product "…".' });
  });
  await h.act(this.page, () => button.click());
  // The shop answers with an alert, or marks the options it still asks for.
  await h.eventually(this.page, async () => ({ said: await h.alerts(this.page), invalid: await this.page.locator('#form-product .invalid-feedback:visible, #form-product .text-danger:visible').count() }), (s) => s.said.length > 0 || s.invalid > 0, async () => ({
    message: `The shop did not answer "Add to Cart": ${await h.pageSummary(this)}.`,
    hint: 'The product page sends "Add to Cart" by Ajax and answers above the content, or under an option it asks for.',
  }), h.budget(this));
});

/**
 * Press "Add to Cart" on a product box of the list on the page. A product with options it asks for opens its page
 * instead.
 *
 * Example #1: When I add "iPhone" to the cart from the list
 * Example #2: When we add "MacBook" to the cart from the list
 * Example #3: And I add "iMac" to the cart from the list
 * Example #4: When I add "Canon EOS 5D" to the cart from the list
 * Example #5: When we add "HTC Touch HD" to the cart from the list
 */
When(/^(?:I|we) add "([^"]*)" to the cart from the list$/, { timeout: 90000 }, async function (name) {
  cartRestore(this);
  await h.recordAlerts(this.page);
  await h.forgetAlerts(this.page);
  const boxes = this.page.locator('.product-thumb');
  const n = await boxes.count();
  for (let i = 0; i < n; i += 1) {
    const box = boxes.nth(i);
    if (h.same(await box.locator('h4 a').first().textContent().catch(() => ''), name)) {
      await h.act(this.page, () => box.locator('button[formaction*="checkout/cart.add"], button[title="Add to Cart"]').first().click());
      await this.page.waitForTimeout(300);
      await h.settle(this.page, h.budget(this));
      return;
    }
  }
  throw friendly({ message: `The list has no product "${name}". It has ${h.listed((await productBoxes(this)).map((p) => p.name))}.` });
});

/**
 * Press "Add to Wish List" on the product's page. The wish list of the customer logged in gets it back out when
 * the scenario ends.
 *
 * Example #1: When I add the product to my wish list
 * Example #2: When we add the product to our wish list
 * Example #3: And I add the product to my wish list
 * Example #4: When I add the product to my wish list
 * Example #5: Then we add the product to our wish list
 */
When(/^(?:I|we) add the product to (?:my|our) wish list$/, { timeout: 90000 }, async function () {
  await h.recordAlerts(this.page);
  await h.forgetAlerts(this.page);
  const id = await this.page.locator('#form-product input[name="product_id"]').inputValue().catch(() => '');
  const button = this.page.locator('#content button[formaction*="account/wishlist.add"], #content button[title="Add to Wish List"]').first();
  if (!(await button.count())) throw friendly({ message: `The page has no "Add to Wish List" button: ${await h.pageSummary(this)}.`, hint: 'Open a product first: When I go to the product "…".' });
  await h.act(this.page, () => button.click());
  if (id && this.__customerToken) {
    h.afterScenario(this, async () => {
      const page = this.page;
      if (!page || page.isClosed()) return;
      await page.request.get(h.shopUrl(this, 'account/wishlist.remove', `product_id=${id}&customer_token=${this.__customerToken}`), { failOnStatusCode: false });
    });
  }
});

/**
 * The shop answers with an alert holding a text ("Success: You have added …", "Warning: …"), on the storefront
 * and in the administration.
 *
 * Example #1: Then the shop should say "Success: You have added Canon EOS 5D to your shopping cart!"
 * Example #2: Then the shop should say "Warning: Coupon is either invalid, expired or reached its usage limit!"
 * Example #3: And the shop should say "Success: You have modified products!"
 * Example #4: Then the shop should say "Success: You have changed shipping method!"
 * Example #5: Then the shop should say "Success: Your coupon discount has been applied!"
 */
Then(/^the shop should say "([^"]*)"$/, async function (expected) {
  await h.expectAlert(this, expected);
});

/**
 * An option of the product's page says why the product was not added ("Select required!").
 *
 * Example #1: Then the option "Select" should say "Select required!"
 * Example #2: Then the option "Radio" should say "Radio required!"
 * Example #3: And the option "Checkbox" should say "Checkbox required!"
 * Example #4: Then the option "Text" should say "Text required!"
 * Example #5: Then the option "Delivery Date" should say "Delivery Date required!"
 */
Then(/^the option "([^"]*)" should say "([^"]*)"$/, async function (label, expected) {
  const block = await optionBlock(this, label);
  const read = async () => h.clean(await block.locator('.invalid-feedback, .text-danger').allTextContents().then((t) => t.join(' ')));
  await h.eventually(this.page, read, (text) => h.holds(text, expected), async (text) => ({
    message: `The option "${label}" does not say "${expected}". It says "${text || '(nothing)'}".`,
    hint: 'A required option left empty says so under it once "Add to Cart" is pressed.',
  }), h.budget(this));
});

/**
 * The cart button of the header reads its count and total ("1 item(s) - $122.00").
 *
 * Example #1: Then the cart button should read "1 item(s) - $122.00"
 * Example #2: Then the cart button should read "0 item(s) - $0.00"
 * Example #3: And the cart button should read "3 item(s)"
 * Example #4: Then the cart button should read "2 item(s) - $244.00"
 * Example #5: Then the cart button should read "$602.00"
 */
Then(/^the cart button should read "([^"]*)"$/, async function (expected) {
  const read = () => this.page.evaluate(() => {
    const b = document.querySelector('#cart > .dropdown > button, #cart button');
    return b ? b.textContent.replace(/\s+/g, ' ').trim() : '';
  });
  await h.eventually(this.page, read, (text) => h.holds(text, expected), async (text) => ({
    message: `The cart button does not read "${expected}". It reads "${text || '(no cart button)'}".`,
    hint: 'The header\'s cart button counts the items of the cart and its total; it changes once "Add to Cart" answered.',
  }), h.budget(this));
});
