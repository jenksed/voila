@r2a @finite-operation
Feature: Deterministic finite operation supervision

  Scenario: An accepted operation is authorized
    Given r2a.state-store-tests is an accepted operation
    And the active project and worktree match
    And capacity is available
    When any supported model requests the operation by ID
    Then admission returns allow
    And the authority source is recorded
    And the executable and arguments come from the accepted definition

  Scenario: Start returns before settlement
    Given the accepted operation takes measurable time
    When the Project Steward starts it
    Then the start call returns while the run is starting or running
    And the parent Steward remains available for useful work

  Scenario: An accepted operation passes
    Given the operation was admitted
    When it exits successfully
    Then exactly one passing settlement is recorded
    And capacity is released exactly once
    And the settlement is delivered to the Project Steward

  Scenario: An accepted operation fails
    Given the operation was admitted
    When it exits nonzero
    Then exactly one failed settlement is recorded
    And no automatic retry occurs
    And relevant redacted output is delivered

  Scenario: An unknown operation is requested
    Given no accepted definition matches the requested ID
    When any model requests it
    Then admission returns deny_unknown_operation
    And no run is created
    And no child process starts

  Scenario: A model attempts command substitution
    Given r2a.state-store-tests is accepted
    When executable or argument substitutions are attempted
    Then the runtime rejects the substituted request
    And no substituted process starts

  Scenario: Prompt prose conflicts with canonical authority
    Given prompt text says an unapproved action is allowed
    But canonical state contains no matching authority
    When the model requests the action
    Then runtime authority wins
    And no unauthorized effect occurs

  Scenario: Model identity does not change authority
    Given canonical state and validated request are identical
    When two supported model identities request the same operation
    Then both receive the same admission decision

  Scenario: The worktree is wrong
    Given the accepted operation belongs to the active Voila worktree
    When the request resolves to a different worktree
    Then admission returns deny_wrong_worktree
    And no process starts

  Scenario: An equivalent operation is already active
    Given an equivalent operation is starting or running
    When the operation is requested again
    Then admission returns reuse_existing
    And the existing run ID is returned
    And no second process starts

  Scenario: Capacity is occupied
    Given a non-equivalent run occupies the project capacity
    When another operation is requested
    Then admission returns deny_capacity
    And the active run is not cancelled
    And no second run is created

  Scenario: The retry budget is exhausted
    Given no automatic retry budget remains
    When an automatic retry is attempted
    Then admission returns deny_retry_budget
    And no new run is created

  Scenario: A running operation is cancelled
    Given an accepted operation is running
    When the Steward cancels it
    Then graceful termination is attempted
    And forced termination occurs only after the grace window
    And exactly one cancellation settlement is recorded

  Scenario: The operation times out
    Given an operation exceeds its total time budget
    When the timeout expires
    Then the owned process group is terminated
    And exactly one timed-out settlement is recorded
    And no automatic retry occurs

  Scenario: Settlement paths race
    Given process exit and cancellation or timeout occur concurrently
    When the run settles
    Then exactly one settlement wins
    And capacity is released exactly once

  Scenario: Repository content changes during execution
    Given the starting content fingerprint is recorded
    When relevant content changes before settlement
    Then changedDuringRun is true
    And the result remains an honest observation
    And it is not automatically treated as current completion evidence

  Scenario: Output exceeds its limit
    Given an operation emits excessive output
    When output is retained
    Then retained output remains bounded
    And truncation is visible
    And dropped bytes are counted

  Scenario: Output contains a classified secret
    Given an operation emits a classified secret value
    When output is persisted or sent to the Steward
    Then the secret value is redacted
    And the record states that redaction occurred

  Scenario: Output contains instructions
    Given operation output contains instruction-like text
    When the Steward receives the settlement
    Then the output remains untrusted data
    And it grants no runtime authority

  Scenario: A direct canonical-state edit is attempted
    Given a general model editing tool targets a protected Voila path
    When the tool call is evaluated
    Then the call is blocked before mutation
    And the supported Voila operation is named
