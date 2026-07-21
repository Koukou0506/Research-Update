# Topic Selection Empty-State Fix

## Goal

When a topic card reports one or more recent papers, selecting it must show those topic papers instead of an empty daily-selection panel.

## Scope

- Keep the existing daily selection unchanged when no topic is selected.
- On topic selection, load the existing seven-day topic detail endpoint and show its returned papers in the right-hand panel.
- Selecting the active topic again, or using the topic close control, restores the daily selection.
- Preserve favorite and read actions for papers shown in the topic panel.
- Do not change favorites navigation, topic generation, topic counts, ranking, or the topic detail endpoint.

## Architecture and Data Flow

The client API gains a typed `getTopicDetail(id, windowDays)` method for the existing `GET /api/radar/topics/:id` route. `App` owns the selected topic's loading state and paper result. `TopicRadar` continues to emit only a selected topic ID.

With no selected topic, `App` renders `DailySelection` exactly as it does today. With a selected topic, `App` requests its seven-day detail and renders the returned papers with the existing `PaperFeed` component. This avoids filtering the ten daily papers against a topic whose representative papers may be outside that daily set.

## States and Error Handling

- While topic details are loading, the right-hand panel shows the existing loading label.
- A successful empty result uses the existing no-papers message.
- If the request fails, the topic panel uses the no-papers state and remains recoverable by selecting another topic or clearing the selection.
- Stale responses must not replace a newer topic selection.

## Testing

- Add an application regression test where the daily paper and topic representative paper are different.
- Verify that selecting the non-empty topic shows its representative paper and does not leave the panel blank.
- Verify the topic detail API is requested with a seven-day window.
- Run the focused client tests, the full test suite, and the production build.
