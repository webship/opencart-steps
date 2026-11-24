@storefront
Feature: The storefront: categories, the search and a product
  As a visitor of the shop
  I want to find a product and put it in my cart
  So that I can buy it

  Scenario: A category of the menu lists its products with their prices
    Given I am on the category "Desktops"
    Then the product list should show "Canon EOS 5D"
    And the product "MacBook" of the list should read "$602.00"
    And the product "MacBook" of the list should read "Ex Tax: $500.00"
    And the product "iPhone" of the list should not read "$602.00"

  Scenario: The search keeps the products whose name holds the words
    When I search the shop for "MacBook"
    Then the product list should show "MacBook", "MacBook Air", "MacBook Pro" in this order
    And the product list should not show "Canon EOS 5D"

  Scenario: A product page shows its details, and asks for its required option
    Given I am on the product "Canon EOS 5D"
    Then the product page should show "Brand" as "Canon"
    And the product page should show "Availability" as "In Stock"
    When I add the product to the cart
    Then the option "Select" should say "Select required!"
    And the cart button should read "0 item(s) - $0.00"
    When I choose "Red" for the option "Select"
    And I add the product to the cart with a quantity of 2
    Then the shop should say "Success: You have added Canon EOS 5D to your shopping cart!"
    And the cart button should read "2 item(s) - $242.00"

  Scenario: A product with no option goes to the cart from its list
    Given I am on the category "Desktops"
    When I add "iPhone" to the cart from the list
    Then the shop should say "Success: You have added iPhone to your shopping cart!"
    And the cart button should read "1 item(s) - $123.20"
