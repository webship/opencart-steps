'use strict';

// The sessions: the customer's login to the storefront, an account's login to the administration, the
// administration's refusal of a wrong password, and who is logged in.
//
// Accounts are configuration, not test data: they are listed in cucumber.js (`worldParameters.users`) and made
// once by the build of the shop. A feature never creates or deletes an account.

const { Given, When, Then } = require('@cucumber/cucumber');
const { friendly } = require('webship-js/tests/step-definitions/webship');
const h = require('./opencart-helpers');

/**
 * Log in to the storefront as an account of the users registry, by its handle, through the shop's login form (the
 * customer logs in with its address). The account's pages then carry the session's token.
 *
 * Example #1: Given I am logged in to the shop as "customer"
 * Example #2: Given we are logged in to the shop as "customer"
 * Example #3: And I am logged in to the shop as "customer"
 * Example #4: Given I log in to the shop as "customer"
 * Example #5: When I log in to the shop as "customer"
 */
Given(/^(?:(?:I am|we are) logged in|(?:I|we) log in) to the shop as "([^"]*)"$/, { timeout: 120000 }, async function (handle) {
  await h.logInShop(this, handle);
});

/**
 * Log in to the administration as an account of the users registry, by its handle, through its login form. Its
 * screens then carry the session's token.
 *
 * Example #1: Given I am logged in to the administration as "admin"
 * Example #2: Given we are logged in to the administration as "editor"
 * Example #3: And I am logged in to the administration as "admin"
 * Example #4: Given I log in to the administration as "editor"
 * Example #5: When I log in to the administration as "admin"
 */
Given(/^(?:(?:I am|we are) logged in|(?:I|we) log in) to the administration as "([^"]*)"$/, { timeout: 120000 }, async function (handle) {
  await h.logInAdmin(this, handle);
});

/**
 * Send the administration's login form with a user name and a password. The step does not expect the login to
 * work: assert the outcome with the next step. A refused login of the administration is not recorded by the shop.
 *
 * Example #1: When I log in to the administration with the username "administrator" and the password "wrong"
 * Example #2: When we log in to the administration with the username "nobody" and the password "Wrong-password-1"
 * Example #3: And I log in to the administration with the username "editor" and the password "not-the-password"
 * Example #4: When I log in to the administration with the username "administrator" and the password "dD.123123ddd"
 * Example #5: When I log in to the administration with the username "" and the password ""
 */
When(/^(?:I|we) log in to the administration with the username "([^"]*)" and the password "([^"]*)"$/, { timeout: 120000 }, async function (username, password) {
  await this.page.context().clearCookies();
  this.__adminLogin = await h.submitAdminLogin(this, username, password);
});

/**
 * The login form refused the last login, with a message of the shop.
 *
 * Example #1: Then the login should be refused with "No match for Username and/or Password."
 * Example #2: Then the login should be refused with "No match for Username"
 * Example #3: And the login should be refused with "Password."
 * Example #4: Then the login should be refused with "No match"
 * Example #5: Then the login should be refused with "No match for Username and/or Password"
 */
Then(/^the login should be refused with "([^"]*)"$/, async function (expected) {
  const outcome = this.__adminLogin;
  if (!outcome) throw friendly({ message: 'No login was sent in this scenario.', hint: 'Send one first: When I log in to the administration with the username "…" and the password "…".' });
  if (outcome.ok) throw friendly({ message: `The login was not refused: the administration opened (${h.shown(this.page.url())}).`, hint: 'The user name and the password are an account of the shop.' });
  if (!outcome.said.some((s) => h.holds(s, expected))) {
    throw friendly({ message: `The login was refused, but not with "${expected}". The form says ${h.listed(outcome.said)}.`, hint: 'The login form of the administration answers in the box above the form.' });
  }
});

/**
 * The administration shows an account as the one logged in: the name in its header.
 *
 * Example #1: Then I should be logged in to the administration as "Administrator Test"
 * Example #2: Then we should be logged in to the administration as "Editor Test"
 * Example #3: And I should be logged in to the administration as "Administrator"
 * Example #4: Then I should be logged in to the administration as "Editor"
 * Example #5: Then I should be logged in to the administration as "Test"
 */
Then(/^(?:I|we) should be logged in to the administration as "([^"]*)"$/, async function (name) {
  const read = () => this.page.evaluate(() => {
    const el = document.querySelector('#nav-profile a.nav-link');
    if (!el) return '';
    const img = el.querySelector('img');
    return `${el.textContent} ${img ? img.getAttribute('title') || '' : ''}`;
  });
  await h.eventually(this.page, read, (text) => h.holds(text, name), async (text) => ({
    message: `The administration does not show "${name}" as the account logged in. Its header shows "${h.clean(text) || '(nobody)'}" (${await h.pageSummary(this)}).`,
    hint: 'The header of the administration names the account logged in: its first and last name.',
  }), h.budget(this));
});
