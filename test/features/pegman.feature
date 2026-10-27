@browser
Feature: Pegman examples with Leaflet 1.9.4 and 2.0.0-alpha.1 and real GoogleMutant 0.16.0

  @issue-6 @issue-7 @issue-12
  Scenario Outline: Controls, coverage, panorama and marker use the public bundle
    Given the "<bundle>" plugin and its dependencies are loaded
    When I add a Pegman control
    Then clicking the control toggles coverage
    And clicking the map opens a panorama and synchronizes the marker
    And Escape and the panorama close button clear Street View
    Examples:
      | bundle   |
      | readable |
      | minified |

  @issue-4 @issue-9 @issue-10 @issue-13
  Scenario: Lazy control can be removed before external scripts load
    Given a lazy Pegman control
    Then removing and readding it before loading dependencies is safe

  @issue-8 @issue-13
  Scenario: Lazy dependency callbacks initialize only once
    Given a lazy Pegman control
    Then unused lazy controls do not load Google dependencies
    When I request Street View before dependencies load
    Then the mocked lazy services open one panorama

  @issue-13
  Scenario: Preloaded Google dependencies initialize services eagerly
    Given the "readable" plugin and its dependencies are loaded
    When I add a Pegman control
    Then preloaded Google services are initialized before interaction

  @issue-11
  Scenario Outline: Invalid locations keep Pegman placed until explicitly cleared
    Given the "<bundle>" plugin and its dependencies are loaded
    When I add a Pegman control
    Then an invalid location warns without opening a panorama and Escape docks Pegman
    Examples:
      | bundle   |
      | readable |
      | minified |

  @issue-3 @issue-4 @issue-6 @issue-7 @issue-9 @issue-10
  Scenario: Removal cleans handlers and preserves a detached panorama
    Given the "readable" plugin and its dependencies are loaded
    Then removing and readding a detached control cleans its lifecycle

  @issue-4
  Scenario: A delayed Street View response cannot resurrect a removed control
    Given the "readable" plugin and its dependencies are loaded
    Then delayed service callbacks after removal are ignored

  Scenario: Drag and drop callbacks use Leaflet coordinates
    Given the "readable" plugin and its dependencies are loaded
    When I add a Pegman control
    Then dragging Pegman activates coverage and selects the drop location

  Scenario: Legacy sprite paths remain usable
    Given the "minified" plugin and its dependencies are loaded
    Then both public stylesheets retain the original image URLs

  @issue-12
  Scenario Outline: Coverage preserves the basemap and survives reactivation
    Given the "<bundle>" plugin and its dependencies are loaded
    When I add a Pegman control
    Then local coverage tiles can be sampled for the mouse cursor
    Examples:
      | bundle   |
      | readable |
      | minified |
