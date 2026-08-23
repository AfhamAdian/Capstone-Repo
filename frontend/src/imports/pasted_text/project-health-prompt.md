# Figma Make Prompt: Project Health Tracking Platform

Design a web based dashboard product for CEOs, CTOs, and other executive decision makers who each oversee multiple software projects at once, both in active development and in deployed maintenance. The product gives them a fast read on project health, a record of management actions taken to fix problems, and a feedback loop through periodic team surveys. Prioritize data density, scannability, and trust in the numbers over decoration. This is an executive tool used in short, frequent check ins, not a tool people sit in for long sessions, so clarity beats novelty everywhere.

## Core concept

The product is a closed loop, not three separate tools. A metric drops, a survey explains why, a management action gets logged to fix it, and the outcome shows back up as a metric improvement. Every screen should make this loop visible: a flagged metric should link directly to its related survey and let the user log an action against it without losing context.

## Users and entry point

The primary user oversees several projects. The very first thing they see after logging in is not one project, it is all of them.

### Screen 1: Portfolio Overview (home)

A grid or list of project cards, one per project. Default sort is worst health score first, so the projects needing attention surface automatically without the user hunting for them. Include sort and filter controls (by health score, by team, by status, by "has pending review"). Each project card shows: project name, composite health score as a large number, a trend arrow and small sparkline, a badge if there is a pending survey result or an unreviewed action awaiting an effectiveness rating, and a last updated timestamp. Clicking a card opens that project's dashboard. Keep this screen scannable at a glance for someone managing ten or more projects, favor a dense card grid or compact table toggle over large illustrated cards.

Once inside a project, place a persistent project switcher (dropdown with search) in the top navigation bar so the user can jump between projects without returning to the portfolio screen each time.

## Per project navigation

Inside a project, use a left sidebar or top tab bar with four sections: Dashboard, Actions, Surveys, Settings. Keep it to these four, do not give Metrics, Past Actions, and Survey equal flat weight as disconnected tabs, the navigation should make the loop between them feel like one connected system.

### Screen 2: Project Dashboard (Metrics)

Top of page: one composite Project Health Score, large, with a trend indicator and sparkline. Make the score expandable or hoverable to reveal its weighted breakdown, never present it as an unexplained black box number.

Below it, a radar chart showing category subscores (velocity, code quality, blockers, and morale once survey data exists), so the user can see at a glance whether the project is balanced or one category is dragging the rest down.

Below that, a grid of stat cards for raw metrics (commits, tickets closed, sprint velocity, open blockers), each with its own small sparkline, clickable into a full time series chart.

Include a shared date range control (relative buttons: 7 days, 30 days, 90 days, all time, plus a custom range picker) at the top of this screen. Reuse this exact same control on the Actions timeline screen so the two stay mentally linked.

Any metric card that is flagged low or has triggered a survey should show a small link or badge: "Survey sent" or "Action logged," clicking through to that record.

### Screen 3: Actions, Log entry

A side panel or modal triggered by a clear "Log Action" button. Fields: Problem (free text), Reason (free text), Action Taken (free text), timestamp (defaults to now, editable), and an optional category tag.

As the user types into the Problem field, show a live side panel that surfaces similar past problems and what was done about them, updating as they type with a short debounce. This inline suggestion panel is the single most important interaction in the whole product, design it to feel like GitHub's duplicate issue detection or Linear's related issues, not like a separate search tool the user has to navigate away to use.

### Screen 4: Actions, Timeline

A Score vs Time line chart with a range brush control underneath it: a mini timeline strip with two draggable handles, the same pattern used in TradingView or Mixpanel date range selectors. As the brush range changes, two things update together on the same screen: action markers plotted on the main chart within that range (clickable into a popover showing reason, description, and who logged it), and a row of contextual stats above or beside the chart (commits, tickets completed, team activity for that window). Do not split markers and contextual stats into separate tabs, the value of this screen is seeing correlation between action and outcome at a glance.

### Screen 5: Actions, Rubric Library

A separate page listing all past actions as a searchable, filterable table or card list (filter by category, problem type, recency). Include a prominent search bar at the top powered by semantic search, this is where someone goes to research precedent before a new problem hits, separate from the inline suggestions during entry.

### Screen 6: Effectiveness Review

Not a blocking popup. A small "X actions pending your review" card on the Dashboard, opening a lightweight panel with a quick 1 to 5 rating per action when the user chooses to engage. Design this as a notification style inbox item, never a modal interrupt.

### Screen 7: Surveys, Overview

A list of surveys: active, sent, and completed, each tied back to the metric or trigger that caused it. Include a manual "Request a pulse now" button for the user to trigger an ad hoc survey outside the automatic triggers.

### Screen 8: Surveys, Results

LLM generated theme summaries at the top ("3 of 5 responses point to a blocked dependency from Team B"), with an option to drill into raw anonymized responses below. Visually tie this screen back to the metric that triggered the survey, with a link or breadcrumb back to the Dashboard.

### Screen 9: Surveys, Take Survey (recipient facing, separate lightweight flow)

A single question per screen flow with a progress indicator and a skip option per question, opened from an emailed link, no login required. Show a time estimate ("about 2 minutes") at the start. Keep this screen visually distinct and minimal, it is filled out by individual contributors on mobile as often as desktop.

### Screen 10: Settings

Team mapping per project (who gets survey links), survey question bank management, and notification preferences.

## Visual direction

Clean enterprise dashboard aesthetic. Favor clear data visualization (sparklines, radar charts, stat cards) over illustration or marketing style visuals. High information density is acceptable and expected given the audience, but maintain clear visual hierarchy so the health score and flagged items are always the first thing the eye lands on, on both the Portfolio Overview and the per project Dashboard.