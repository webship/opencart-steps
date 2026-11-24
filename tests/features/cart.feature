@cart
Feature: The cart: its products, their quantities, a coupon and the totals
  As a visitor of the shop
  I want to change what my cart holds and use a coupon
  So that I pay what I mean to

  Scenario: The cart lists the products with their options, and counts a new quantity
    Given I am on the product "Canon EOS 5D"
    When I choose "Red" for the option "Select"
    And I add the product to the cart
    And I go to the product "iPhone"
    And I add the product to the cart with a quantity of 2
    When I go to the cart
    Then the cart should list "Canon EOS 5D" with "Select: Red"
    And the cart should list "iPhone"
    And the cart should show "Sub-Total" as "$302.00"
    When I change the quantity of "Canon EOS 5D" in the cart to 2
    Then the shop should say "Success: You have modified your shopping cart!"
    And the cart should show "Sub-Total" as "$402.00"
    And the cart should show "Total" as "$486.40"

  Scenario: A coupon of the shop takes its share off, and an unknown one is refused
    Given I am on the product "iPhone"
    When I add the product to the cart with a quantity of 2
    And I go to the cart
    And I apply the coupon "NO-SUCH-CODE"
    Then the shop should say "Warning: Coupon is either invalid, expired or reached its usage limit!"
    And the cart should not show "Coupon (WEBSHIP10)"
    When I apply the coupon "WEBSHIP10"
    Then the shop should say "Success: Your coupon discount has been applied!"
    And the cart should show "Coupon (WEBSHIP10)" as "$-20.20"

  Scenario: Products removed one by one leave the cart empty
    Given I am on the product "iPhone"
    When I add the product to the cart
    And I go to the product "MacBook"
    And I add the product to the cart
    And I go to the cart
    When I remove "iPhone" from the cart
    Then the cart should not list "iPhone"
    And the cart should list "MacBook"
    When I remove "MacBook" from the cart
    Then the cart should be empty
