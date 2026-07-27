Feature: Bounded background operation visibility
  The Project Steward can start one accepted repository-check operation by ID,
  remain useful while it runs, and receive exactly one settlement without polling.
  Active presentation is truthful only when the current runtime owns a live process.

  Background:
    Given DEC-23 is accepted
    And NF-20 is the valid focused work item
    And no accepted operation is active

  Scenario: Start the accepted repository checks operation
    When the Steward requests "r2b.repository-checks" by operation ID only
    Then the operation runs "mise" with arguments "exec", "--", "npm", "run", "verify"
    And its immutable work-item owner is "NF-20"
    And the start returns before settlement
    And no verification receipt or claim support is created automatically

  Scenario: Show one runtime-owned active operation
    Given the canonical run is starting or running
    And the current runtime owns the reservation or process
    And a running process is live
    Then the ordinary Pi widget shows an active operation indicator
    And the Steward Console Focus view shows the label, lifecycle, elapsed snapshot, and owner
    And neither surface shows raw output, argv, PID, paths, or environment values

  Scenario: Refuse to present stale canonical state as active
    Given the canonical run is starting or running
    And the current runtime owns no reservation or live process for the run
    Then the shared projection requires reconciliation
    And neither the widget nor the Console calls the operation active
    And another start is denied
    And no run is cleared or adopted automatically
    And Doctor surfaces the reconciliation requirement

  Scenario: Settle once at a natural parent boundary
    Given the accepted operation is active
    When the child process exits
    Then one bounded settlement becomes pending delivery
    And no settlement is injected into an active model stream
    And the next parent turn receives that settlement exactly once
    And acknowledgement removes the active or pending presentation
    And no retry, list, wait, poll, follow, or tail behavior occurs

  Scenario: Share one-operation capacity with R2A
    Given "r2a.state-store-tests" is active
    When the Steward requests "r2b.repository-checks"
    Then admission denies the different operation without creating a run or process
    And an equivalent current-runtime-owned request reuses its existing run
