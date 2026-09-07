# 0017 rationale

## Context

Operators want to plan two weeks of posts by talking first. Full access was treating those asks as unclear publish intent. Autonomy scheduled in the same turn with no research. Setup DeepSeek research only guessed competitors from a JSON prompt. It did not browse.

## Options considered

### Option 1: Prompt only

Tell Thesean to discuss and remember. No new table, no search.

This fails when history is trimmed and when the model skips research.

### Option 2: Thesean or Tavily search

Add a third search vendor.

The operator already chose DeepSeek for every web search.

### Option 3: Conversation plan plus DeepSeek Responses search

Store one plan per conversation. Use DeepSeek `web_search` on discuss turns and on do it all after the short brief.

## Rationale

Option 3 keeps mission in the profile note and the working plan in Postgres so later schedule turns still see the agreement. DeepSeek Responses `web_search` is real search on the same key as setup. Do it all still searches so captions follow trends and how people actually write, not generic AI posts.
