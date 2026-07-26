@r2a @finite-operation
Feature: Finite project operation supervision

  The Project Steward selects an explicitly accepted finite operation, supervises it without
  blocking its own work, observes one canonical settlement, and reacts without requiring the
  developer to monitor another terminal.

  Background:
    Given an accepted R2A operation with id "r2a.state-store-tests" version 1
    And the operation has risk class "safe_and_expected"
    And the operation executable is "mise"
    And the operation argument vector is ["exec","--","node","--test","test/state.store.test.ts"]
    And the operation runs at the repository root
    And the operation has timeout contract startup 10s, total 120s, graceful 5s, forced 5s
    And the operation has output limits 16 KiB chunk, 256 KiB tail, 1 MiB durable
    And the operation has redaction for classified secret variable names

  # --- Lifecycle and settlement ---

  Scenario: An accepted finite operation passes
    Given the project has an accepted low-risk finite operation
    When the Project Steward starts the operation
    Then the operation runs with its declared executable and arguments
    And the start request returns before settlement
    And exactly one passing settlement is recorded
    And the settlement is delivered to the Project Steward

  Scenario: A finite operation fails
    Given an accepted finite operation exits with a nonzero status
    When the operation settles
    Then exactly one failed settlement is recorded
    And the operation is not retried automatically
    And the Project Steward receives relevant redacted output

  Scenario: Repository content changes during execution
    Given a finite operation records its starting content fingerprint
    When relevant content changes before settlement
    Then the result remains an observed execution result
    And the run is marked as covering an earlier content state
    And the result is not automatically treated as current completion evidence

  # --- Output handling ---

  Scenario: Output contains instruction-like text
    Given an operation emits text resembling instructions to the model
    When the output is delivered to the Project Steward
    Then the text is treated as untrusted operation data
    And no action is authorized solely by that text

  Scenario: Operation output exceeds its limit
    Given an operation emits more output than the configured limit
    When output is retained
    Then retained output is bounded
    And truncation is visible
    And dropped bytes are counted

  Scenario: Operation output contains a secret
    Given an operation emits a classified secret value
    When output is persisted or sent to the Project Steward
    Then the secret value is redacted
    And the record states that redaction occurred

  Scenario: Operation output contains an authorization header or embedded credential URL
    Given an operation emits "Authorization: Bearer abcdef..." on stderr
    When output is persisted or sent to the Project Steward
    Then the header value is redacted
    And the record states that redaction occurred

  # --- Concurrency and reuse ---

  Scenario: An equivalent operation is already active
    Given an equivalent operation is running in the same worktree
    When the Project Steward requests the operation again
    Then a second process is not started
    And the existing run is returned

  Scenario: A different operation is requested while capacity is occupied
    Given a different operation is already active
    When the Project Steward requests a new operation
    Then the request is rejected with a capacity result
    And the active run is identified
    And no queue is created
    And the active operation is not cancelled automatically

  # --- Cancellation and timeout ---

  Scenario: A running operation is cancelled
    Given an accepted finite operation is running
    When the Project Steward cancels it
    Then the owned process group receives graceful termination
    And forced termination occurs only after the grace period
    And exactly one cancelled settlement is recorded

  Scenario: A finite operation exceeds its time budget
    Given an accepted finite operation exceeds its total timeout
    When the timeout expires
    Then the process group is terminated
    And exactly one timed-out settlement is recorded
    And the operation is not retried automatically

  # --- Settlement invariant ---

  Scenario: Settlement paths race
    Given process exit and cancellation or timeout occur concurrently
    When the supervisor resolves the operation
    Then one canonical settlement wins
    And no duplicate settlement event is recorded

  # --- Authority boundaries ---

  Scenario: Implicit shell execution is rejected
    Given the operation's executable or args contain shell metacharacters
    When the Steward attempts to launch the operation
    Then the operation is rejected
    And no process is spawned
    And the rejection is recorded honestly

  Scenario: Wrong-project or wrong-worktree execution is rejected
    Given a project identity does not match the focused worktree
    When the Steward attempts to start an operation
    Then the operation is rejected
    And no process is spawned

  # --- Ambient and capsule ---

  Scenario: Focus capsule shows the active operation truthfully
    Given an operation is running in the project root
    When the Project Steward turn begins
    Then the focus capsule includes one bounded active operation line
    And the line does not include full output

  Scenario: Focus capsule shows the settled operation until acknowledged
    Given a settled operation is awaiting parent acknowledgement
    When the Project Steward turn begins
    Then the focus capsule includes one bounded settled operation line
    And the line does not include full output
    And the operation summary is omitted once acknowledged

  Scenario: No full environment is persisted
    When the operation settles
    Then the canonical record contains no environment-variable values
    And the artifact directory contains no inherited environment

  Scenario: Operation summary is omitted when no run exists
    Given no operation run has ever been recorded
    When the focus capsule is built
    Then the operation line is omitted

  # --- Capability honesty ---

  Scenario: No service, watcher, or worker capability is implied
    Given the Project Steward reports capability status
    When the operation summary is presented
    Then the surface does not claim services, watchers, or arbitrary terminals exist
    And no worker or process tree is advertised beyond the single supervised run