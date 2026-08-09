# 0012 Rationale: Chat schedule loop

## Context

Calendar and Scheduled Posts display SocialMCP schedules, but chat could not call `schedule_post`. Operators could only draft (`prepare_review`) or go through live publish authority. Product vision already assumes the model returns `schedule_post` decisions.

## Options considered

### Option 1: Expose `schedule_post` in chat with schedule intent (chosen)

**Pros**: Matches MASTER_PLAN; reuses preview and calendar; thin Tracer Bullet.

**Cons**: Multi day campaigns stay manual until SOC-39.

### Option 2: Neon schedule store written from chat

**Pros**: Rich product queries.

**Cons**: Dual write with SocialMCP; rejected by 0010/0011.

### Option 3: Wait for SOC-39 planner only

**Pros**: One big feature later.

**Cons**: Blocks simple “schedule this Friday” now.

## Rationale

Option 1 unlocks the missing create path without a second schedule database. Intent gains `schedule` so live auto publish stays distinct. Media and clarify rules stay product owned.
