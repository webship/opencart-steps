#!/usr/bin/env bash
# Build the shop this repository's suite runs against, in a DDEV project of type php:
#   - the latest OpenCart 4 from its releases (or OPENCART_VERSION), installed with its own command-line installer
#     (install/cli_install.php) with its demo catalog, then its install folder removed, as it asks;
#   - the accounts of the suite: in the administration, the installer's administrator and an editor of a user group
#     with the catalog's rights only; on the storefront, a customer with an address;
#   - the test content (site/shop-site.php): bank transfer beside cash on delivery, and the customer's first order.
#
# Usage: SITE_DIR=/path/to/shop .github/scripts/build-ddev-site.sh
#   SITE_DIR          where the DDEV project goes (required)
#   OPENCART_VERSION  a release of OpenCart 4 (default: the latest)
#   PHP_VERSION       the PHP of the web container (default: 8.3)
#   RESET_ONLY        1: build nothing; put the shop back as the build left it (after a stopped run)
#   COUNTS_ONLY       1: build nothing; print the counts a test run must leave as it found them
#
# The accounts are configuration: this script creates them and cucumber.js names them; the features never create or
# delete one.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PROJECT_NAME="${PROJECT_NAME:-opencartsteps}"
PHP_VERSION="${PHP_VERSION:-8.3}"
SITE_DIR="${SITE_DIR:?SITE_DIR names the folder of the DDEV project}"
PASSWORD='dD.123123ddd'

# The shop's own data, written and read with OpenCart's own models (site/shop-site.php), in the web container.
shop_site() {
  cp "$REPO_DIR/site/shop-site.php" upload/.webship-shop-site.php
  ddev exec php upload/.webship-shop-site.php "$@" < /dev/null
  local status=$?
  rm -f upload/.webship-shop-site.php
  return $status
}

if [ "${RESET_ONLY:-}" = "1" ] || [ "${COUNTS_ONLY:-}" = "1" ]; then
  cd "$SITE_DIR"
  if [ "${RESET_ONLY:-}" = "1" ]; then
    # The orders first, the storefront's own way (voided: the stock and the statistics come back), then the rest.
    shop_site reset-orders
    shop_site reset
    echo "The shop is back as the build left it."
  else
    shop_site counts
  fi
  exit 0
fi

# The latest release of OpenCart 4 (GitHub's API, with the workflow's token when there is one, so a shared runner's
# address is not refused), else the release this pack was proven on.
if [ -z "${OPENCART_VERSION:-}" ]; then
  OPENCART_VERSION="$(curl -fsSL ${GITHUB_TOKEN:+-H "Authorization: Bearer ${GITHUB_TOKEN}"} 'https://api.github.com/repos/opencart/opencart/releases?per_page=20' 2>/dev/null \
    | python3 -c 'import json,sys; tags=[r["tag_name"] for r in json.load(sys.stdin) if not r["prerelease"] and r["tag_name"].startswith("4.")]; print(sorted(tags, key=lambda t: [int(x) for x in t.split(".")])[-1])' 2>/dev/null || true)"
  OPENCART_VERSION="${OPENCART_VERSION:-4.1.0.4}"
fi

mkdir -p "$SITE_DIR"
cd "$SITE_DIR"
ddev config --project-type=php --docroot=upload --php-version="$PHP_VERSION" --nodejs-version=24 --project-name="$PROJECT_NAME" --auto < /dev/null
ddev start -y < /dev/null
SITE_URL="https://${PROJECT_NAME}.ddev.site"

# OpenCart from its release: the upload folder is the web root.
ddev exec "curl -fsSL https://github.com/opencart/opencart/releases/download/${OPENCART_VERSION}/opencart-${OPENCART_VERSION}.zip -o /tmp/opencart.zip && rm -rf /tmp/opencart && mkdir -p /tmp/opencart && unzip -q /tmp/opencart.zip -d /tmp/opencart && cp -a /tmp/opencart/upload/. upload/ && rm -rf /tmp/opencart /tmp/opencart.zip" < /dev/null
ddev exec "cp upload/config-dist.php upload/config.php && cp upload/admin/config-dist.php upload/admin/config.php" < /dev/null

# The installer: the shop, its demo catalog, and the administrator.
ddev exec php upload/install/cli_install.php install \
  --username administrator --email administrator@example.com --password "$PASSWORD" \
  --http_server "${SITE_URL}/" --language en-gb \
  --db_driver mysqli --db_hostname db --db_username db --db_password db --db_database db --db_port 3306 --db_prefix oc_ < /dev/null
# OpenCart asks for its install folder to go once the shop is installed.
ddev exec rm -rf upload/install < /dev/null

# The accounts and the test content.
shop_site content

echo "Built the shop at ${SITE_URL}: OpenCart ${OPENCART_VERSION}, PHP $(ddev exec php -r 'echo PHP_VERSION;' < /dev/null)"
if [ -n "${GITHUB_ENV:-}" ]; then
  echo "LAUNCH_URL=${SITE_URL}" >> "$GITHUB_ENV"
fi
