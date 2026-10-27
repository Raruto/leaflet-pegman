@browser
Feature: Pegman examples with Leaflet 1.9.4 and 2.0.0-alpha.1 and real GoogleMutant 0.16.0
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

  Scenario: Lazy control can be removed before external scripts load
    Given a lazy Pegman control
    Then removing and readding it before loading dependencies is safe

  Scenario: Lazy dependency callbacks initialize only once
    Given a lazy Pegman control
    When I request Street View before dependencies load
    Then the mocked lazy services open one panorama

  Scenario: Removal cleans handlers and preserves a detached panorama
    Given the "readable" plugin and its dependencies are loaded
    Then removing and readding a detached control cleans its lifecycle

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

  Scenario: Coverage tile sampling still matches GoogleMutant's tile structure
    Given the "readable" plugin and its dependencies are loaded
    When I add a Pegman control
    Then local coverage tiles can be sampled for the mouse cursor
