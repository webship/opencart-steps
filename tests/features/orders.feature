@orders
Feature: An order in the administration
  As the shop's staff
  I want to open an order and move it along
  So that the buyer gets what was ordered

  Scenario: A guest's order opened in the administration, its status changed
    Given I am on the product "iPhone"
    When I add the product to the cart
    And I go to the checkout
    And I check out as a guest with:
      | First Name     | Guest             |
      | Last Name      | Buyer             |
      | E-Mail         | buyer@example.com |
      | Address 1      | 4 Webship Road    |
      | City           | London            |
      | Post Code      | SW1A 4AA          |
      | Country        | United Kingdom    |
      | Region / State | Greater London    |
    And I choose the shipping method "Flat Shipping Rate"
    And I choose the payment method "Cash On Delivery"
    And I confirm the order
    Then the order should be placed
    Given I am logged in to the administration as "admin"
    Then the dashboard should show "Total Orders" as "1"
    When I open the order I placed in the administration
    Then the order status should be "Pending"
    And the order history should not list "Processing"
    When I change the order status to "Processing"
    Then the shop should say "Success: You have modified orders!"
    And the order history should list "Processing"
    And the order status should be "Processing"
