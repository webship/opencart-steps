@must-fail
Feature: Assertions of the account and the administration that must fail
  Each scenario asserts something that is not true on the test shop: its last step must fail with the message its
  description announces, and a hint. The scenarios only read; tests/check-must-fail.js runs them.

  Scenario: An address the address book does not list
    Fails with: The address book does not list "9 Nowhere Road".
    Given I am logged in to the shop as "customer"
    When I open "Address Book" in my account
    Then my address book should list "9 Nowhere Road"

  Scenario: A page the account does not have
    Fails with: "My Account" has no link "Webship test nothing".
    Given I am logged in to the shop as "customer"
    When I open "Webship test nothing" in my account

  Scenario: A wish list that does not hold the product
    Fails with: The wish list does not list "iPhone".
    Given I am logged in to the shop as "customer"
    When I open "Wish List" in my account
    Then my wish list should list "iPhone"

  Scenario: An order history that is empty
    Fails with: The order history does not list the order of this scenario as "Pending".
    Given I am logged in to the shop as "customer"
    When I open "Order History" in my account
    Then my order history should list my order as "Pending"

  Scenario: A login that is not refused
    Fails with: The login was not refused: the administration opened
    When I log in to the administration with the username "administrator" and the password "dD.123123ddd"
    Then the login should be refused with "No match for Username and/or Password."

  Scenario: Another account in the header
    Fails with: The administration does not show "Editor Test" as the account logged in.
    Given I am logged in to the administration as "admin"
    Then I should be logged in to the administration as "Editor Test"

  Scenario: Another count of a tile of the dashboard
    Fails with: The dashboard does not show "Total Customers" as "99".
    Given I am logged in to the administration as "admin"
    Then the dashboard should show "Total Customers" as "99"

  Scenario: A row the list does not show
    Fails with: The list does not show "Webship test nothing".
    Given I am logged in to the administration as "admin"
    When I go to "Products" in the administration
    Then the administration list should show "Webship test nothing"

  Scenario: A screen the editor's menu does not offer
    Fails with: The administration's menu has no "Orders" for this account.
    Given I am logged in to the administration as "editor"
    When I go to "Orders" in the administration

  Scenario: An item the editor's menu does not offer
    Fails with: The administration's menu does not offer "Customers".
    Given I am logged in to the administration as "editor"
    Then the administration menu should offer "Customers"

  Scenario: A field the form does not have
    Fails with: The form has no field "Colour" in the tab "Data".
    Given I am logged in to the administration as "admin"
    When I go to "Products" in the administration
    And I start a new product "Webship test product"
    When I set "Colour" to "Red" in the "Data" tab

  Scenario: An order that was not placed in the scenario
    Fails with: This scenario placed no order.
    Given I am logged in to the administration as "admin"
    When I open the order I placed in the administration
