@account
Feature: The customer's account: the address book, the wish list, the order history
  As a customer of the shop
  I want to keep my addresses and the products I like
  So that I buy faster next time

  Scenario: An address added to the address book, then deleted
    Given I am logged in to the shop as "customer"
    When I open "Address Book" in my account
    Then my address book should list "1 Webship Street" as the default
    When I add the address:
      | First Name      | Customer           |
      | Last Name       | Test               |
      | Address 1       | 3 Webship Lane     |
      | City            | Manchester         |
      | Post Code       | M1 1AE             |
      | Country         | United Kingdom     |
      | Region / State  | Greater Manchester |
      | Default Address | No                 |
    Then the shop should say "Your address has been successfully added"
    And my address book should list "3 Webship Lane"
    And my address book should list "1 Webship Street" as the default
    When I delete the address "3 Webship Lane"
    Then the shop should say "Your address has been successfully deleted"
    And my address book should not list "3 Webship Lane"

  Scenario: A product kept in the wish list, then taken out
    Given I am logged in to the shop as "customer"
    When I go to the product "iPhone"
    And I add the product to my wish list
    Then the shop should say "Success: You have added iPhone to your wish list!"
    When I open "Wish List" in my account
    Then my wish list should list "iPhone"
    When I remove "iPhone" from my wish list
    Then my wish list should not list "iPhone"

  Scenario: The order history of a customer who has not ordered yet
    Given I am logged in to the shop as "customer"
    When I open "Order History" in my account
    Then my order history should be empty
