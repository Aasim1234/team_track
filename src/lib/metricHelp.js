// What each Team Performance number means, in one place so the member profile
// and the team table always explain a metric the same way.
export const METRIC_HELP = {
  assigned: 'Total test cases currently assigned to this user.',
  completed: 'Assigned test cases that the user has completed or closed.',
  inProgress: 'Assigned test cases where the user has started execution and recorded a result, but the task is not yet completed.',
  notStarted: 'Assigned test cases that the user has not started executing yet.',
  overdue: 'Assigned test cases whose due date has passed but the task is still not completed.',
  tasksCompletedToday: 'Number of assigned tasks completed today.',
  testsExecutedToday: 'Number of test cases executed by the user today.',
  passedToday: 'Tests executed today with a Pass result.',
  failedToday: 'Tests executed today with a Fail result.',
  blockedToday: 'Tests executed today with a Blocked result.',
  testsExecuted: 'Total test cases executed by this user.',
  bugsReported: "Total failed/blocked test results recorded by this user, according to the application's bug-reporting logic.",
  bugsFixed: "Total results moved from Fail/Blocked back to Pass, according to the application's current logic.",
  passRate: "Percentage of the user's executed tests that resulted in Pass.",
  actionsToday: 'Total important QA actions performed by the user today, including test execution, result updates, task completion, comments, assignments, and other tracked activities.',
}
