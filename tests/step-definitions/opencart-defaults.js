'use strict';

// The pack's hooks. It registers no step.
//
//   1. Before each scenario: the lists of what the scenario will ask to be put back, and the recorder of the shop's
//      alerts on the scenario's page.
//   2. After each scenario, whatever its outcome: those restores, newest first, then the late ones (the orders the
//      scenario placed: voided, then deleted). One that fails is reported, and the others still run.
//   3. After the run: the manager's session of the administration is closed.

const { Before, After, AfterAll } = require('@cucumber/cucumber');
const h = require('./opencart-helpers');

Before(async function () {
  this.shopScenarioStartedAt = Date.now();
  this.shopCleanup = [];
  this.shopLateCleanup = [];
  this.shopOrders = null;
  this.__customerToken = null;
  this.__userToken = null;
  if (this.page) await h.recordAlerts(this.page);
});

After({ timeout: 240000 }, async function () {
  const jobs = [...(this.shopCleanup || []).slice().reverse(), ...(this.shopLateCleanup || [])];
  this.shopCleanup = [];
  this.shopLateCleanup = [];
  const failures = [];
  for (const job of jobs) {
    try {
      await job();
    } catch (err) {
      failures.push(err && err.message ? err.message : String(err));
    }
  }
  if (failures.length) {
    // eslint-disable-next-line no-console
    console.warn(`What the scenario changed was not all put back: ${failures.join(' | ')}`);
  }
});

AfterAll(async function () {
  await h.managerEnd();
});
