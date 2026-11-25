// A feature file, a scenario (file:line), a folder or a rerun file named on
// the command line of cucumber-js runs alone: `npx cucumber-js
// tests/features/cart.feature`. cucumber-js 12 adds the paths of the command
// line to the `paths` of this file instead of using them alone, so `paths` is
// left empty when the command line names any, as in webship-js.
const OPTIONS_WITH_A_VALUE = new Set([
  '-c', '--config', '-f', '--format', '--format-options', '--i18n-keywords',
  '-i', '--import', '-l', '--loader', '--language', '--name', '--order',
  '-p', '--profile', '--parallel', '--plugin', '--plugin-options',
  '-r', '--require', '--require-module', '--retry', '--retry-tag-filter',
  '--shard', '-t', '--tags', '--world-parameters',
]);

function commandLinePaths() {
  // Only when cucumber-js itself runs, not when another script reads this file.
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

// The default is the local DDEV shop that .github/scripts/build-ddev-site.sh
// builds (project "opencartsteps"), never a shop of somebody else: the suite
// logs in with the accounts below, fills carts, places orders and edits the catalog.
// LAUNCH_URL points it at another shop.
const launchUrl = (process.env.LAUNCH_URL || 'https://opencartsteps.ddev.site').replace(/\/+$/, '');

/** An account of the users registry: the OC_<HANDLE>_USER, _PASSWORD, _EMAIL and _NAME variables replace its values. */
function account(handle, username, email, name) {
  const env = `OC_${handle.toUpperCase()}`;
  return {
    username: process.env[`${env}_USER`] || username,
    password: process.env[`${env}_PASSWORD`] || 'dD.123123ddd',
    email: process.env[`${env}_EMAIL`] || email,
    name: process.env[`${env}_NAME`] || name,
  };
}

module.exports = {
  default: {
    // The step timeout is webship-js's (45 s, set when it loads): WEBSHIP_STEP_TIMEOUT=<milliseconds> changes it; a `timeout` key here is ignored.
    requireModule: ['tsx/cjs'],
    require: [
      'node_modules/webship-js/tests/step-definitions/**/*.js',          // Webship-js core step definitions (auto HTML report on exit; disable: WEBSHIP_REPORT_DISABLE=1).
      'tests/step-definitions/**/*.js',                                  // This pack (a project lists node_modules/@webship-js/opencart-steps/tests/step-definitions/**/*.js instead).
    ],
    // FEATURES=tests/features/cart.feature,tests/features/checkout.feature runs a subset too.
    paths: process.env.FEATURES ? process.env.FEATURES.split(',') : (commandLinePaths().length ? [] : ['tests/features/**/*.feature']),
    // CUCUMBER_TAGS=@checkout runs a lane. The default leaves out work in progress and the assertions that
    // must fail (tests/check-must-fail.js runs them).
    tags: process.env.CUCUMBER_TAGS || 'not @wip and not @must-fail',
    format: [
      '@cucumber/pretty-formatter',
      // REPORT_NAME=must-fail keeps the report of another run (tests/check-must-fail.js) apart.
      `json:tests/reports/${process.env.REPORT_NAME || 'cucumber_report'}.json`,
    ],
    formatOptions: {
      // Colours follow the terminal (GitHub Actions counts as one); FORCE_COLOR=1
      // or FORCE_COLOR=0 sets them. cucumber-js 12 deprecated `colorsEnabled`.
      theme: {
        'feature keyword': ['bold', 'blue'],
        'feature name': ['blue', 'underline'],
        'feature description': ['blueBright'],
        'scenario keyword': ['bold', 'magenta'],
        'scenario name': ['magenta', 'underline'],
        'step keyword': ['bold', 'green'],
        'step text': ['greenBright', 'italic'],
      },
    },
    worldParameters: {
      launchUrl,
      // The mail catcher the site sends its mail to (the notification steps read it): the Mailpit of the DDEV project.
      mailUrl: process.env.MAIL_URL || `${launchUrl}:8026`,
      // The shop: its language code, the folder of its administration, the account that puts back what a scenario
      // changed (a handle of the users below with the rights over orders, the catalog and coupons), and the order
      // status that voids an order (OpenCart's "Voided").
      shop: {
        language: process.env.SHOP_LANGUAGE || 'en-gb',
        admin: process.env.SHOP_ADMIN || 'admin',
        manager: process.env.SHOP_MANAGER || 'admin',
        voidStatusId: Number(process.env.SHOP_VOID_STATUS_ID || 16),
      },
      // Video of the browser: 'off', 'on', 'on-failure' or 'tag' (scenarios tagged @video; @no-video opts out).
      video: { mode: process.env.WEBSHIP_VIDEO || 'off', dir: './videos', size: { width: 1280, height: 720 }, filenamePattern: '{datetime}.{feature_file}.{scenario}.{status}.{ext}' },
      // JavaScript errors the page raises: 'warn' reports them, 'fail' fails the scenario, 'off' ignores them;
      // @js-fail, @js-warn and @js-off per scenario.
      javascript: { mode: process.env.WEBSHIP_JS_ERROR_MODE || 'warn', levels: ['error'], beforeScenario: false, afterScenario: true },
      // The accounts of the steps, by handle. They are configuration, not test data: the build of the shop creates
      // them (.github/scripts/build-ddev-site.sh, or the Webship Workspace's builder) and a feature never creates
      // or deletes one. In the administration: "admin" (the Administrator group) and "editor" (a group with the
      // catalog's screens only); on the storefront: "customer", who logs in with the address. The name is the one
      // the shop shows.
      users: {
        admin: account('admin', 'administrator', 'administrator@example.com', 'Administrator Test'),
        editor: account('editor', 'editor', 'editor@example.com', 'Editor Test'),
        customer: account('customer', 'customer@example.com', 'customer@example.com', 'Customer Test'),
      },
      minWaitTime: {
        page: 3000,
        before_scenario: 0,
        after_scenario: 0,
        before_step: 0,
        after_step: 0,
      },
      selectors: {
        css: {},
        xpath: {},
        filesPath: './tests/selectors/',
        files: [],
        offset: 60,
        breakpoints: {
          xs:   { width: 375,  height: 667  },
          sm:   { width: 576,  height: 800  },
          md:   { width: 768,  height: 1024 },
          lg:   { width: 992,  height: 768  },
          xl:   { width: 1200, height: 900, default: true },
          xxl:  { width: 1400, height: 900  },
          xxxl: { width: 1920, height: 1080 },
        },
      },
      screenshot: {
        dir: './screenshots',
        purge: false,
        onFailed: true,
        onEveryStep: false,
        alwaysFullscreen: false,
        failedPrefix: 'failed_',
        filenamePattern: '{datetime}.{feature_file}.feature_{step_line}.{ext}',
        filenamePatternFailed: '{failed_prefix}{datetime}.{feature_file}.feature_{step_line}.{ext}',
        infoTypes: '',
      },
    },
  },
};
