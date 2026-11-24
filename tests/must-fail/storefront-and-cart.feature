@must-fail
Feature: Assertions of the storefront, a product and the cart that must fail
  Each scenario asserts something that is not true on the test shop: its last step must fail with the message its
  description announces, and a hint. What a scenario puts in the cart goes when it ends; tests/check-must-fail.js
  runs them.

  Scenario: A category the menu does not have
    Fails with: The shop's menu has no category "Webship test nothing".
    When I go to the category "Webship test nothing"

  Scenario: A product the list does not show
    Fails with: The product list does not show "Webship test nothing".
    Given I am on the category "Desktops"
    Then the product list should show "Webship test nothing"

  Scenario: A product the list shows
    Fails with: The product list shows "MacBook".
    When I search the shop for "MacBook"
    Then the product list should not show "MacBook"

  Scenario: The products in another order
    Fails with: The product list does not show "MacBook Pro", "MacBook" in this order.
    When I search the shop for "MacBook"
    Then the product list should show "MacBook Pro", "MacBook" in this order

  Scenario: A price the product box does not read
    Fails with: The product "MacBook" of the list does not read "$1.00".
    Given I am on the category "Desktops"
    Then the product "MacBook" of the list should read "$1.00"

  Scenario: A product the shop does not have
    Fails with: The shop has no product "Webship test nothing": its search finds
    When I go to the product "Webship test nothing"

  Scenario: A detail the product page does not show
    Fails with: The product page does not show "Brand" as "Apple".
    Given I am on the product "Canon EOS 5D"
    Then the product page should show "Brand" as "Apple"

  Scenario: An option the product does not have
    Fails with: The product has no option "Colour".
    Given I am on the product "Canon EOS 5D"
    When I choose "Red" for the option "Colour"

  Scenario: Another answer of the shop
    Fails with: The shop does not say "Success: You have added a pony to your shopping cart!".
    Given I am on the product "iPhone"
    When I add the product to the cart
    Then the shop should say "Success: You have added a pony to your shopping cart!"

  Scenario: Another count of the cart button
    Fails with: The cart button does not read "9 item(s)".
    Given I am on the product "iPhone"
    When I add the product to the cart
    Then the cart button should read "9 item(s)"

  Scenario: A product the cart does not list
    Fails with: The cart does not list "MacBook". It lists "iPhone".
    Given I am on the product "iPhone"
    When I add the product to the cart
    And I go to the cart
    Then the cart should list "MacBook"

  Scenario: Another total of the cart
    Fails with: The cart does not show "Sub-Total" as "$1.00".
    Given I am on the product "iPhone"
    When I add the product to the cart
    And I go to the cart
    Then the cart should show "Sub-Total" as "$1.00"

  Scenario: An empty cart that is not
    Fails with: The cart is not empty: it lists "iPhone".
    Given I am on the product "iPhone"
    When I add the product to the cart
    And I go to the cart
    Then the cart should be empty
