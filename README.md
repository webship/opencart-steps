<p align="center"><img src="https://raw.githubusercontent.com/webship/opencart-steps/2.0.x/assets/logo.png" alt="OpenCart logo" width="200"></p>

# opencart-steps

[![Test](https://github.com/webship/opencart-steps/actions/workflows/test.yml/badge.svg)](https://github.com/webship/opencart-steps/actions/workflows/test.yml)

Cucumber step definitions for testing shops built with OpenCart, with
[webship-js](https://webship.co/docs/webship-js/2.0.x), a BDD browser automation harness built on Playwright and
Cucumber-js.

`@webship-js/opencart-steps` covers the storefront, the customer's account and the administration:

- **the storefront**: a category of the menu, the search, the product lists (their products, their order, what a
  product box reads), a product's page (its details, its options, its quantity), "Add to Cart" from the page or from a
  list, the wish list button, the shop's answers and the header's cart button;
- **the cart**: its products with their options, a quantity changed, a product removed, the totals, a coupon applied
  or refused, the cart empty;
- **the checkout**, one page: a guest's details and address (and the fields it refuses), the customer's own address,
  the shipping method and the payment method chosen in their dialogs, the order's summary, "Confirm Order" and the
  page of a placed order;
- **the customer's account**: its pages by the links of "My Account", the address book (an address added and
  deleted, the default), the wish list (a product kept and taken out), the order history (the order the scenario
  placed and its status);
- **the administration**: the login (and a wrong password refused), the account in its header, the dashboard's
  tiles, the menu an account is offered, its lists, a product, a category or a coupon started from "Add New", the
  fields of a form by their labels and tabs, its save and the errors of its fields, a delete from a list, and an
  order: opened, its status, its status changed and its history.

No step phrase names the platform: a scenario reads `When I add the product to the cart` and `Then the order should
be placed`.

CI builds a real shop with [DDEV](https://ddev.com) on the runner: the latest OpenCart 4 from its releases, installed
with its own command-line installer and its demo catalog, the accounts of the suite and the test content. It does
this on PHP 8.3 and on PHP 8.1, and on every push and pull request it runs the whole suite twice, comparing what the
shop holds before and after each run, then the assertions that must fail. See [The test shop](#the-test-shop) and
[`.github/workflows/test.yml`](.github/workflows/test.yml).

## From nothing to a green run

What the machine needs: Docker, [DDEV](https://ddev.com), git, python3, and Node.js 24 or later with npm. PHP, the
database and the mail catcher run in DDEV's containers.

**1. The shop.** The pack's own build script (the one CI runs) makes the shop in a DDEV project of type `php`. It
installs the latest OpenCart 4 with its own command-line installer and its demo catalog, the three accounts of
[Test users](#test-users) and the test content (see [The test shop](#the-test-shop)). It takes about a minute.

```bash
git clone https://github.com/webship/opencart-steps.git
SITE_DIR="$PWD/opencart-shop" opencart-steps/.github/scripts/build-ddev-site.sh
```

The shop answers at `https://opencartsteps.ddev.site/`, its administration at `https://opencartsteps.ddev.site/admin/`.
The accounts are `administrator` and `editor` in the administration and `customer@example.com` on the storefront,
each with the password `dD.123123ddd` (step 3 names them).

In the [Webship Workspace](https://github.com/webship/workspace), its OpenCart plugin builds the same shop instead,
in a sites folder of the workspace: `dev/` here, the one `--with-needs` adds to a new workspace; `test/`,
`sandboxes/` and `demos/` work the same.

```bash
bash core/scripts/plugins.sh --require opencart --with-needs
bash core/scripts/plugins.sh --activate opencart --with-needs
bash core/scripts/plugins.sh --install opencart
bash dev/cmd-opencart-project.sh ocshop --install --add-users --sample-data
```

That shop answers at `https://ocshop.ddev.site/`. `--sample-data` adds the coupon and the payment by bank transfer
the features name. Its accounts are the plugin's: the same three, with the workspace's shared password
`dD.123123ddd`. The workspace's own account is the installer's, one more administrator of the shop.

**2. A test project.**

```bash
mkdir opencart-tests && cd opencart-tests
npm init -y
npm install --save-dev webship-js @webship-js/opencart-steps
npx init-webship-js
```

`npx init-webship-js` writes `cucumber.js`, `playwright.config.ts`, the `tests/` folders with a first feature and the
`npm test` scripts, and installs Chromium. npm usually runs it already when it installs webship-js; a second run changes
nothing.

**3. `cucumber.js`.** Replace the file with the wiring of the pack:

- the step files of webship-js and of the pack;
- the tags that keep the assertions that must fail out of a normal run;
- the address of the shop, and the account that puts back what a scenario changed;
- the accounts (the JSON of [Test users](#test-users)).

The first lines are the starter's own: a feature named on the command line runs alone.

```javascript
// A feature file or a scenario (file:line) named on the command line runs alone:
// cucumber-js 12 would add it to the paths below, so `paths` is left empty then.
const OPTIONS_WITH_A_VALUE = new Set([
  '-c', '--config', '-f', '--format', '--format-options', '--i18n-keywords',
  '-i', '--import', '-l', '--loader', '--language', '--name', '--order',
  '-p', '--profile', '--parallel', '--plugin', '--plugin-options',
  '-r', '--require', '--require-module', '--retry', '--retry-tag-filter',
  '--shard', '-t', '--tags', '--world-parameters',
]);

function commandLinePaths() {
  if (!/cucumber(-js|\.js)?$/.test(String(process.argv[1] || ''))) return [];
  const args = process.argv.slice(2);
  const paths = [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i].startsWith('-')) {
      if (OPTIONS_WITH_A_VALUE.has(args[i])) i += 1;
    } else {
      paths.push(args[i]);
    }
  }
  return paths;
}

const launchUrl = (process.env.LAUNCH_URL || 'https://opencartsteps.ddev.site').replace(/\/+$/, '');

module.exports = {
  default: {
    requireModule: ['tsx/cjs'],
    require: [
      'node_modules/webship-js/tests/step-definitions/**/*.js',
      'node_modules/@webship-js/opencart-steps/tests/step-definitions/**/*.js',
      'tests/step-definitions/**/*.js',
    ],
    paths: commandLinePaths().length ? [] : ['tests/features/**/*.feature'],
    // Work in progress and the assertions that must fail stay out of a normal run.
    tags: process.env.CUCUMBER_TAGS || 'not @wip and not @must-fail',
    format: ['@cucumber/pretty-formatter', 'json:tests/reports/cucumber_report.json'],
    worldParameters: {
      launchUrl,
      // The shop: its language, the folder of its administration, the account that puts back what a scenario
      // changed, and the order status that voids an order.
      shop: { language: 'en-gb', admin: 'admin', manager: 'admin', voidStatusId: 16 },
      // The waits webship-js adds around each page, scenario and step (milliseconds).
      minWaitTime: { page: 3000, before_scenario: 0, after_scenario: 0, before_step: 0, after_step: 0 },
      // The administration's accounts log in with their user name, the customer with its address.
      users: {
        admin: { username: 'administrator', password: 'dD.123123ddd', email: 'administrator@example.com', name: 'Administrator Test' },
        editor: { username: 'editor', password: 'dD.123123ddd', email: 'editor@example.com', name: 'Editor Test' },
        customer: { username: 'customer@example.com', password: 'dD.123123ddd', email: 'customer@example.com', name: 'Customer Test' },
      },
    },
  },
};
```

On a shop from the Webship Workspace (step 1) the accounts are the same; its address goes in `LAUNCH_URL` (step 5).

**4. A first feature**, `tests/features/first-run.feature`:

```gherkin
Feature: First run
  Scenario: A visitor finds a product and puts it in the cart
    When I search the shop for "MacBook"
    Then the product list should show "MacBook Air"
    When I go to the product "iPhone"
    And I add the product to the cart
    Then the cart button should read "1 item(s) - $123.20"

  Scenario: The administrator opens the dashboard
    Given I am logged in to the administration as "admin"
    Then the dashboard should show "Total Customers" as "1"
```

**5. Run it.** Set `LAUNCH_URL` to the address of the shop: `https://opencartsteps.ddev.site` for the build script's
shop, `https://ocshop.ddev.site` for the Workspace's.

```bash
LAUNCH_URL=https://opencartsteps.ddev.site npm test
```

A green first run prints every step, then the summary (the starter feature of `npx init-webship-js` and the two
scenarios above, passed) and the HTML report it wrote:

```
3 scenarios (3 passed)
9 steps (9 passed)
```

From there, copy the features of [`tests/features/`](tests/features/). They also ship in the package, under
`node_modules/@webship-js/opencart-steps/tests/features/`, and together they use every step of the pack. They read no
file of their own, so they run on the build script's shop and on the Workspace's as they are.

### What the suite tests

The features of this repository run every step of the pack against the test shop, twice in a row in CI on every
change, then the assertions that must fail:

- **`storefront.feature`**: a category of the menu and its prices, the search and its order, a product's details,
  its required option asked for and chosen, a quantity, "Add to Cart" from the page and from a list, the header's
  cart button.
- **`cart.feature`**: the products of the cart with their options, a quantity changed and the totals counted again,
  a coupon refused and one applied, products removed until the cart is empty.
- **`checkout.feature`**: a guest's address refused for its e-mail, a guest's order (flat shipping, cash on
  delivery, the summary, the order placed), the customer's order to its own address paid by bank transfer, and the
  order in its history.
- **`account.feature`**: an address added (not the default) and deleted, a product kept in the wish list and taken
  out, the order history of a customer who has not ordered.
- **`administration.feature`**: a wrong password refused, the dashboard, a product made (its errors first) and
  deleted, a category and a coupon made, the customers read, and the catalog editor offered the catalog only.
- **`orders.feature`**: a guest's order opened in the administration, its status changed and its history.

Every scenario puts back what it changes when it ends:

- an order goes the shop's own way: "Voided" through its history first (OpenCart's events take its total out of
  the statistics the dashboard reads, put the stock back and remove a coupon's use), then "Delete" in the orders
  list;
- the cart is emptied with its own "Remove", the wish list with its own, an address added is deleted;
- a product, a category or a coupon a scenario makes goes with its list's own "Delete".

The suite leaves the shop as it found it, and CI checks this with the shop's counts.

Not tested:

- payments through a provider (only cash on delivery and bank transfer: no account anywhere), subscriptions,
  downloads, returns, reward points and vouchers;
- registering an account (the suites never make one), the customer's password and details changed;
- taking a coupon off the cart (on OpenCart 4.1.0.4 its "Remove" does nothing: see
  [How the steps were written](#how-the-steps-were-written));
- the products of the variant and the master, the product images, the CMS, the design and the extensions screens;
- languages other than English (the steps read the shop's words: "Add to Cart", "Your order has been placed!").

## Requirements

- Node.js 24 or later
- A webship-js 2.0 test project (webship-js 2.0.16 or later)
- A shop on OpenCart 4, with accounts on it for the suite

## Install

```bash
npm install --save-dev @webship-js/opencart-steps
```

List the pack's step files in `cucumber.js` after webship-js's.

## What is included

| File | Covers |
| --- | --- |
| `opencart-session.steps.js` | The customer's login to the storefront, an account's login to the administration, a wrong password refused, the account in the administration's header. |
| `opencart-storefront.steps.js` | A category of the menu, the search, the product lists (their products, their order, a product box), a product's page (its details, its options), "Add to Cart" from the page or a list, the wish list button, the shop's answers, the header's cart button. |
| `opencart-cart.steps.js` | The cart's products and options, a quantity changed, a product removed, the totals, a coupon, the cart empty. |
| `opencart-checkout.steps.js` | The checkout: a guest's details and address and the fields it refuses, the customer's own address, the shipping and payment methods, the summary, "Confirm Order", the order placed. |
| `opencart-account.steps.js` | The pages of "My Account", the address book, the order history, the wish list. |
| `opencart-admin.steps.js` | The administration's screens by the menu, the menu offered, the dashboard's tiles, the lists, a product, category or coupon started, the fields of a form, its save and errors, a delete, an order and its status and history. |
| `opencart-defaults.js` | The hooks: the restores a scenario asked for, run when it ends, and the manager's session closed when the run ends. It registers no step. |
| `opencart-helpers.js` | Shared plumbing: the shop's addresses and tokens, the waits, the shop's alerts, the users registry and the logins, the manager's session of the administration and the restores. It registers no step. |

Text, links, fields, buttons, the status code and the headers of a page, and the accessibility audit, are webship-js's
own steps (`I should see "..."`, `I follow "..."`).

## How the steps find things and wait

- **By what a person reads.** A product, a category or a coupon is named by its name; an option, a field or a tab by
  its label; a method of the checkout by its name; an address by a part of it; an account by a handle of the users
  registry; a screen of the administration by its menu item.
- **The shop's tokens.** Every page of the customer's account carries a `customer_token`, every screen of the
  administration a `user_token`: the steps follow the shop's own links (the menu, "My Account"), never an address
  written in a feature.
- **No fixed sleeps.** The steps wait on the shop's own signals:
  - the forms answer by Ajax (jQuery): a step waits for its requests to end (`jQuery.active`) and for the shop's
    answer, an alert ("Success: …", "Warning: …"), which a script the pack adds to every page records as it comes;
  - "Add to Cart" answers with an alert, or with the option it asks for under that option;
  - the cart reloads its list after a quantity, a coupon or a removal;
  - the checkout's methods open in a dialog, loaded once the address is given; "Confirm Order" waits for the page of
    the placed order;
  - a list of the administration is read page by page.
- **What a scenario changes comes back.** Before a step places an order, it notes the shop's last order; when the
  scenario ends, whatever its outcome, the manager's session of the administration voids every order placed since in
  the name of the scenario's buyer (its history, as "Add History" does: OpenCart's events take its total out of the
  statistics, put the stock back and remove a coupon's use), then deletes it from the orders list. The cart of the
  scenario's session is emptied with its own "Remove", a product the wish list got is taken out, an address added is
  deleted, and a product, a category or a coupon a step started is deleted with its list's "Delete".
- **Failures say what was found.** `The product list does not show "iMac". It shows "Apple Cinema 30"", "Canon EOS
  5D", …`, with a hint on where to look.

## Accounts

The suite never creates or deletes an account. Accounts are configuration: list the ones the shop has in
`worldParameters.users`, by a handle the scenarios use, each with its `username` (the customer's is its address) and
its `password`, and its `name` as the shop shows it:

```javascript
users: {
  admin: { username: 'administrator', password: process.env.OC_ADMIN_PASSWORD, name: 'Administrator Test' },
  customer: { username: 'customer@example.com', password: process.env.OC_CUSTOMER_PASSWORD, name: 'Customer Test' },
},
```

The restores need one more thing: `worldParameters.shop.manager`, the handle of an account of the administration
that may change orders, products, categories and coupons (the shop's administrator; `admin` by default).

## Test users

The accounts this repository's suite logs in as, exactly as `cucumber.js` lists them in `worldParameters.users` (the
default values; the `OC_<HANDLE>_USER`, `OC_<HANDLE>_PASSWORD`, `OC_<HANDLE>_EMAIL` and `OC_<HANDLE>_NAME` variables
replace them). The build script makes them; the Workspace's OpenCart plugin makes the same three.

```json
{
  "admin": { "username": "administrator", "password": "dD.123123ddd", "email": "administrator@example.com", "name": "Administrator Test" },
  "editor": { "username": "editor", "password": "dD.123123ddd", "email": "editor@example.com", "name": "Editor Test" },
  "customer": { "username": "customer@example.com", "password": "dD.123123ddd", "email": "customer@example.com", "name": "Customer Test" }
}
```

These are the three accounts and what each has in the shop:

- `admin`: the administration's administrator (the installer's account in the build script), in the "Administrator"
  group: every screen.
- `editor`: in the group "Catalog editor", which may open and change the catalog's screens only (products,
  categories, options, brands, reviews, information pages).
- `customer`: a customer of the storefront, with an address in London as its default.

They are accounts of a throwaway test shop, with a placeholder password, not accounts of any real one.

## The test shop

[`.github/scripts/build-ddev-site.sh`](.github/scripts/build-ddev-site.sh) builds the shop the suite of this repository
runs against, in a DDEV project of type `php` with PHP 8.3 (or `PHP_VERSION`) and Node.js 24. `OPENCART_VERSION`
names another release. The build makes:

- the latest OpenCart 4 from its releases, installed with its own command-line installer (`install/cli_install.php`)
  with its demo catalog, then its `install/` folder removed, as OpenCart asks;
- the three accounts of [Test users](#test-users), and the user group of the catalog editor;
- the test content, written by [`site/shop-site.php`](site/shop-site.php) with OpenCart's own models, started the way
  its own `cron.php` starts the framework:

| What | The test content |
| --- | --- |
| Payments | Bank transfer (its instructions: "Webship Test Bank") beside the demo's cash on delivery |
| Coupon | "Webship Ten", code `WEBSHIP10`: 10% off the products, for anyone, until 2099 (the demo's coupons are disabled and expired) |
| Customer | "Customer Test", `customer@example.com`, its default address: 1 Webship Street, London, Greater London, SW1A 1AA, United Kingdom |
| Demo data | Its addresses (SEO URLs) of products that do not exist go: the first product a run makes would take such an id and replace it |

CI builds it twice, see [`.github/workflows/test.yml`](.github/workflows/test.yml): on PHP 8.3 (with the assertions that
must fail) and on PHP 8.1. Each lane runs the suite twice and compares what the shop holds before the first run and
after each run (`COUNTS_ONLY=1`):

- the products by status, their stock and their options' stock, the categories, their links and the SEO URLs;
- the orders by status, and their products, options, totals, history and subscriptions;
- the coupons and their history, and the statistics the dashboard reads;
- the customers and their addresses, the customer's addresses (and its default), wish list, cart and orders, the
  visitors' carts;
- the reviews and returns, the users and their groups, and the failed logins.

Not counted: the login records (`oc_customer_ip`, `oc_user_login`), which every login writes and no screen of the
shop removes, and the sessions.

After a run that was stopped half way, `RESET_ONLY=1 SITE_DIR="$PWD/opencart-shop"
opencart-steps/.github/scripts/build-ddev-site.sh` puts the shop back as the build left it:

- every order is deleted the storefront's own way (voided first: the stock and the statistics come back);
- the carts, the customer's wish list and the addresses it added go;
- the products, categories and coupons named "Webship test …" go;
- the login records of the suite's accounts go, and the statistics are counted again as the shop's own Reports >
  Statistics counts them.

## Steps

One example of each step; the JSDoc block above each definition holds five.

### `opencart-session.steps.js` (5)

- `Given I am logged in to the shop as "customer"`
- `Given I am logged in to the administration as "admin"`
- `When I log in to the administration with the username "administrator" and the password "wrong"`
- `Then the login should be refused with "No match for Username and/or Password."`
- `Then I should be logged in to the administration as "Administrator Test"`

### `opencart-storefront.steps.js` (14)

- `When I go to the category "Desktops"`
- `When I search the shop for "Apple"`
- `Then the product list should show "Canon EOS 5D"`
- `Then the product list should show "iMac", "MacBook" in this order`
- `Then the product "MacBook" of the list should read "$602.00"`
- `When I go to the product "Canon EOS 5D"`
- `Then the product page should show "Brand" as "Apple"`
- `When I choose "Red" for the option "Select"`
- `When I add the product to the cart`
- `When I add "iPhone" to the cart from the list`
- `When I add the product to my wish list`
- `Then the shop should say "Success: You have added Canon EOS 5D to your shopping cart!"`
- `Then the option "Select" should say "Select required!"`
- `Then the cart button should read "1 item(s) - $122.00"`

### `opencart-cart.steps.js` (7)

- `When I go to the cart`
- `Then the cart should list "Canon EOS 5D"`
- `When I change the quantity of "Canon EOS 5D" in the cart to 2`
- `When I remove "Canon EOS 5D" from the cart`
- `Then the cart should show "Sub-Total" as "$100.00"`
- `When I apply the coupon "WEBSHIP10"`
- `Then the cart should be empty`

### `opencart-checkout.steps.js` (9)

- `When I go to the checkout`
- `When I check out as a guest with:`
- `When I ship to my address "1 Webship Street"`
- `Then the checkout field "E-Mail" should say "E-Mail Address does not appear to be valid!"`
- `When I choose the shipping method "Flat Shipping Rate"`
- `When I choose the payment method "Cash On Delivery"`
- `Then the order summary should show "Total" as "$130.00"`
- `When I confirm the order`
- `Then the order should be placed`

### `opencart-account.steps.js` (7)

- `When I open "Address Book" in my account`
- `Then my address book should list "1 Webship Street"`
- `When I add the address:`
- `When I delete the address "3 Webship Lane"`
- `Then my order history should list my order as "Pending"`
- `Then my wish list should list "iPhone"`
- `When I remove "iPhone" from my wish list`

### `opencart-admin.steps.js` (14)

- `When I go to "Products" in the administration`
- `Then the administration menu should offer "Products"`
- `Then the dashboard should show "Total Orders" as "0"`
- `Then the administration list should show "Canon EOS 5D"`
- `When I start a new product "Webship test product"`
- `When I set "Model" to "WT-1" in the "Data" tab`
- `When I save the form`
- `Then the field "Model" should say "Product Model must be greater than 1 and less than 64 characters!"`
- `When I delete the product "Webship test product" in the administration`
- `Given there is no product "Webship test product"`
- `When I open the order I placed in the administration`
- `Then the order status should be "Pending"`
- `When I change the order status to "Processing"`
- `Then the order history should list "Processing"`
## Phrases shared with other packs

None of this pack's phrases matches one of webship-js (`npm run test:examples` checks it). The platform packs are
not meant to be loaded together (one `cucumber.js` profile per system). Loaded beside each of the
44 packs published so far, these phrases of this pack also match one of theirs, most of them
with the other shops' packs (Magento, PrestaShop, WooCommerce, Shopify):

| Phrase of this pack | Also in |
| --- | --- |
| `the login should be refused with "…"` | aspnet-core, discourse, django, keycloak, mautic, mediawiki, nextcloud, payload, phpbb, spring-boot, strapi, wagtail |
| `I add the product to the cart` | magento, odoo, prestashop, shopify, squarespace, webflow, woocommerce |
| `I set "…" to "…"` | django, filament, mautic, payload, strapi, wagtail |
| `I save the form` | django, filament, magento, mautic, odoo |
| `I remove "…" from the cart` | magento, prestashop, shopify, woocommerce |
| `the cart should be empty` | prestashop, shopify, webflow, woocommerce |
| `the order status should be "…"` | magento, prestashop, woocommerce |
| `I apply the coupon "…"` | magento, woocommerce |
| `I change the order status to "…"` | prestashop, woocommerce |
| `I delete the address "…"` | magento, prestashop |
| `I go to the cart` | magento, woocommerce |
| `I go to the checkout` | magento, woocommerce |
| `I search the shop for "…"` | odoo, prestashop |
| `there is no product "…"` | magento, woocommerce |
| `I add the address:` | magento |
| `I add the product to my wish list` | magento |
| `I choose the payment method "…"` | prestashop |
| `I go to the category "…"` | discourse |
| `I remove "…" from my wish list` | magento |
| `there is no category "…"` | mautic |

## OpenCart's own tests and this pack

OpenCart 4.1 ships no test suite of its own. Its 3.0 branch keeps the suite the project had (`tests/phpunit/`):
unit tests of its models and Selenium tests of the storefront. Their flows are the logic these steps check on a 4.1
shop, through the pages a person uses:

| OpenCart's own tests (3.0) | In this pack |
| --- | --- |
| `selenium/catalog/ProductTest.php`: the search box finds a product; "Add to Cart" and the cart's total; the quantity field; the wish list and compare buttons answer | `storefront.feature`, `cart.feature`, `account.feature`: the search and its order, "Add to Cart" with a quantity and the cart's totals, the wish list kept and taken out |
| `selenium/catalog/CategoryTest.php`: "Add to Cart" from a category; a product with options opens its page | `storefront.feature`: "Add to Cart" from the list, the required option asked for |
| `selenium/catalog/CheckoutTest.php`: two products in the cart, a quantity updated, a product removed | `cart.feature`: the products and their options, a new quantity and the totals, products removed until the cart is empty |
| `selenium/catalog/AccountTest.php`: an address added and edited, a login that works and one refused | `account.feature`, `administration.feature`: an address added and deleted; a wrong password refused (in the administration: a refused login of the storefront is recorded against the account) |
| `opencart/catalog/model/checkout/OrderTest.php`: an order added with its products and totals, its status changed | `checkout.feature`, `orders.feature`: orders placed as a guest and as the customer, opened in the administration, their status changed |

## Testing this package

```bash
npm ci
npm run test:examples    # every step's JSDoc examples match it and nothing else; every feature step resolves
npm run test:paths       # a feature named on the command line runs alone
npx cucumber-js --dry-run
SITE_DIR="$PWD/../opencart-shop" .github/scripts/build-ddev-site.sh
npx cucumber-js          # the whole suite
npm run test:must-fail   # the assertions that must fail, each with its message and a hint
PHP_VERSION=8.1 SITE_DIR="$PWD/../opencart-shop-81" .github/scripts/build-ddev-site.sh
npx cucumber-js
```

The second build makes a project of the same name, so remove the first one before it (`ddev delete -Oy opencartsteps`).

## How the steps were written

Every step was written from a round of manual testing of the real local shop in the browser first. Each page it
touches was opened as the account the step works as, its lists, labels and messages were noted, and the signal it
gives while it works was found: the Ajax answers of the forms, the alert the shop shows (above the content, or above
the address book's list), the checkout's dialogs and the address it needs first, the tokens of the account and the
administration.

That round, and the counts of the shop before and after each run, found what the steps and their restores must
handle:

- an order moves the statistics the dashboard reads ("Total Orders", "Total Sales") and the stock of its products,
  and the administration's "Delete" leaves both: the order is voided first, as its "Add History" does;
- the cart, the wish list and the addresses of the customer are kept in the shop's database, not in the browser;
- the demo data keeps the address (SEO URL) of a product that does not exist, which the first product a run makes
  replaces;
- every login writes a record no screen removes (the customer's address, the administration's login);
- on OpenCart 4.1.0.4 the cart's "Remove" of "Use Coupon Code" does nothing: the page's handler of the rows' Remove
  links catches every red button of the cart, that one among them; and the message of a removed coupon is missing
  from the shop's English (it answers `text_remove`). No step takes a coupon off; a coupon stays in the session
  only;
- the demo's Apple Cinema 30" asks for a file among its options, and its name holds a double quote: the features use
  the Canon EOS 5D as the product with options;
- the MacBook needs no shipping, so its checkout has no shipping method: the features order an iPhone.

## License

MIT, see [LICENSE](LICENSE).

## Logo

The logo in this README is the OpenCart logo the release ships (`upload/image/catalog/opencart-logo.png` of OpenCart
4.1.0.4, part of OpenCart under GPL-3.0). It stays under that licence, and is not part of the npm package. Simple
Icons, the source of most packs' logos, has none for OpenCart. The OpenCart name and logo belong to their owner; this
pack is not affiliated with or endorsed by them.
